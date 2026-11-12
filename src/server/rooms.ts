// The rooms the server runs, and the small API the teacher screen (story 006) will call: create a room,
// end one, list them. One timer drives every room: each tick credits each room the real time that passed
// and runs the fixed steps it owes, a few at most per room, round-robin, within a time budget, so a slow
// room cannot starve the others. An exception in a room fails that room only.
import { STEP } from '../game/match';
import { MAP_IDS } from '../game/map';
import { newRoom, stepRoom, roomInfo, type Room, type RoomSpec, type PlayLimits } from './room';
import type { RoomInfo } from '../net/protocol';

/** The limits the manager runs with (data/aula.json). */
export interface RoomLimits { tickBudgetMs: number; maxCatchupSteps: number; maxBacklogSteps: number; emptyGraceS: number; play: PlayLimits }
/** What the manager needs from outside: a clock in ms and two logs (plain and rate-limited). */
export interface RoomDeps { clockMs: () => number; log: (line: string) => void; warn: (kind: string, line: string) => void }

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
  /** Ends a room now, with a reason; it is removed at once. False when there is no such room. */
  end(id: string, reason?: string): boolean;
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
    if (finished.length > 50) finished.shift();
    deps.log(`Sala ${room.id} ${room.status === 'failed' ? 'falló' : 'terminada'}: ${room.reason}; ${room.matches} partidas, ${room.stats.steps} pasos`);
  };
  const rooms: Rooms = {
    finished,
    onStepped: null,
    create(spec = {}) {
      const id = `sala-${++made}`;
      const full: RoomSpec = {
        match: { ...DEFAULT_MATCH, ...spec.match }, seed: spec.seed ?? (Math.random() * 2 ** 31) >>> 0,
        openSeats: spec.openSeats ?? [], rematch: spec.rematch ?? true, managed: spec.managed, waiting: spec.waiting,
      };
      const room = newRoom(id, full, nowS(), lim.play);
      live.set(id, room);
      deps.log(`Sala ${id} creada: mapa ${full.match.map}, semilla ${full.seed}, ${room.seats.filter(s => s.kind === 'bot').length} bots`);
      return room;
    },
    end(id, reason = 'cerrada') {
      const room = live.get(id);
      if (!room) return false;
      room.status = 'ended'; room.reason = reason;
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
        if (room.status === 'ended' || room.status === 'failed') retire(room);
        else if (!room.managed && room.status === 'running' && room.emptySince >= 0 && t - room.emptySince >= lim.emptyGraceS) { room.status = 'ended'; room.reason = 'sala vacía'; retire(room); }
      }
    },
    endAll(reason) { for (const id of [...live.keys()]) rooms.end(id, reason); },
  };
  return rooms;
}
