// A room: 8 seats (4 v 4) and one match the server runs and owns. The teacher's screen (story 006) creates
// and ends rooms through src/server/rooms.ts; this module is the room itself.
//
// Seat i is player i of the match. A seated student whose connection is open plays their player: when their inputs
// stop (the pause screen, a hidden or minimised window) the player stands still where it is and can be shot, never
// played by a bot, so stepping away is no shelter. Otherwise (no student, or a dropped connection held for rejoin) a
// bot plays it with the single-player AI. Each student's inputs are queued and played one per step, in seq order.
import { startShop } from '../game/ffa';
import { createMatch, step, STEP, idleInput, seatHuman, seatBot, type Match, type MatchOptions, type PlayerInput } from '../game/match';
import type { Loose } from '../game/types';
import { MAP_ID, MAP_IDS, loadMap } from '../game/map';
import { GAME_MODES, MODE_INFO, SEATS, SEATS_PER_TEAM, studentSeats, type GameModeId, type RoomInfo, type SeatKind, type VoteView } from '../net/protocol';
import * as QUESTIONS from '../questions';
import { addAnswer, newTally, nameKey, type Results, type Tally } from './results';

/** One of the 8 seats. `owner` is a connection id while a student sits there (never a name). */
/** `name` is the student's name while one sits there (memory only, display only, never logged), else null. */
export interface Seat {
  index: number; team: number; kind: SeatKind; owner: number | null; name: string | null;
  /** True while the student plays the seat's player (connected and sending); false while a bot stands in. */
  present: boolean;
}
/** How a room plays its students' inputs (data/aula.json). */
export interface PlayLimits {
  /** Inputs queued per seat at most; older ones are dropped past it. */
  queueMax: number;
  /** Steps a seat's last held controls are repeated when no input arrived, before going idle. */
  holdSteps: number;
}
/** One seat's inputs: the queue not yet played, the last played (its held controls), its seq, and steps since one arrived. */
interface SeatInputs { queue: { seq: number; input: PlayerInput }[]; held: PlayerInput; ack: number; lastSeq: number; starved: number; dropped: number }

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
  /** True for a room the teacher screen manages: it starts waiting when `waiting`, and is never closed for being empty. */
  managed?: boolean;
  /** Start in 'waiting' (the match is built but not stepped) until the teacher starts it. */
  waiting?: boolean;
}

/** One student's explicit choices in a vote window (story 029): a vote for the next mode and map (null: none) and the Continuar mark, which is not a vote. */
export interface SeatVote { mode: GameModeId | null; map: string | null; ready: boolean }
/** A teacher room's vote window: when it ends on the server's clock (seconds) and each seat's choices by seat index. */
export interface Vote { endsAtS: number; votes: Map<number, SeatVote> }
/** What a vote came to: the votes counted per mode and per map, and the mode and map the next match takes. */
export interface VoteResult { modes: Record<string, number>; maps: Record<string, number>; win: { mode: GameModeId; map: string } }

/** A room on the server. */
export interface Room {
  id: string; spec: RoomSpec; seats: Seat[];
  /** True for a teacher-managed room (see RoomSpec.managed). */
  managed: boolean;
  /** The match in play; replaced by a new one on a rematch. */
  match: Match;
  /** The teacher's name for the room ('' for none); kept while the room waits again after a match, gone with the room (story 027). */
  name: string;
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
  /** The match number in this room (0 for the first); a rematch adds one. */
  matchNo: number;
  /** The rules' events since the last snapshot was sent (net.ts empties it); emptied every step while no student plays. */
  pending: Loose[];
  /** Each seat's inputs, by seat index. */
  inputs: SeatInputs[];
  /**
   * The match a rematch just replaced and its last events (its matchEnd among them), until the next snapshot round
   * sends them to its students ahead of the new match's `begin` (net.ts); then null.
   */
  last: { match: Match; events: Loose[] } | null;
  /** A teacher room's last finished match (a copy of the room as it ended, for the teacher's "Última partida" line); null before the first. */
  prev: Room | null;
  play: PlayLimits;
  /** The match in play: each student's counts by name key (src/server/results.ts), for their own end-of-match results. */
  tally: Map<string, Tally>;
  /** The finished match's tally from the step it was won until net.ts has sent the students theirs; null otherwise. */
  report: Map<string, Tally> | null;
  /** True once the students got their end-of-match results for the current match (a won match or the room ending). */
  reported: boolean;
  /** The teacher's store that every student's counts also go to; null when there is none (demo and load rooms). */
  results: Results | null;
  /** Story 029: the vote window of a teacher room whose match ended by itself (the room is 'waiting' meanwhile); null when none is open. */
  vote: Vote | null;
  /** Story 030: the label of the subject this teacher room's next match takes (the teacher sets it); '' for other rooms. */
  nextSubject: string;
}

