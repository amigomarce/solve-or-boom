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
import { takeSeat, leaveSeat, type Room } from './room';
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
}
/** The lobby. */
export interface Lobby {
  /** Handles a hello: seats the student (or gives the old seat back) and answers `joined`, or an error (`name_empty`, `sin_cupo`). */
  hello(connId: number, name: string, rejoin: boolean): void;
  /** The student says goodbye: the seat is a bot again at once and the name is free. */
  leave(connId: number): void;
  /** The connection closed: the seat is held for rejoin_grace_s. */
  dropped(connId: number): void;
  /** True while this connection has a seat. */
  has(connId: number): boolean;
  /** Frees the seats whose grace ran out and pushes the rooms whose state changed. Call it every few hundred ms. */
  tick(): void;
  /** Students on the server now (connected or held). */
  count(): number;
}

/** A student: the unique name, the seat, and the connection (null while the seat is held). */
interface Student { name: string; key: string; room: Room; seat: number; connId: number | null; holdUntilS: number }

/**
 * The lobby over the given rooms.
 * @example const lobby = createLobby({ rejoinGraceS: 120, maxName: 20 }, { rooms, clockMs, log, send, isAlive, close }); lobby.hello(1, 'Ana', false);
 */
export function createLobby(lim: LobbyLimits, deps: LobbyDeps): Lobby {
  const byKey = new Map<string, Student>(), byConn = new Map<number, Student>();
  const nowS = (): number => deps.clockMs() / 1000;
  const keyOf = (name: string): string => name.toLocaleLowerCase('es');
  const stateOf = (room: Room): RoomView['state'] => (room.status === 'running' && deps.rooms.get(room.id) === room ? 'running' : 'ended');
  const view = (room: Room): RoomView => ({
    roomId: room.id, state: stateOf(room),
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
    hello(connId, name, rejoin) {
      const current = byConn.get(connId);
      if (current) { joined(current); return; } // a repeated hello on a seated connection just repeats the answer
      const old = byKey.get(keyOf(name));
      if (old) {
        const live = old.room.status === 'running' && deps.rooms.get(old.room.id) === old.room;
        const takeable = old.connId === null || (rejoin && !deps.isAlive(old.connId));
        if (!live) release(old);
        else if (takeable) {
          if (old.connId !== null) { byConn.delete(old.connId); deps.close(old.connId); }
          old.connId = connId; old.holdUntilS = 0; byConn.set(connId, old);
          old.room.seats[old.seat].owner = connId;
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
        const st: Student = { name: uniqueName, key: keyOf(uniqueName), room, seat: seat.index, connId, holdUntilS: 0 };
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
      st.holdUntilS = nowS() + lim.rejoinGraceS; // the seat stays the student's (and shown as theirs) until tick() runs out the grace
    },
    has: connId => byConn.has(connId),
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
