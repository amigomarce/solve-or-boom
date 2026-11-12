// A room: 8 seats (4 v 4) and one match the server runs and owns. The teacher's screen (story 006) creates
// and ends rooms through src/server/rooms.ts; this module is the room itself.
//
// For now every player of the match is driven by the server: the 7 bots by the bot rules, and the rules'
// one human player (match.human, seat 0) by an idle input, standing in its base. Seating students and
// routing their inputs to their players is story 005; the seats here already say who sits where.
import { createMatch, step, STEP, type Match, type MatchOptions } from '../game/match';
import { SEATS, SEATS_PER_TEAM, type RoomInfo, type SeatKind } from '../net/protocol';

/** One of the 8 seats. `owner` is a connection id while a student sits there (never a name). */
export interface Seat { index: number; team: number; kind: SeatKind; owner: number | null }

/** How to build a room. */
export interface RoomSpec {
  /** The match's choices: subject, level, topics, map (the seed is the room's). */
  match: Omit<MatchOptions, 'seed'>;
  /** The first match's seed; each next match uses the next one. */
  seed: number;
  /** Seats waiting for students (indexes 0..7); every other seat is a bot. */
  openSeats: number[];
  /** When a match is won: start another (true) or end the room (false). */
  rematch: boolean;
}

/** A room on the server. */
export interface Room {
  id: string; spec: RoomSpec; seats: Seat[];
  /** The match in play; replaced by a new one on a rematch. */
  match: Match;
  /** Matches finished in this room. */
  matches: number;
  status: RoomInfo['status'];
  /** Why the room ended or failed ('' while running). */
  reason: string;
  /** Seconds of real time not yet stepped. */
  owed: number;
  /** Real time (seconds) of the last tick that credited this room. */
  lastT: number;
  /** When the last student left (seconds), or -1; a room that had students closes after empty_grace_s. */
  emptySince: number;
  /** Step timing: steps run, their total and longest ms, and steps dropped for being too far behind. */
  stats: { steps: number; totalMs: number; maxMs: number; dropped: number };
}

/**
 * A running room with its first match built (round 1, buy time).
 * @example const r = newRoom('sala-1', { match: { subject: 'matematicas', level: 'medio', topics: ['arith'], custom: [], customName: '', map: 'patio' }, seed: 42, openSeats: [], rematch: true }, 0);
 */
export function newRoom(id: string, spec: RoomSpec, nowS: number): Room {
  const seats: Seat[] = Array.from({ length: SEATS }, (_, index) => ({
    index, team: index < SEATS_PER_TEAM ? 0 : 1, kind: spec.openSeats.includes(index) ? 'open' : 'bot', owner: null,
  }));
  return {
    id, spec, seats, match: createMatch({ ...spec.match, seed: spec.seed }), matches: 0, status: 'running', reason: '',
    owed: 0, lastT: nowS, emptySince: -1, stats: { steps: 0, totalMs: 0, maxMs: 0, dropped: 0 },
  };
}

/**
 * One fixed step of the room's match, timed. A won match starts the next one (a rematch, seed + matches)
 * or ends the room. The step's events are emptied: no screen reads them yet.
 */
export function stepRoom(room: Room, clockMs: () => number): void {
  const t0 = clockMs();
  step(room.match, {}, STEP);
  room.match.events.length = 0;
  const ms = clockMs() - t0;
  room.stats.steps++; room.stats.totalMs += ms; room.stats.maxMs = Math.max(room.stats.maxMs, ms);
  if (!room.match.over) return;
  room.matches++;
  if (room.spec.rematch) room.match = createMatch({ ...room.spec.match, seed: (room.spec.seed + room.matches) >>> 0 });
  else { room.status = 'ended'; room.reason = 'partida terminada'; }
}

/** Seats a connection in an open seat (the first free one, or `index`); returns the seat or null. */
export function takeSeat(room: Room, owner: number, index?: number): Seat | null {
  const seat = room.seats.find(s => s.kind === 'open' && (index === undefined || s.index === index));
  if (!seat || room.status !== 'running') return null;
  seat.kind = 'human'; seat.owner = owner; room.emptySince = -1;
  return seat;
}

/** Frees the seat a connection holds; the room starts its empty countdown when it was the last student. */
export function leaveSeat(room: Room, owner: number, nowS: number): void {
  for (const s of room.seats) if (s.owner === owner) { s.kind = 'open'; s.owner = null; }
  if (!room.seats.some(s => s.kind === 'human')) room.emptySince = nowS;
}

/** The room as clients and the teacher screen see it: counts, never names. */
export function roomInfo(room: Room): RoomInfo {
  const count = (k: SeatKind): number => room.seats.filter(s => s.kind === k).length;
  return {
    id: room.id, status: room.status, map: room.spec.match.map, seats: SEATS,
    humans: count('human'), bots: count('bot'), open: count('open'), round: room.match.round, score: [...room.match.score],
  };
}