/** The controls that only last one step: cleared when a seat's held controls are repeated. */
const PRESSED: (keyof PlayerInput)[] = ['usePress', 'firePress', 'shop', 'prone', 'jump', 'primary', 'secondary', 'pistol', 'swap', 'reload', 'closeShop', 'closeCard', 'spectate', 'spectateKey', 'medkit'];
const freshInputs = (): SeatInputs => ({ queue: [], held: idleInput(), ack: -1, lastSeq: -1, starved: 0, dropped: 0 });

/**
 * Starts every seat's input state clean for a new match (queue, held, ack, lastSeq, starved, dropped): a student's page counts its
 * input seq from 0 in each match, so the old match's lastSeq would drop all its inputs as repeats, and its ack would reach the new mirror.
 */
function resetInputs(room: Room): void {
  room.inputs = Array.from({ length: SEATS }, freshInputs);
}
/**
 * Starts counting the room's current match: an empty tally, and a Match.count that adds each answer and kill of a
 * seated student (found by seat, keyed by the typed name) to that tally and to the teacher's store. Bots are never
 * counted: only a seat whose player is a person reports. Call it after every new `room.match`.
 */
function bindCounting(room: Room): void {
  room.tally = new Map(); room.reported = false;
  const tallies = (p: Loose): Tally[] => {
    const seat = room.seats[p.id];
    if (!p.human || seat.kind !== 'human' || !seat.name) return [];
    const key = nameKey(seat.name);
    let mine = room.tally.get(key);
    if (!mine) { mine = newTally(); room.tally.set(key, mine); }
    const all = room.results?.tally(seat.name, room.id);
    return all ? [mine, all] : [mine];
  };
  room.match.count = {
    answer: (p, right, topic, level) => { for (const t of tallies(p)) addAnswer(t, room.id, subjectLabel(room.spec.match), topic, level, right); },
    kill: (killer, victim) => {
      if (killer) for (const t of tallies(killer)) t.kills++;
      for (const t of tallies(victim)) t.deaths++;
    },
  };
}
/** The subject as results and cards name it: a built-in's name, or "Preguntas propias (file)" for a CSV. */
export const subjectLabel = (m: Pick<RoomSpec['match'], 'subject' | 'customName'>): string => m.subject === QUESTIONS.CUSTOM ? `${QUESTIONS.CUSTOM_NAME} (${m.customName})` : QUESTIONS.SUBJECTS[m.subject].name;
/** A classroom match for this room's spec and seed, with the present students in their seats. */
function roomMatch(spec: RoomSpec, seed: number, seats: Seat[]): Match {
  const match = createMatch({ ...spec.match, seed, humans: [], classroom: true });
  for (const s of seats) if (s.kind === 'human' && s.present) { seatHuman(match, s.index, s.name ?? ''); startShop(match, match.players[s.index]); } // story 021: Free for All starts each student in the shop, hidden
  return match;
}

/**
 * A student starts or stops playing their seat's player: a bot stands in while their connection is dropped
 * and held for rejoin, and hands the player back when they return. Their queued inputs are dropped.
 */
