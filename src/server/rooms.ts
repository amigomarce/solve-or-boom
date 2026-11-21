// The rooms the server runs, and the small API the teacher screen (story 006) will call: create a room,
// end one, list them. One timer drives every room: each tick credits each room the real time that passed
// and runs the fixed steps it owes, a few at most per room, round-robin, within a time budget, so a slow
// room cannot starve the others. An exception in a room fails that room only.
import { STEP } from '../game/match';
import { MAP_IDS } from '../game/map';
import { newRoom, stepRoom, roomInfo, voteView, votersOf, type Room, type RoomSpec, type PlayLimits } from './room';
import type { GameModeId, RoomInfo, VoteView } from '../net/protocol';
import type { Results } from './results';

/** The limits the manager runs with (data/aula.json). */
export interface RoomLimits { tickBudgetMs: number; maxCatchupSteps: number; maxBacklogSteps: number; emptyGraceS: number; /** Seconds a teacher room's vote window lasts (rematch_vote_s). */ voteS: number; play: PlayLimits }
/** What the manager needs from outside: a clock in ms and two logs (plain and rate-limited). */
export interface RoomDeps { clockMs: () => number; log: (line: string) => void; warn: (kind: string, line: string) => void; /** Where students' counts go (memory only); omit for rooms that count nothing. */ results?: Results }

/** The room manager. */
export interface Rooms {
  /** Creates and starts a room; the missing choices take the defaults (a random seed, math, Medio, bots only, rematch). */
  create(spec?: Partial<RoomSpec>): Room;
  /** Teacher control: 'start' a waiting room, 'pause' a running one, 'resume' a paused one. False when the room is not in the state the action needs. */
  transition(id: string, action: 'start' | 'pause' | 'resume'): boolean;
  /** Drops a room that never played (a waiting one the teacher replaced) without recording it as finished. False when there is no such room. */
  remove(id: string): boolean;
  /** Every live room (waiting, running or paused). */
  all(): Room[];
  /**
   * Ends a room's match now, with a reason. A teacher room (managed) is kept: its students get their results, a copy of it goes
   * to `finished`, and it waits again with the same students for the teacher's next start. Any other room is removed at once.
   * False when there is no such room.
   */
  end(id: string, reason?: string): boolean;
  /** Removes a room for good (the teacher's "Quitar sala"): its students go back to the entry screen. False when there is no such room. */
  close(id: string, reason?: string): boolean;
  /** The room with this id, if it is running. */
  get(id: string): Room | undefined;
  /** Every running room, as clients see it. */
  list(): RoomInfo[];
  /** The rooms that ended or failed, newest last (at most 50), with their timing: for the teacher screen and the load check. */
  finished: Room[];
  /** Runs the steps owed since the last tick. Call it often (every tick_ms). */
  tick(): void;
  /** Ends every room. */
  endAll(reason: string): void;
  /** Called after every step of a room (net.ts sends the snapshots from here); null for none. */
  onStepped: ((room: Room) => void) | null;
  /** Called when a room ends or fails, with its seats still held (net.ts sends the students their results from here); null for none. */
  onRetired: ((room: Room) => void) | null;
  /** Called when a teacher room's match ended and the room waits again (the teacher pushes its new state to its students); null for none. */
  onReopened: ((room: Room) => void) | null;
  /** Story 029: "Reinicio automático". On (the start), a teacher room whose match ends by itself opens a vote window; off, it waits for the teacher's start. */
  autoRestart: boolean;
  /** The room's vote window as the student in seat `seat` (-1: nobody) sees it, with the time left on this manager's clock; null when none is open. */
  voteView(room: Room, seat?: number): VoteView | null;
  /**
   * Called when a vote window closes with students to play (the countdown reached 0, or every connected student pressed Continuar), with the mode and map
   * that won; the room is 'waiting' and `room.vote` is already null. The teacher starts the next match from it; null for none (the room just waits).
   */
  onVoteDone: ((room: Room, next: { mode: GameModeId; map: string }) => void) | null;
}

/** The match choices a room gets unless told otherwise. */
const DEFAULT_MATCH: RoomSpec['match'] = { subject: 'matematicas', level: 'medio', topics: ['arith', 'mult'], custom: [], customName: '', map: MAP_IDS[0] };

/**
 * A room manager with no rooms.
 * @example const rooms = createRooms(limits, { clockMs: () => performance.now(), log, warn }); rooms.create({ match: { ...m, map: 'patio' } }); setInterval(rooms.tick, 8);
 */
