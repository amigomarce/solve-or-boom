// The lobby: who is on the server, in which room and seat. A hello puts a student in the first room with a
// seat no student holds (balancing the two teams), a dropped connection keeps its seat for rejoin_grace_s,
// and every change is pushed to the room's students as a `room` message.
//
// "The same student" is the name alone (no accounts): a hello with the name a student holds, while their
// seat is still held, gets that seat back. Two different people who type the same name are two students
// when the first is connected ("Ana", "Ana (2)"), but if the first one's connection dropped the second takes
// the seat that was held for them. That is accepted; nothing but a name identifies anybody.
// Names live in memory only and are never logged: the log lines here carry connection ids and counts.
import { PROTOCOL_VERSION, errorMessage, type ErrorCode, type JoinedMessage, type RoomMessage, type RoomView, type SeatView, type ServerMessage } from '../net/protocol';
import { SEATS_PER_TEAM, type TeacherStudent } from '../net/protocol';
import { takeSeat, leaveSeat, setPresent, type Room } from './room';
import type { Rooms } from './rooms';

/** The lobby's settings (data/aula.json). */
export interface LobbyLimits { rejoinGraceS: number; maxName: number }
/** What the lobby needs from the network side and the outside. */
export interface LobbyDeps {
  rooms: Rooms; clockMs: () => number; log: (line: string) => void;
  /** Sends a message to one connection (dropped when it is closed). */
  send: (connId: number, msg: ServerMessage) => void;
  /** False when the connection missed its last ping answer (it is probably dead). */
  isAlive: (connId: number) => boolean;
  /** Closes a connection (used when a rejoin takes over a dead one's seat). */
  close: (connId: number) => void;
  /** Makes the connection's next snapshot round send it a fresh `begin` (it changed seat or room). */
  rebegin: (connId: number) => void;
}
/** The lobby. */
export interface Lobby {
  /** Handles a hello: seats the student (or gives the old seat back) and answers `joined`, or an error (`name_empty`, `sin_cupo`). */
  hello(connId: number, name: string, rejoin: boolean, token?: string): void;
  /** The student says goodbye: the seat is a bot again at once and the name is free. */
  leave(connId: number): void;
  /** The connection closed: the seat is held for rejoin_grace_s. */
  dropped(connId: number): void;
  /** True while this connection has a seat. */
  has(connId: number): boolean;
  /** The room and seat this connection plays, if it has one. */
  where(connId: number): { room: Room; seat: number } | undefined;
  /** Frees the seats whose grace ran out and pushes the rooms whose state changed. Call it every few hundred ms. */
  tick(): void;
  /** Students on the server now (connected or held). */
  count(): number;
  /** Every student, in join order, for the teacher screen (names stay in memory). */
  list(): TeacherStudent[];
  /** The id the teacher screen uses for the student at this connection, if seated. */
  idOf(connId: number): number | undefined;
  /**
   * Teacher: moves a student to a free seat of `team` in room `roomId` (the given seat, else the team's lowest
   * free one; in a Free for All room the team is ignored and the lowest free seat is taken). The student gets a new `joined`; both rooms' students get the new seating. Returns an error
   * sentence in Spanish, or '' when done.
   */
  move(id: number, roomId: string, team: number, seat?: number): string;
  /** Pushes a room's seating and state to its connected students (call after the room's status changed). */
  refresh(room: Room): void;
}

/** A student: the unique name, the seat, and the connection (null while the seat is held). */
interface Student { id: number; name: string; key: string; token: string; room: Room; seat: number; connId: number | null; holdUntilS: number }

/**
 * The lobby over the given rooms.
 * @example const lobby = createLobby({ rejoinGraceS: 120, maxName: 20 }, { rooms, clockMs, log, send, isAlive, close }); lobby.hello(1, 'Ana', false);
 */