export function setPresent(room: Room, index: number, on: boolean): void {
  const seat = room.seats[index];
  if (seat.kind !== 'human' || seat.present === on) return;
  seat.present = on;
  const inp = room.inputs[index];
  inp.queue.length = 0; inp.held = idleInput(); inp.starved = 0;
  if (on) { inp.lastSeq = -1; inp.ack = -1; } // a rejoined page counts its seq from 0 again: the old count would drop all its inputs as repeats
  // seatBot plans the bot's route on the loaded map, and this runs outside step() (a drop): another room's map may be up.
  if (!on && MAP_ID !== room.match.opts.map) loadMap(room.match.opts.map);
  if (on) seatHuman(room.match, index, seat.name ?? ''); else seatBot(room.match, index);
}

/**
 * Queues one input of the student in seat `index`. An input with a seq not above the last queued one is
 * ignored (a repeat); past queueMax the oldest is dropped. A student a bot stood in for gets their player back.
 * Returns false when the input was ignored.
 */
export function queueInput(room: Room, index: number, seq: number, input: Partial<PlayerInput>): boolean {
  const seat = room.seats[index], inp = room.inputs[index];
  if (seat.kind !== 'human' || seq <= inp.lastSeq) return false;
  if (!seat.present) setPresent(room, index, true);
  inp.lastSeq = seq;
  inp.queue.push({ seq, input: { ...idleInput(), ...input } });
  if (inp.queue.length > room.play.queueMax) { inp.queue.shift(); inp.dropped++; }
  return true;
}

/** Each present student's input for this step: the next queued one, or their held controls repeated for holdSteps, then idle for as long as none comes (standing still, open to shots). */
function takeInputs(room: Room): Record<number, PlayerInput> {
  const out: Record<number, PlayerInput> = {};
  for (const seat of room.seats) {
    if (seat.kind !== 'human' || !seat.present) continue;
    const inp = room.inputs[seat.index], next = inp.queue.shift();
    if (next) { inp.ack = next.seq; inp.held = next.input; inp.starved = 0; out[seat.index] = next.input; continue; }
    if (++inp.starved > room.play.holdSteps) { out[seat.index] = idleInput(); continue; }
    const held: PlayerInput = { ...inp.held, lookYaw: 0, lookPitch: 0, digits: [], buyItem: '', answer: -1 };
    for (const k of PRESSED) (held as unknown as Record<string, unknown>)[k] = false;
    out[seat.index] = held;
  }
  return out;
}

/** The last input seq the server played for seat `index` (-1 none). */
export const ackOf = (room: Room, index: number): number => room.inputs[index].ack;

/**
 * A running room with its first match built (round 1, buy time).
 * @example const r = newRoom('sala-1', { match: { subject: 'matematicas', level: 'medio', topics: ['arith'], custom: [], customName: '', map: 'patio' }, seed: 42, openSeats: [], rematch: true }, 0);
 */
export function newRoom(id: string, spec: RoomSpec, nowS: number, play: PlayLimits, results: Results | null = null): Room {
  const seats: Seat[] = Array.from({ length: SEATS }, (_, index) => ({
    index, team: index < SEATS_PER_TEAM ? 0 : 1, kind: spec.openSeats.includes(index) ? 'open' : 'bot', owner: null, name: null, present: false,
  }));
  const room: Room = {
    id, spec, seats, managed: !!spec.managed, name: '', match: roomMatch(spec, spec.seed, seats), matches: 0, status: spec.waiting ? 'waiting' : 'running', reason: '',
    owed: 0, lastT: nowS, emptySince: -1, stats: { steps: 0, totalMs: 0, maxMs: 0, dropped: 0 },
    matchNo: 0, pending: [], inputs: Array.from({ length: SEATS }, freshInputs), play, last: null, prev: null,
    tally: new Map(), report: null, reported: false, results, vote: null, nextSubject: '',
  };
  bindCounting(room);
  return room;
}