export function createRooms(lim: RoomLimits, deps: RoomDeps): Rooms {
  const live = new Map<string, Room>(), finished: Room[] = [];
  let made = 0, turn = 0;
  const nowS = (): number => deps.clockMs() / 1000;
  const retire = (room: Room): void => {
    live.delete(room.id);
    finished.push(room);
    rooms.onRetired?.(room);
    if (finished.length > 50) finished.shift();
    deps.log(`Sala ${room.id} ${room.status === 'failed' ? 'falló' : 'terminada'}: ${room.reason}; ${room.matches} partidas, ${room.stats.steps} pasos`);
  };
  /**
   * A teacher room's match ended (won, or ended by the teacher): its students get their results while the seats are still
   * theirs, a copy of the room as it ended goes to `finished`, and the room waits again with the same seats for the next start.
   */
  const reopen = (room: Room, byItself: boolean): void => {
    rooms.onRetired?.(room);
    if (!room.match.over) room.matches++; // a match the teacher ended counts as played too
    const copy: Room = { ...room, seats: room.seats.map(s => ({ ...s })), prev: null };
    finished.push(copy);
    if (finished.length > 50) finished.shift();
    deps.log(`Sala ${room.id}: partida terminada (${room.reason}); espera con los mismos alumnos`);
    Object.assign(room, { status: 'waiting', reason: '', prev: copy, owed: 0, lastT: nowS(), report: null, last: null });
    room.pending.length = 0;
    room.matchNo++; // the next start is a new match to every student (a new begin)
    // Story 029: a match that ended by itself (not the teacher's "Terminar") with someone to vote opens the vote window; the room stays 'waiting' meanwhile.
    if (byItself && rooms.autoRestart && votersOf(room).length) room.vote = { endsAtS: nowS() + lim.voteS, votes: new Map() };
    rooms.onReopened?.(room);
  };
  /**
   * Closes a room's vote window when its countdown ran out or every connected student pressed Continuar. With students to play and a teacher to
   * start the match, `onVoteDone` gets the winners; otherwise the room just waits again.
   */
  const settleVote = (room: Room, t: number): void => {
    const voters = votersOf(room), vote = room.vote!;
    const allReady = voters.length > 0 && voters.every(s => vote.votes.get(s.index)?.ready);
    if (!allReady && t < vote.endsAtS) return;
    const next = voteView(room, -1, t)!.next;
    room.vote = null;
    deps.log(`Sala ${room.id}: votación cerrada (${allReady ? 'todos listos' : 'se acabó el tiempo'}, ${voters.length} alumnos); ${voters.length && rooms.onVoteDone ? `empieza ${next.mode} en ${next.map}` : 'espera al profesor'}`);
    if (voters.length) rooms.onVoteDone?.(room, next);
  };
  const rooms: Rooms = {
    finished,
    onStepped: null,
    onRetired: null,
    onReopened: null,
    autoRestart: true,
    onVoteDone: null,
    voteView: (room, seat = -1) => voteView(room, seat, nowS()),
    create(spec = {}) {
      const id = `sala-${++made}`;
      const full: RoomSpec = {
        match: { ...DEFAULT_MATCH, ...spec.match }, seed: spec.seed ?? (Math.random() * 2 ** 31) >>> 0,
        openSeats: spec.openSeats ?? [], rematch: spec.rematch ?? true, managed: spec.managed, waiting: spec.waiting,
      };
      const room = newRoom(id, full, nowS(), lim.play, deps.results ?? null);
      live.set(id, room);
      deps.log(`Sala ${id} creada: mapa ${full.match.map}, semilla ${full.seed}, ${room.seats.filter(s => s.kind === 'bot').length} bots`);
      return room;
    },
    end(id, reason = 'cerrada') {
      const room = live.get(id);
      if (!room) return false;
      room.status = 'ended'; room.reason = reason;
      if (room.managed) reopen(room, false); else retire(room);
      return true;
    },
    close(id, reason = 'quitada') {
      const room = live.get(id);
      if (!room) return false;
      room.status = 'ended'; room.reason = reason; room.vote = null;
      retire(room);
      return true;
    },
    get: id => live.get(id),
    all: () => [...live.values()],
    remove: id => live.delete(id),
    transition(id, action) {
      const room = live.get(id);
      const from = action === 'start' ? 'waiting' : action === 'pause' ? 'running' : 'paused';
      if (!room || room.status !== from) return false;
      room.status = action === 'pause' ? 'paused' : 'running';
      room.owed = 0; room.lastT = nowS(); // time spent waiting or paused is never stepped afterwards
      deps.log(`Sala ${id}: ${action === 'start' ? 'empieza' : action === 'pause' ? 'en pausa' : 'continúa'}`);
      return true;
    },
    list: () => [...live.values()].map(roomInfo),
    tick() {
      const all = [...live.values()];
      if (!all.length) return;
      const start = deps.clockMs(), t = start / 1000;
      for (const room of all) if (room.vote) settleVote(room, t);
      for (const room of all) {
        if (room.status === 'waiting' || room.status === 'paused') { room.owed = 0; room.lastT = t; continue; }
        room.owed += t - room.lastT; room.lastT = t;
        const behind = Math.floor(room.owed / STEP) - lim.maxBacklogSteps;
        if (behind > 0) {
          room.owed -= behind * STEP; room.stats.dropped += behind;
          deps.warn('lenta-' + room.id, `Sala ${room.id} va con retraso: ${behind} pasos descartados (total ${room.stats.dropped})`);
        }
      }
      turn = (turn + 1) % all.length;
      for (let k = 0; k < all.length; k++) {
        if (deps.clockMs() - start > lim.tickBudgetMs) break; // the rest keep what they are owed for the next tick
        const room = all[(turn + k) % all.length];
        try {
          for (let n = 0; n < lim.maxCatchupSteps && room.owed >= STEP && room.status === 'running'; n++) {
            stepRoom(room, deps.clockMs);
            room.owed -= STEP;
            rooms.onStepped?.(room);
          }
        } catch (err) {
          room.status = 'failed';
          room.reason = `error en la simulación: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`;
          if (process.env.AULA_DEPURAR && err instanceof Error) deps.log(err.stack ?? '');
        }
        if (room.status === 'ended' && room.managed) reopen(room, true);
        else if (room.status === 'ended' || room.status === 'failed') retire(room);
        else if (!room.managed && room.status === 'running' && room.emptySince >= 0 && t - room.emptySince >= lim.emptyGraceS) { room.status = 'ended'; room.reason = 'sala vacía'; retire(room); }
      }
    },
    endAll(reason) { for (const id of [...live.keys()]) rooms.close(id, reason); },
  };
  return rooms;
}