export function createLobby(lim: LobbyLimits, deps: LobbyDeps): Lobby {
  const byKey = new Map<string, Student>(), byConn = new Map<number, Student>();
  let madeIds = 0;
  const nowS = (): number => deps.clockMs() / 1000;
  const keyOf = (name: string): string => name.toLocaleLowerCase('es');
  const stateOf = (room: Room): RoomView['state'] => (deps.rooms.get(room.id) === room && (room.status === 'running' || room.status === 'waiting' || room.status === 'paused') ? room.status : 'ended');
  const view = (room: Room): RoomView => ({
    roomId: room.id, state: stateOf(room), mode: room.match.opts.mode, // 'bomb', 'ffa' or 'duel' (story 024)
    seats: room.seats.map((s): SeatView => (s.kind === 'human' && s.name !== null
      ? { index: s.index, team: s.team, kind: 'human', name: s.name } : { index: s.index, team: s.team, kind: 'bot', name: `Bot ${s.index + 1}` })),
  });
  /** Pushes the room's seating to its connected students, except `skip`. */
  const push = (room: Room, skip = -1): void => {
    const msg: RoomMessage = { v: PROTOCOL_VERSION, t: 'room', ...view(room) };
    for (const st of byConn.values()) if (st.room === room && st.connId !== skip) deps.send(st.connId!, msg);
  };
  const joined = (st: Student): void => {
    const seat = st.room.seats[st.seat];
    const msg: JoinedMessage = { v: PROTOCOL_VERSION, t: 'joined', you: { name: st.name, room: st.room.id, seat: st.seat, team: seat.team }, room: view(st.room) };
    deps.send(st.connId!, msg);
  };
  /** Forgets a student and frees their seat (the seat is a bot again). */
  const release = (st: Student): void => {
    leaveSeat(st.room, st.room.seats[st.seat].owner!, nowS());
    byKey.delete(st.key);
    if (st.connId !== null) byConn.delete(st.connId);
  };
  const fail = (connId: number, code: ErrorCode): void => deps.send(connId, errorMessage(code));
  /** Name made unique on this server: "Ana", "Ana (2)", "Ana (3)"... cut to fit maxName. */
  const unique = (name: string): string => {
    for (let n = 1; ; n++) {
      const suffix = n === 1 ? '' : ` (${n})`;
      const candidate = name.slice(0, lim.maxName - suffix.length).trimEnd() + suffix;
      if (!byKey.has(keyOf(candidate))) return candidate;
    }
  };

  return {
    hello(connId, name, rejoin, token = '') {
      const current = byConn.get(connId);
      if (current) { joined(current); return; } // a repeated hello on a seated connection just repeats the answer
      const old = byKey.get(keyOf(name));
      if (old) {
        const live = stateOf(old.room) !== 'ended';
        const same = !old.token || old.token === token; // only the browser that held the seat takes it back (protocol 9)
        const takeable = same && (old.connId === null || (rejoin && !deps.isAlive(old.connId)));
        if (!live) release(old);
        else if (takeable) {
          if (old.connId !== null) { byConn.delete(old.connId); deps.close(old.connId); }
          old.connId = connId; old.holdUntilS = 0; byConn.set(connId, old);
          old.room.seats[old.seat].owner = connId;
          setPresent(old.room, old.seat, true);
          joined(old); push(old.room, connId);
          deps.log(`Conexión ${connId} recupera su asiento en ${old.room.id}`);
          return;
        }
      }
      const uniqueName = unique(name);
      for (const info of deps.rooms.list()) {
        const room = deps.rooms.get(info.id)!;
        const seat = takeSeat(room, connId, uniqueName);
        if (!seat) continue;
        const st: Student = { id: ++madeIds, name: uniqueName, key: keyOf(uniqueName), token, room, seat: seat.index, connId, holdUntilS: 0 };
        byKey.set(st.key, st); byConn.set(connId, st);
        joined(st); push(room, connId);
        deps.log(`Conexión ${connId} ocupa el asiento ${seat.index} de ${room.id} (equipo ${seat.team})`);
        return;
      }
      fail(connId, 'sin_cupo');
    },
    leave(connId) {
      const st = byConn.get(connId);
      if (!st) return;
      release(st); push(st.room);
      deps.log(`Conexión ${connId} deja el asiento ${st.seat} de ${st.room.id}`);
    },
    dropped(connId) {
      const st = byConn.get(connId);
      if (!st) return;
      byConn.delete(connId); st.connId = null;
      setPresent(st.room, st.seat, false); // a bot plays the seat until they come back
      st.holdUntilS = nowS() + lim.rejoinGraceS; // the seat stays the student's (and shown as theirs) until tick() runs out the grace
    },
    has: connId => byConn.has(connId),
    idOf: connId => byConn.get(connId)?.id,
    refresh: room => push(room),
    list: () => [...byKey.values()].sort((a, b) => a.id - b.id).map((st): TeacherStudent => ({
      id: st.id, name: st.name, connected: st.connId !== null, room: st.room.id, seat: st.seat, team: st.room.seats[st.seat].team })),
    move(id, roomId, team, seat) {
      const st = [...byKey.values()].find(x => x.id === id), to = deps.rooms.get(roomId);
      if (!st) return 'Ese alumno ya no está conectado.';
      if (!to) return 'Esa sala no existe o ya terminó.';
      const coop = to.match.opts.mode === 'waves'; // story 025: Oleadas cooperativas: the team is ignored, only seats 0..3
      const ffa = to.match.opts.mode === 'ffa' || coop; // story 023: Free for All has no teams, so the team asked is ignored and any free seat does
      if (!ffa && seat !== undefined && Math.floor(seat / SEATS_PER_TEAM) !== team) return 'Ese asiento no es del equipo elegido.';
      const free = to.seats.filter(s => s.kind !== 'human' && ((ffa && (!coop || s.team === 0)) || s.team === team) && (seat === undefined || s.index === seat));
      if (!free.length) return seat === undefined ? (ffa ? 'Esa sala no tiene sitio libre.' : 'Ese equipo no tiene sitio libre.') : 'Ese asiento está ocupado.';
      const from = st.room, owner = from.seats[st.seat].owner!;
      leaveSeat(from, owner, nowS());
      const taken = takeSeat(to, owner, st.name, free[0].index)!;
      st.room = to; st.seat = taken.index;
      if (st.connId === null) setPresent(to, taken.index, false); // held: a bot plays until they come back
      else { deps.rebegin(st.connId); joined(st); }
      if (from !== to) push(from, st.connId ?? -1);
      push(to, st.connId ?? -1);
      return '';
    },
    where: connId => { const st = byConn.get(connId); return st ? { room: st.room, seat: st.seat } : undefined; },
    count: () => byKey.size,
    tick() {
      const t = nowS(), changed = new Set<Room>(), all = [...byKey.values()];
      // A room that closed: tell its connected students once (before any seat is freed), then they may say hello again.
      for (const room of new Set(all.map(st => st.room))) if (stateOf(room) === 'ended') push(room);
      for (const st of all) {
        const ended = stateOf(st.room) === 'ended';
        if (!ended && !(st.connId === null && t >= st.holdUntilS)) continue;
        release(st);
        if (!ended) { changed.add(st.room); deps.log(`El asiento ${st.seat} de ${st.room.id} vuelve a ser un bot (se acabó el plazo)`); }
      }
      for (const room of changed) push(room);
    },
  };
}