/**
 * One fixed step of the room's match with the students' inputs, timed. The step's events go to room.pending for
 * the next snapshots (dropped while no student plays). A won match starts the next one (a rematch, seed +
 * matches, matchNo + 1; the old one waits in room.last for its final snapshot) or ends the room.
 */
export function stepRoom(room: Room, clockMs: () => number): void {
  const t0 = clockMs();
  step(room.match, takeInputs(room), STEP);
  if (room.seats.some(s => s.kind === 'human' && s.owner !== null)) room.pending.push(...room.match.events);
  room.match.events.length = 0;
  const ms = clockMs() - t0;
  room.stats.steps++; room.stats.totalMs += ms; room.stats.maxMs = Math.max(room.stats.maxMs, ms);
  if (!room.match.over) return;
  room.matches++;
  room.report = room.tally;
  if (room.spec.rematch) { room.last = { match: room.match, events: room.pending.splice(0) }; room.match = roomMatch(room.spec, (room.spec.seed + room.matches) >>> 0, room.seats); bindCounting(room); resetInputs(room); room.matchNo++; room.pending.push(...room.match.events); room.match.events.length = 0; }
  else { room.status = 'ended'; room.reason = 'partida terminada'; }
}

/**
 * Seats a student in a seat no student holds (a bot's or an open one; the bot hands the seat over).
 * Without `index` the team with fewer students is filled first (a tie goes to team 0), at its lowest
 * free seat, or the other team's when that one has none. Returns the seat, or null when the room is not
 * open (waiting, running or paused) or every seat is a student's.
 * @example const seat = takeSeat(room, connId, 'Ana'); // seat.team is 0 in an empty room
 */
export function takeSeat(room: Room, owner: number, name: string, index?: number): Seat | null {
  if (room.status !== 'running' && room.status !== 'waiting' && room.status !== 'paused') return null;
  const coop = MODE_INFO[room.match.opts.mode].coop; // story 025: students sit only in seats 0..3, the others are the enemy bots
  const free = room.seats.filter(s => s.kind !== 'human' && (!coop || s.team === 0) && (index === undefined || s.index === index));
  const humans = (team: number): number => room.seats.filter(s => s.kind === 'human' && s.team === team).length;
  const first = humans(1) < humans(0) ? 1 : 0;
  const seat = free.find(s => s.team === first) ?? free[0];
  if (!seat) return null;
  seat.kind = 'human'; seat.owner = owner; seat.name = name; seat.present = true; room.emptySince = -1;
  room.vote?.votes.delete(seat.index); // a seat's choices are its student's: the next one starts with none
  room.inputs[seat.index] = freshInputs();
  seatHuman(room.match, seat.index, name);
  return seat;
}

/**
 * Frees the seat a connection holds: it goes back to what it was before (a bot, or an open seat when the
 * room was built with it open). The room starts its empty countdown when it was the last student.
 */
export function leaveSeat(room: Room, owner: number, nowS: number): void {
  for (const s of room.seats) if (s.owner === owner) {
    setPresent(room, s.index, false);
    s.kind = room.spec.openSeats.includes(s.index) ? 'open' : 'bot'; s.owner = null; s.name = null;
    room.vote?.votes.delete(s.index);
  }
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

/**
 * Builds the room's match again from new choices and a new seed, with its present students in their seats. Only
 * for a waiting room (nothing was played): the teacher's session applies to it when it starts. Returns false
 * for any other status.
 * @example rebuildMatch(room, { subject: 'matematicas', level: 'facil', topics: ['arith'], custom: [], customName: '', map: 'patio' }, 7);
 */
export function rebuildMatch(room: Room, match: RoomSpec['match'], seed: number): boolean {
  if (room.status !== 'waiting') return false;
  room.spec = { ...room.spec, match, seed };
  room.match = roomMatch(room.spec, seed, room.seats); bindCounting(room);
  resetInputs(room); // the next match's seqs start from 0 again
  room.pending.length = 0; room.match.events.length = 0;
  return true;
}

/**
 * Counts the votes of a vote window (story 029; a pure function, the one place with the tie rule). `casts` are the connected students' explicit
 * choices (a null is no vote: Continuar is not a vote). Only `modes` and `maps` can be counted. In each category the option with strictly the
 * most votes wins; a tie (of any options, the one just played included) or no votes keeps what `current` just played.
 * @example tallyVotes([{ mode: 'ffa', map: null }], { mode: 'bomb', map: 'patio' }, GAME_MODES, MAP_IDS).win // { mode: 'ffa', map: 'patio' }
 */
export function tallyVotes(casts: readonly { mode: GameModeId | null; map: string | null }[], current: { mode: GameModeId; map: string }, modes: readonly GameModeId[], maps: readonly string[]): VoteResult {
  const count = (options: readonly string[], pick: (c: { mode: GameModeId | null; map: string | null }) => string | null): Record<string, number> => {
    const n: Record<string, number> = Object.fromEntries(options.map(o => [o, 0]));
    for (const c of casts) { const p = pick(c); if (p !== null && Object.hasOwn(n, p)) n[p]++; }
    return n;
  };
  const winner = (n: Record<string, number>, keep: string): string => {
    const top = Math.max(0, ...Object.values(n)), best = Object.keys(n).filter(k => n[k] === top);
    return top > 0 && best.length === 1 ? best[0] : keep;
  };
  const m = count(modes, c => c.mode), p = count(maps, c => c.map);
  return { modes: m, maps: p, win: { mode: winner(m, current.mode) as GameModeId, map: winner(p, current.map) } };
}

/** The modes this room's students can vote for: those with seats for every student seated in it (Oleadas cooperativas takes 4). */
export function votableModes(room: Room): GameModeId[] {
  const students = room.seats.filter(s => s.kind === 'human').length;
  return GAME_MODES.filter(m => studentSeats(m) >= students);
}

/**
 * Records a student's explicit vote and/or Continuar mark in the room's vote window. Returns false (nothing recorded) when no vote is open, the
 * seat is not a student's, the mode does not fit the room or the map does not exist.
 */
export function castVote(room: Room, index: number, pick: { mode?: GameModeId; map?: string; ready?: boolean }): boolean {
  const v = room.vote;
  if (!v || room.seats[index]?.kind !== 'human') return false;
  if (pick.mode !== undefined && !votableModes(room).includes(pick.mode)) return false;
  if (pick.map !== undefined && !MAP_IDS.includes(pick.map)) return false;
  const mine = v.votes.get(index) ?? { mode: null, map: null, ready: false };
  if (pick.mode !== undefined) mine.mode = pick.mode;
  if (pick.map !== undefined) mine.map = pick.map;
  if (pick.ready) mine.ready = true;
  v.votes.set(index, mine);
  return true;
}

/** The students who count in a vote: seated and connected (a held seat, whose student dropped, does not). */
export const votersOf = (room: Room): Seat[] => room.seats.filter(s => s.kind === 'human' && s.present);

/**
 * The room's vote window for the student in seat `index` (-1: nobody, for the teacher), with `left` from `nowS` (the server's clock, seconds);
 * null when no vote is open.
 */
export function voteView(room: Room, index: number, nowS: number): VoteView | null {
  const v = room.vote;
  if (!v) return null;
  const voters = votersOf(room), fits = votableModes(room), current = { mode: room.match.opts.mode, map: room.spec.match.map };
  const none: SeatVote = { mode: null, map: null, ready: false };
  const tally = tallyVotes(voters.map(s => v.votes.get(s.index) ?? none), current, fits, MAP_IDS), mine = v.votes.get(index) ?? none;
  return { left: Math.max(0, Math.round((v.endsAtS - nowS) * 1000)), mode: current.mode, map: current.map, fits, modes: tally.modes, maps: tally.maps, next: tally.win,
    ready: voters.filter(s => v.votes.get(s.index)?.ready).length, students: voters.length, mine: { mode: mine.mode ?? '', map: mine.map ?? '', ready: mine.ready } };
}
