// The classroom wire format: every message between a student's browser and the teacher's server.
// Shared by the server (src/server/) and, from story 004 on, the browser client. No browser and no
// Node in here: plain TypeScript, so both sides import it.
//
// Every message is one JSON text frame: { "v": PROTOCOL_VERSION, "t": "<type>", ...fields }.
// A client may only say who it is (hello), send its controls and answers (input) and check the line
// (ping). It never sends positions, money, health or results: the server owns the match and works
// those out itself. parseClientMessage() is the only door in; anything it refuses is dropped.
import type { PlayerInput } from '../game/player';
import { LEVELS, type Level } from '../game/types';

/** The format's version. A message with another `v` is refused, so an old page gets a clear error. 2: begin carries subject and level, snap carries the menu and the card (story 005 Part B). 3: `results` (a student's own end-of-match counts), tinfo maps are {id, name}, tstate carries the results, texport/tclear (story 007). 4: on a map with heights a player row ends with the feet height and the bomb row with the bomb's height (story 011). 5: the input's `scope` is a held state (aiming) sent on every step, no longer a one-step press (story 013). 6: the input's `medkit` (a press) and digits up to 5, the own row ends with the medkits carried, snap carries the dropped pickups `d`, events `melee` and `pickup` (story 016). 7: the match options (story 017): tsession, tstate's session and begin carry `friendlyFire` and `buyTime`, tinfo the buy time's range `buyTime`, and a `kill` event of a teammate carries `ff: true`. */
// 8: an input carries the student's own aim (aimYaw, aimPitch), taken as is, so a lost input cannot leave the server's aim off the crosshair.
// 9: hello carries a random key per browser (token); a held seat goes back only to the same key.
// 10: the own row ends with healT, the seconds left of a medkit being used (it takes medkit_time).
// 11: streak rewards (story 018): tsession, tstate's session and begin carry `streakRewards`; the input's `ability` (a press, the
//     kept Cazador); the own row ends with streak, kept (0/1) and hunterT (SCALE.time); gun code 4 is the Rifle dorado ('gold').
// 12: the game mode (story 019): tsession, tstate's session and begin carry `mode` ('bomb' | 'ffa'), tinfo the `modes` list; a card's
//     kind may be 'respawn' (Free for All: a dead student's question, judged by the server); bomb state code 5 is 'none' (no bomb);
//     a Free for All `matchEnd` event carries `podium`, every player best first: { id, kills, deaths, right, wrong } (right and wrong -1 for a bot).
// 13: Free for All hiding (story 021): the own row ends with `hidden` (1 while this student buys at the start or a respawn, invisible
//     and untouchable; 0 otherwise); a player hidden from the receiver comes as a blank row: [id, 0, 0, 0, 0, 0, 0, 0, 0, kills, deaths, 0, 0?]
//     (no position, aim, flags, gun or stance; x = z = 0 is inside the map's outer wall, so it is never a real position).
// 14: rooms and students follow the game mode (story 023): a room view (joined's `room`, the `room` message) carries `mode`, and a
//     teacher room carries `mode` and `summary` (Free for All: who leads and the time left), so Free for All shows no teams.
// 15: Duelo por equipos (story 024): the mode id 'duel' joins GAME_MODES (everywhere a mode travels: begin, tsession, tstate, room views); its
//     `round` event carries side 'duel' and its `matchEnd` event carries `podium` (as Free for All's), `win` (0 or 1, the winning team; -1 a tie)
//     and `score` (the teams' kills); its `kill` event carries `bt`, the killer's team (none for a self-kill). The snapshot's `s` is the teams' kills in that mode; a teacher room's `summary` says the teams' kills.
export const PROTOCOL_VERSION = 15;
/** The WebSocket path on the game's own port. */
export const WS_PATH = '/ws';
/** Seats in a room: 4 v 4. */
export const SEATS = 8;
/** Seats per team; seats 0..3 are team 0, seats 4..7 team 1 (the roster's squads). */
export const SEATS_PER_TEAM = 4;

/** Client to server: who is connecting. The name is kept in memory only, never logged or stored. */
export interface HelloMessage {
  v: number; t: 'hello'; name: string;
  /**
   * Optional. True when the page is re-entering after losing its connection (client.ts sets it on automatic
   * retries): if the server still thinks the old connection is open but it stopped answering pings, the seat
   * is taken over. Typed names never set it.
   */
  rejoin?: boolean;
  /**
   * Protocol 9: a random key this browser keeps (client.ts). A seat held for a dropped student goes back only to a hello
   * with the same key, so someone else typing that name gets "Ana (2)" instead of the seat. Not personal data.
   */
  token?: string;
}
/** Client to server: the student leaves for good; the seat becomes a bot at once (no grace). */
export interface LeaveMessage { v: number; t: 'leave' }
/**
 * Client to server: the controls of one step, as src/game/player.ts reads them. Every field is optional
 * (a missing one is idle). The answer to a question card is the `answer` field (0..3, -1 for none) and a
 * purchase is `buyItem`: the server checks both against the match, like the single-player game does.
 */
export interface InputMessage {
  v: number; t: 'input';
  /** The client's step number, one more each step (0..2^31-1): the server plays inputs in this order, once each, and acks the last one it played in every snapshot. */
  seq: number;
  input: Partial<PlayerInput>;
}
/** Client to server: a line check; the server answers pong. */
export interface PingMessage { v: number; t: 'ping' }
/** Every message a client may send. */
export type ClientMessage = HelloMessage | InputMessage | PingMessage | LeaveMessage;

/** A seat's state: a bot plays it, a student plays it, or it waits for a student. */
export type SeatKind = 'bot' | 'human' | 'open';
/** A room as the server shows it to clients and to the teacher screen: no names, only counts. */
export interface RoomInfo {
  id: string; status: 'waiting' | 'running' | 'paused' | 'ended' | 'failed'; map: string;
  seats: number; humans: number; bots: number; open: number;
  round: number; score: number[];
}
/** A room's state as students see it. Rooms start 'running'; 'waiting' and 'paused' are reserved for the teacher screen (story 006). */
export type RoomState = 'waiting' | 'running' | 'paused' | 'ended';
/** One seat as students see it. Open seats are shown as bots. `name` is a student's name or the bot's ("Bot 3"); display only. */
export interface SeatView { index: number; team: number; kind: 'human' | 'bot'; name: string }
/** A room's seating: who sits where. Seats are always 8, in index order (0-3 team 0, 4-7 team 1). */
export interface RoomView {
  roomId: string; state: RoomState; seats: SeatView[];
  /** The room's game mode (story 023, protocol 14): in 'ffa' the waiting room shows no teams. A waiting room follows the teacher's session. */
  mode: GameModeId;
}
/** Who the student is on the server: the name they got (made unique), their room, seat and team. */
export interface You { name: string; room: string; seat: number; team: number }
/** Server to client: the answer to a hello that got a seat (or got its old seat back). */
export interface JoinedMessage { v: number; t: 'joined'; you: You; room: RoomView }
/** Server to client: the seating of the student's room changed (someone joined or left, or the room's state changed). */
export interface RoomMessage extends RoomView { v: number; t: 'room' }
/**
 * Server to client: the rooms there are. Not sent since story 004 (a hello is answered by `joined`); kept
 * for the teacher screen (story 006).
 */
export interface WelcomeMessage { v: number; t: 'welcome'; rooms: RoomInfo[] }
/** Server to client: the answer to a ping. */
export interface PongMessage { v: number; t: 'pong' }
/** Server to client: why a message was dropped (ERROR_TEXT has the sentence the page shows). */
export interface ErrorMessage { v: number; t: 'error'; code: ErrorCode; text: string }
/**
 * Server to client: a match starts for this student (after `joined`, after a rejoin, and at every rematch).
 * The client builds its copy of the match from it (src/net/mirror.ts createMirror).
 */
export interface BeginMessage {
  v: number; t: 'begin';
  /** The map id (data/maps/). */
  map: string;
  /** The student's seat, which is also their player id in the match. */
  seat: number;
  /** The room's match number (0 for the first): a new one means a new match. */
  match: number;
  /** Snapshots per second the server sends (data/aula.json snapshot_hz). */
  hz: number;
  /** Every player's name, by player id (display only). */
  names: string[];
  /** The session's subject id and level: the buy menu shows each item's question level from them. */
  subject: string; level: string;
  /** The match options (story 017, protocol 7): shots hurt teammates; the buy phase's length in seconds (the HUD's timer itself comes from each snapshot's `pt`). */
  friendlyFire: boolean; buyTime: number;
  /** Streak rewards on (story 018, protocol 11): the HUD shows the streak and the next reward only then. */
  streakRewards: boolean;
  /** The game mode (story 019, protocol 12): 'bomb' or 'ffa' (Free for All). */
  mode: GameModeId;
}
/** The game modes as the wire names them (protocol 12). */
export const GAME_MODES = ['bomb', 'ffa', 'duel'] as const;
export type GameModeId = typeof GAME_MODES[number];
const isMode = (v: unknown): v is GameModeId => (GAME_MODES as readonly unknown[]).includes(v);
/** The wire codes of the guns (index in this list), as snapshots carry them. */
export const WEAPON_IDS = ['pistol', 'smg', 'rifle', 'sniper', 'gold'] as const; // 'gold': the Rifle dorado (protocol 11), never sold
/** The wire codes of the stances. */
export const STANCES = ['stand', 'crouch', 'prone'] as const;
/** Snapshot scale: positions in centimetres, angles in milliradians, timers in hundredths of a second (all whole numbers). */
export const SCALE = { pos: 100, ang: 1000, time: 100 } as const;
/** True for a row the server blanked because that player is hidden from the receiver (protocol 13): no position and no flags. */
export const isBlankRow = (r: PlayerRow): boolean => r[1] === 0 && r[2] === 0 && r[5] === 0;
/** Player row flag bits: alive, a person plays it, moving, defusing, muzzle flash on, scoped, seen by an enemy in the last 1.5 s. */
export const FLAG = { alive: 1, human: 2, moving: 4, defusing: 8, flash: 16, scoped: 32, spotted: 64 } as const;
/**
 * One player as everybody sees it: [id, x, z, yaw, pitch, flags, gun, stance, jumpY, kills, deaths, deadT, y?] (scaled
 * by SCALE, gun by WEAPON_IDS, stance by STANCES, flags by FLAG). Health, armour, money and ammo are not in it.
 * `y` (SCALE.pos), the height of the feet above the ground floor, is there only on a map with heights (protocol 4); absent means 0.
 */
export type PlayerRow = number[];
/**
 * The receiving student's own player, private to them: [hp, armor, money, mag, reserve, reloadT, primary (-1 none),
 * prone (0/1), proneT, jumpY, vy, eye, recoil, cool, aim, medkits, healT, streak, kept, hunterT, hidden] (timers, heights and speeds scaled by SCALE.time / SCALE.pos);
 * aim (protocol 5) is 0 not aiming, 1 aiming with the current gun, 2 an aim ended that waits for the button to be let go;
 * medkits (protocol 6) is the count of bought medkits carried; healT (protocol 10), the seconds left of a medkit being used (SCALE.time);
 * streak (protocol 11) the right answers in a row, kept 1 while a Cazador is kept to use, hunterT the seconds left of a Cazador running (SCALE.time);
 * hidden (protocol 13) 1 while the student is invisible and untouchable, buying at a Free for All start or respawn.
 */
export type OwnRow = number[];
/** The bomb: [state (0 carried, 1 dropped, 2 planted, 3 defused, 4 exploded), x, z, timer, carrier id (-1), site (0 none, 1 A, 2 B), defuser id (-1), y?]; `y` (SCALE.pos), the bomb's height, only on a map with heights (protocol 4). */
export type BombRow = number[];
/**
 * Something a dead player dropped (protocol 6, story 016): [id, kind (PICKUP_KINDS index), x, z, y?] (SCALE.pos); `y`, the
 * height it lies at, only on a map with heights. Everybody gets the same list; the server removes one when it is taken.
 */
export type PickupRow = number[];
/** The pickup kinds, by their code in PickupRow. */
export const PICKUP_KINDS = ['medkit', 'ammo'] as const;
/** The most pickups a snapshot may carry (2 per death, each player dies at most once a round). */
export const PICKUPS_MAX = 2 * SEATS;
/**
 * The receiving student's open question card, private to them. It never says which choice is right: the server
 * judges the answer (`answer` in an input) and the card shows the verdict through `pk` with `w` or `ok`.
 */
export interface CardView {
  /** 'buy' or 'defuse', the shop item id ('' for a defuse), the question's level ('' for a custom CSV). */
  k: 'buy' | 'defuse' | 'respawn'; i: string; lv: string;
  /** The question, its 4 choices in the order shown, its topic label. */
  q: string; o: string[]; tp: string;
  /** The choice picked (-1 none); the wrong-answer lockout left and its length; the right-answer confirmation left (SCALE.time). */
  pk: number; w: number; wt: number; ok: number;
  /** Right defuse answers given on this card. */
  g: number;
}
/** The bomb states, by their code in BombRow. */
export const BOMB_STATES = ['carried', 'dropped', 'planted', 'defused', 'exploded', 'none'] as const; // 'none': Free for All (protocol 12)
/**
 * Server to client, snapshot_hz times a second: the match as this student may see it, the last input it played
 * for them, and the events since the previous snapshot that concern them.
 */
export interface SnapMessage {
  v: number; t: 'snap';
  /** The room's step count when it was taken (60 a second). */
  k: number;
  /** The last input seq the server played for this student (-1 none yet). */
  a: number;
  /** Phase ('buy', 'live', 'post'), its timer and the round timer (SCALE.time). */
  ph: string; pt: number; rt: number;
  /** Round number, score by squad, the attacking squad, gates closed (1/0), the carrier's plant progress (SCALE.time). */
  r: number; s: number[]; as: number; g: number; pl: number;
  b: BombRow; p: PlayerRow[]; y: OwnRow;
  /** The pickups on the floor (protocol 6), the same for every student. */
  d: PickupRow[];
  /** Events, as the rules push them (src/game/), filtered for this student; `shot.human` is true for their own shots; `kill.ff` is true when a teammate killed (friendly fire, protocol 7). */
  e: Record<string, unknown>[];
  /** This student's buy menu is open (1/0), and their open question card (null for none). */
  m: number; c: CardView | null;
}
/** Every message the server may send. */
/** One topic and level of a student's own results: the topic label as the card showed it, the level id ('' for a custom CSV), their counts. */
export interface ResultTopic { tp: string; lv: string; right: number; wrong: number }
/**
 * Server to student: that student's OWN results for the match that just ended (never anyone else's). Sent once per
 * match: when it is won (after the last snapshot, whose matchEnd event it follows; in a rematch room before the next
 * `begin`) or when the room ends early (the teacher ended it, it failed: `why` is 'ended' and the counts are partial).
 * A student with no answers still gets one, with zeros and no topics. The counts are for this match only, not the session.
 */
export interface ResultsMessage {
  v: number; t: 'results';
  /** Which match this is (BeginMessage.match of the match that ended). */
  match: number;
  /** 'won' when the match reached its end, 'ended' when the room was closed before. */
  why: 'won' | 'ended';
  right: number; wrong: number;
  /** Whole percent right (0 when there were no answers: show a dash when right + wrong is 0). */
  pct: number;
  kills: number; deaths: number;
  /** One row per topic and level answered, ordered by topic then level (at most RESULT_TOPICS_MAX). */
  topics: ResultTopic[];
}
/** The most topic rows one `results` message holds. */
export const RESULT_TOPICS_MAX = 64;
export type ServerMessage = WelcomeMessage | JoinedMessage | RoomMessage | PongMessage | ErrorMessage | BeginMessage | SnapMessage | ResultsMessage;

/** Why a message was refused. */
export type ErrorCode = 'too_big' | 'not_text' | 'not_json' | 'bad_shape' | 'bad_version' | 'bad_type' | 'bad_field' | 'bad_name'
  | 'rate_limited' | 'need_hello' | 'server_full'
  | 'name_empty' | 'sin_cupo' | 'not_teacher';
/** The sentence a page shows for each error, in Spanish. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  too_big: 'Mensaje demasiado grande.',
  not_text: 'Solo se aceptan mensajes de texto.',
  not_json: 'El mensaje no es JSON.',
  bad_shape: 'El mensaje no tiene la forma esperada.',
  bad_version: 'Versión distinta: recarga la página del juego.',
  bad_type: 'Tipo de mensaje desconocido.',
  bad_field: 'Un campo del mensaje no es válido.',
  bad_name: 'El nombre no es válido: usa letras, números y espacios (máximo 20 caracteres).',
  rate_limited: 'Demasiados mensajes: más despacio.',
  need_hello: 'Primero hay que presentarse (hello).',
  server_full: 'El servidor está lleno.',
  name_empty: 'Escribe tu nombre para entrar.',
  not_teacher: 'Ese mensaje es solo del profesor.',
  sin_cupo: 'No queda ningún sitio libre en las salas. Avisa al profesor.',
};

/** The limits parseClientMessage() applies (data/aula.json). */
export interface ProtocolLimits { maxChars: number; maxName: number; maxLook: number }
/** What parseClientMessage() returns: the message, or why it was refused. */
export type Parsed = { ok: true; msg: ClientMessage } | { ok: false; code: ErrorCode };

type Check = (v: unknown, lim: ProtocolLimits) => boolean;
const isBool: Check = v => typeof v === 'boolean';
const isAxis: Check = v => v === -1 || v === 0 || v === 1;
/** A look turn: any finite number (one over maxLook is clamped to it by parseClientMessage, not refused). */
const isLook: Check = v => typeof v === 'number' && Number.isFinite(v);
/** Each input field and the values it may hold. Typed by PlayerInput, so a new control must be added here. */
const INPUT_FIELDS: Record<keyof PlayerInput, Check> = {
  moveF: isAxis, moveS: isAxis, walk: isBool, sprint: isBool, crouch: isBool, use: isBool, usePress: isBool,
  fire: isBool, firePress: isBool, lookLeft: isBool, lookRight: isBool, lookUp: isBool, lookDown: isBool,
  lookYaw: isLook, lookPitch: isLook, aimYaw: isLook, aimPitch: isLook, shop: isBool, prone: isBool, jump: isBool, primary: isBool, pistol: isBool,
  swap: isBool, reload: isBool, scope: isBool, medkit: isBool, ability: isBool,
  digits: v => Array.isArray(v) && v.length <= 6 && v.every(d => Number.isInteger(d) && d >= 0 && d <= 5),
  buyItem: v => typeof v === 'string' && v.length <= 16 && /^[a-z]*$/.test(v),
  answer: v => Number.isInteger(v) && (v as number) >= -1 && (v as number) <= 3,
  closeShop: isBool, closeCard: isBool, spectate: isBool, spectateKey: isBool,
};
/** The keys each message type may carry; any other key refuses the message. */
const KEYS: Record<ClientMessage['t'], string[]> = { hello: ['v', 't', 'name', 'rejoin', 'token'], input: ['v', 't', 'seq', 'input'], ping: ['v', 't'], leave: ['v', 't'] };
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks one text frame from a client and returns the message, or the reason it is refused: too long,
 * not JSON, not an object, another version, an unknown type, an unknown or extra key, or a field out of
 * its range. The input returned holds only known fields, copied one by one; a look turn over maxLook is clamped to it.
 * @example parseClientMessage('{"v":1,"t":"ping"}', { maxChars: 2048, maxName: 20, maxLook: 3.2 }) // { ok: true, msg: { v: 1, t: 'ping' } }
 */
export function parseClientMessage(text: string, lim: ProtocolLimits): Parsed {
  if (text.length > lim.maxChars) return { ok: false, code: 'too_big' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, code: 'not_json' }; }
  if (!isObject(raw)) return { ok: false, code: 'bad_shape' };
  if (raw.v !== PROTOCOL_VERSION) return { ok: false, code: 'bad_version' };
  const t = raw.t;
  if (typeof t === 'string' && (TEACHER_TYPES as readonly string[]).includes(t)) return { ok: false, code: 'not_teacher' };
  if (t !== 'hello' && t !== 'input' && t !== 'ping' && t !== 'leave') return { ok: false, code: 'bad_type' };
  if (Object.keys(raw).some(k => !KEYS[t].includes(k))) return { ok: false, code: 'bad_shape' };
  if (t === 'ping') return { ok: true, msg: { v: PROTOCOL_VERSION, t } };
  if (t === 'leave') return { ok: true, msg: { v: PROTOCOL_VERSION, t } };
  if (t === 'hello') {
    // Trimmed, and runs of spaces become one, so "Ana  M" and "Ana M" are the same name.
    const name = typeof raw.name === 'string' ? raw.name.trim().replace(/ {2,}/g, ' ') : '';
    if (!name) return { ok: false, code: 'name_empty' };
    if (name.length > lim.maxName || !NAME.test(name)) return { ok: false, code: 'bad_name' };
    if (raw.rejoin !== undefined && typeof raw.rejoin !== 'boolean') return { ok: false, code: 'bad_field' };
    if (raw.token !== undefined && (typeof raw.token !== 'string' || !/^[0-9a-f]{16,32}$/.test(raw.token))) return { ok: false, code: 'bad_field' };
    const msg: HelloMessage = { v: PROTOCOL_VERSION, t, name };
    if (raw.rejoin) msg.rejoin = true;
    if (raw.token) msg.token = raw.token as string;
    return { ok: true, msg };
  }
  if (!isObject(raw.input)) return { ok: false, code: 'bad_shape' };
  if (!Number.isInteger(raw.seq) || (raw.seq as number) < 0 || (raw.seq as number) > 0x7fffffff) return { ok: false, code: 'bad_field' };
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw.input)) {
    const check = Object.hasOwn(INPUT_FIELDS, k) ? INPUT_FIELDS[k as keyof PlayerInput] : undefined;
    if (!check || !check(v, lim)) return { ok: false, code: 'bad_field' };
    input[k] = Array.isArray(v) ? [...v] : k === 'lookYaw' || k === 'lookPitch' ? Math.max(-lim.maxLook, Math.min(lim.maxLook, v as number)) : v;
  }
  return { ok: true, msg: { v: PROTOCOL_VERSION, t, seq: raw.seq as number, input: input as Partial<PlayerInput> } };
}

/** The error message for a code, ready to send. */
export function errorMessage(code: ErrorCode): ErrorMessage {
  return { v: PROTOCOL_VERSION, t: 'error', code, text: ERROR_TEXT[code] };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isSeatView = (s: unknown): s is SeatView =>
  isObject(s) && isInt(s.index) && isInt(s.team) && (s.kind === 'human' || s.kind === 'bot') && isStr(s.name);
const isRoomView = (r: unknown): r is RoomView =>
  isObject(r) && isStr(r.roomId) && (r.state === 'waiting' || r.state === 'running' || r.state === 'paused' || r.state === 'ended')
  && isMode(r.mode) && Array.isArray(r.seats) && r.seats.length === SEATS && r.seats.every(isSeatView);
const isNums = (v: unknown, n?: number): v is number[] =>
  Array.isArray(v) && (n === undefined || v.length === n) && v.every(x => typeof x === 'number' && Number.isFinite(x));
const isCard = (c: unknown): c is CardView =>
  isObject(c) && (c.k === 'buy' || c.k === 'defuse' || c.k === 'respawn') && isStr(c.i) && isStr(c.lv) && isStr(c.q) && isStr(c.tp)
  && Array.isArray(c.o) && c.o.length >= 2 && c.o.length <= 4 && c.o.every(isStr) && [c.pk, c.w, c.wt, c.ok, c.g].every(isInt);
const isRoomInfo = (r: unknown): r is RoomInfo =>
  isObject(r) && isStr(r.id) && (r.status === 'waiting' || r.status === 'running' || r.status === 'paused' || r.status === 'ended' || r.status === 'failed') && isStr(r.map)
  && isInt(r.seats) && isInt(r.humans) && isInt(r.bots) && isInt(r.open) && isInt(r.round)
  && Array.isArray(r.score) && r.score.every(n => typeof n === 'number');

/**
 * The browser's door in: checks one text frame from the server and returns the message, or null when it
 * is not JSON, has another version, an unknown type, or a field of the wrong type. The browser trusts
 * nothing it did not get through here. Returns copies built field by field.
 * @example parseServerMessage('{"v":1,"t":"pong"}') // { v: 1, t: 'pong' }
 */
export function parseServerMessage(text: string): ServerMessage | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!isObject(raw) || raw.v !== PROTOCOL_VERSION) return null;
  const v = PROTOCOL_VERSION;
  switch (raw.t) {
    case 'pong': return { v, t: 'pong' };
    case 'error':
      return isStr(raw.code) && Object.hasOwn(ERROR_TEXT, raw.code) && isStr(raw.text) ? { v, t: 'error', code: raw.code as ErrorCode, text: raw.text } : null;
    case 'room':
      return isRoomView(raw) ? { v, t: 'room', roomId: raw.roomId, state: raw.state, mode: raw.mode, seats: raw.seats.map(s => ({ index: s.index, team: s.team, kind: s.kind, name: s.name })) } : null;
    case 'joined': {
      const y = raw.you;
      if (!isObject(y) || !isStr(y.name) || !isStr(y.room) || !isInt(y.seat) || !isInt(y.team) || !isRoomView(raw.room)) return null;
      const r = raw.room;
      return { v, t: 'joined', you: { name: y.name, room: y.room, seat: y.seat, team: y.team },
        room: { roomId: r.roomId, state: r.state, mode: r.mode, seats: r.seats.map(s => ({ index: s.index, team: s.team, kind: s.kind, name: s.name })) } };
    }
    case 'begin':
      return isStr(raw.map) && isInt(raw.seat) && raw.seat >= 0 && raw.seat < SEATS && isInt(raw.match) && typeof raw.hz === 'number' && raw.hz > 0
        && Array.isArray(raw.names) && raw.names.length === SEATS && raw.names.every(isStr) && isStr(raw.subject) && isStr(raw.level) && (LEVELS as readonly string[]).includes(raw.level)
        && typeof raw.friendlyFire === 'boolean' && typeof raw.buyTime === 'number' && Number.isFinite(raw.buyTime) && raw.buyTime >= 1 && raw.buyTime <= 600
        && typeof raw.streakRewards === 'boolean' && isMode(raw.mode)
        ? { v, t: 'begin', map: raw.map, seat: raw.seat, match: raw.match, hz: raw.hz, names: [...raw.names] as string[], subject: raw.subject, level: raw.level,
          friendlyFire: raw.friendlyFire, buyTime: raw.buyTime, streakRewards: raw.streakRewards, mode: raw.mode } : null;
    case 'snap': {
      const ok = isInt(raw.k) && isInt(raw.a) && (raw.ph === 'buy' || raw.ph === 'live' || raw.ph === 'post') && isInt(raw.pt) && isInt(raw.rt)
        && isInt(raw.r) && isNums(raw.s, 2) && isInt(raw.as) && isInt(raw.g) && isInt(raw.pl) && (isNums(raw.b, 7) || isNums(raw.b, 8)) && isNums(raw.y, 21) && (raw.y[20] === 0 || raw.y[20] === 1)
        && Array.isArray(raw.d) && raw.d.length <= PICKUPS_MAX && raw.d.every(r => (isNums(r, 4) || isNums(r, 5)) && isInt(r[0]) && (r[1] === 0 || r[1] === 1))
        && Array.isArray(raw.p) && raw.p.length <= SEATS && raw.p.every(r => (isNums(r, 12) || isNums(r, 13)) && isInt(r[0]) && r[0] >= 0 && r[0] < SEATS)
        && Array.isArray(raw.e) && raw.e.every(e => isObject(e) && isStr(e.type)) && (raw.m === 0 || raw.m === 1) && (raw.c === null || isCard(raw.c));
      if (!ok) return null;
      // JSON.parse built every array and object fresh, so they are kept as they are.
      return { v, t: 'snap', k: raw.k as number, a: raw.a as number, ph: raw.ph as string, pt: raw.pt as number, rt: raw.rt as number, r: raw.r as number,
        s: raw.s as number[], as: raw.as as number, g: raw.g as number, pl: raw.pl as number, b: raw.b as number[], p: raw.p as number[][], y: raw.y as number[], d: raw.d as number[][],
        e: raw.e as Record<string, unknown>[], m: raw.m as number, c: raw.c as CardView | null };
    }
    case 'results': {
      const nn = (x: unknown): x is number => isInt(x) && x >= 0;
      const ok = isInt(raw.match) && (raw.why === 'won' || raw.why === 'ended') && nn(raw.right) && nn(raw.wrong) && isInt(raw.pct) && raw.pct >= 0 && raw.pct <= 100
        && nn(raw.kills) && nn(raw.deaths) && Array.isArray(raw.topics) && raw.topics.length <= RESULT_TOPICS_MAX
        && raw.topics.every(r => isObject(r) && isStr(r.tp) && isStr(r.lv) && nn(r.right) && nn(r.wrong));
      if (!ok) return null;
      return { v, t: 'results', match: raw.match as number, why: raw.why as 'won' | 'ended', right: raw.right as number, wrong: raw.wrong as number, pct: raw.pct as number,
        kills: raw.kills as number, deaths: raw.deaths as number,
        topics: (raw.topics as Record<string, unknown>[]).map(r => ({ tp: r.tp as string, lv: r.lv as string, right: r.right as number, wrong: r.wrong as number })) };
    }
    case 'welcome': return Array.isArray(raw.rooms) && raw.rooms.every(isRoomInfo) ? { v, t: 'welcome', rooms: raw.rooms.map(r => ({ ...r })) } : null;
    default: return null;
  }
}

// ---- The teacher screen (story 006) -------------------------------------------------------------------
// A second door: the teacher's page connects to TEACHER_WS_PATH, which the server accepts only from its own PC
// (loopback). Same frame format ({ v, t, ... } JSON text) and the same PROTOCOL_VERSION. A student connection
// that sends one of these types is refused with 'not_teacher' and a strike (parseClientMessage above).

/** The page the teacher opens (served only to loopback; any other address gets a 403 in Spanish). */
export const TEACHER_PATH = '/profesor';
/** The teacher's WebSocket path (accepted only from loopback). */
export const TEACHER_WS_PATH = '/ws-profesor';
/** Every message type only the teacher may send. */
export const TEACHER_TYPES = ['tsession', 'tcsv', 'tsplit', 'taddroom', 'tmove', 'troom', 'tall', 'texport', 'tclear'] as const;

/**
 * Teacher to server: the session choices, applied to every room's next match. `topics` is empty for subject 'custom'.
 * `friendlyFire` and `buyTime` (whole seconds, inside tinfo's `buyTime` range) are the match options (story 017, protocol 7); `streakRewards` (story 018, protocol 11); `mode` the game mode (story 019, protocol 12).
 */
export interface TSessionMessage { v: number; t: 'tsession'; subject: string; level: Level; topics: string[]; map: string; friendlyFire: boolean; buyTime: number; streakRewards: boolean; mode: GameModeId }
/** Teacher to server: a CSV of questions. `data` is the file's bytes in base64 (the server decodes UTF-8, else Windows-1252, like single player). */
export interface TCsvMessage { v: number; t: 'tcsv'; name: string; data: string }
/** Teacher to server: "Repartir automáticamente": replace the waiting rooms by rooms of up to 4 v 4 holding the connected students. */
export interface TSplitMessage { v: number; t: 'tsplit' }
/** Teacher to server: add one empty waiting room. */
export interface TAddRoomMessage { v: number; t: 'taddroom' }
/** Teacher to server: move a student to a room and team; `seat` (0..7, inside that team) picks the seat, else the team's first free one. */
export interface TMoveMessage { v: number; t: 'tmove'; student: number; room: string; team: 0 | 1; seat?: number }
/** The things the teacher can do to a room. */
export type RoomAction = 'start' | 'pause' | 'resume' | 'end';
/** Teacher to server: start (waiting), pause (running), resume (paused) or end one room. */
export interface TRoomMessage { v: number; t: 'troom'; room: string; action: RoomAction }
/** Teacher to server: start every waiting room, or end every room. */
export interface TAllMessage { v: number; t: 'tall'; action: 'start' | 'end' }
/** Teacher to server: "Exportar CSV": asks for the results as CSV text (answered with `texported`). */
export interface TExportMessage { v: number; t: 'texport' }
/** Teacher to server: "Borrar resultados": forgets every student's results (a student mid-match counts from zero afterwards). */
export interface TClearMessage { v: number; t: 'tclear' }
/** Every message the teacher may send ('ping' is also accepted and answered with 'pong'). */
export type TeacherMessage = TSessionMessage | TCsvMessage | TSplitMessage | TAddRoomMessage | TMoveMessage | TRoomMessage | TAllMessage | TExportMessage | TClearMessage | PingMessage;

/** The catalogue the form is built from, sent once on connect. */
export interface TeacherInfoMessage {
  v: number; t: 'tinfo';
  subjects: { id: string; name: string; topics: { id: string; name: string }[] }[];
  levels: { id: string; name: string }[]; maps: { id: string; name: string }[];
  /** A topic is marked "to reinforce" when it has at least `weakMinAnswers` answers and fewer than `weakBelowPct` percent right. */
  weakBelowPct: number; weakMinAnswers: number;
  /** Largest CSV (bytes) and most questions the server accepts. */
  csvMaxBytes: number; csvMaxQuestions: number;
  /** The buy time's range and step in seconds (data/config.json buy_time), for the page's selector (story 017). */
  buyTime: { min: number; max: number; step: number };
  /** The game modes and their names, for the page's "Modo de juego" choice (story 019, protocol 12). */
  modes: { id: GameModeId; name: string }[];
}
/** One seat as the teacher sees it: `student` is the id used by tmove (null for a bot). */
export interface TeacherSeat { index: number; team: number; kind: 'human' | 'bot'; name: string; student: number | null }
/** One room as the teacher sees it. `managed` is false for demo rooms; ended rooms have no seats filled. */
export interface TeacherRoom {
  id: string; status: RoomInfo['status']; managed: boolean; map: string; round: number; score: number[]; matches: number;
  /** Why the room ended or failed ('' otherwise). */
  reason: string; seats: TeacherSeat[];
  /** The room's game mode (story 023, protocol 14); a waiting room shows the session's. */
  mode: GameModeId;
  /** Free for All only (story 023): who leads and the time left, in Spanish ('' in Bomba). */
  summary: string;
}
/** One student on the server. `connected` is false while their seat is held for a rejoin. `room` is '' when unseated. */
export interface TeacherStudent { id: number; name: string; connected: boolean; room: string; seat: number; team: number }
/** The session as set (applied to every room's next match). */
export interface TeacherSession {
  subject: string; level: Level; topics: string[]; map: string;
  /** The match options (story 017): shots hurt teammates; the buy phase's length in seconds. Story 018: streak rewards on. */
  friendlyFire: boolean; buyTime: number; streakRewards: boolean;
  /** The game mode (story 019). */
  mode: GameModeId;
  /** The CSV loaded (null for none): kept when another subject is chosen. */
  csv: { name: string; count: number; skipped: number } | null;
  /** Questions the choice has (the CSV's count for a custom file); null when they are generated without limit (math). */
  available: number | null;
}
/** The teacher's results: one row per student (by typed name) and one per topic, weakest first. Held in memory only. */
export interface TeacherResults {
  students: { name: string; room: string; right: number; wrong: number; kills: number; deaths: number }[];
  topics: { topic: string; right: number; wrong: number; students: number }[];
}
/**
 * Server to teacher: everything on screen. Sent on connect, after every teacher action, when something changed
 * (checked every teacher_update_ms) and at least every teacher_heartbeat_s. `rooms` lists live rooms by id, then
 * the last rooms that ended (newest last).
 */
export interface TeacherStateMessage { v: number; t: 'tstate'; session: TeacherSession; students: TeacherStudent[]; rooms: TeacherRoom[]; results: TeacherResults }
/** Server to teacher: the answer to a tcsv. */
export interface TeacherCsvMessage { v: number; t: 'tcsvok'; ok: boolean; name: string; count: number; skipped: number; text: string }
/** Server to teacher: the answer to texport. `text` is the whole CSV as a string that STARTS with U+FEFF (the byte-order mark; UTF-8 encoded it is EF BB BF); the page saves it as is as `name`. */
export interface TeacherExportMessage { v: number; t: 'texported'; name: string; text: string; rows: number }
/** Server to teacher: a request was refused; `text` is the Spanish sentence to show. */
export interface TeacherErrorMessage { v: number; t: 'terror'; code: string; text: string }
/** Every message the server sends the teacher (also 'pong'). */
export type TeacherReply = TeacherInfoMessage | TeacherStateMessage | TeacherCsvMessage | TeacherExportMessage | TeacherErrorMessage | PongMessage;

/** What parseTeacherMessage() returns. */
export type TeacherParsed = { ok: true; msg: TeacherMessage } | { ok: false; code: ErrorCode };
const ID = /^[a-z0-9_-]{1,32}$/, ROOM_ID = /^sala-\d{1,6}$/, B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const TKEYS: Record<TeacherMessage['t'], string[]> = {
  tsession: ['v', 't', 'subject', 'level', 'topics', 'map', 'friendlyFire', 'buyTime', 'streakRewards', 'mode'], tcsv: ['v', 't', 'name', 'data'], tsplit: ['v', 't'], taddroom: ['v', 't'],
  tmove: ['v', 't', 'student', 'room', 'team', 'seat'], troom: ['v', 't', 'room', 'action'], tall: ['v', 't', 'action'], texport: ['v', 't'], tclear: ['v', 't'], ping: ['v', 't'],
};
/**
 * Checks one text frame from the teacher's connection: size, JSON, version, type, exact keys and each field's
 * shape. Whether a subject, topic, map, room or student really exists is checked by the server (teacher.ts).
 * @example parseTeacherMessage('{"v":2,"t":"tsplit"}', 1000) // { ok: true, msg: { v: 2, t: 'tsplit' } }
 */
export function parseTeacherMessage(text: string, maxChars: number): TeacherParsed {
  if (text.length > maxChars) return { ok: false, code: 'too_big' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, code: 'not_json' }; }
  if (!isObject(raw)) return { ok: false, code: 'bad_shape' };
  if (raw.v !== PROTOCOL_VERSION) return { ok: false, code: 'bad_version' };
  const t = raw.t;
  if (typeof t !== 'string' || !Object.hasOwn(TKEYS, t)) return { ok: false, code: 'bad_type' };
  if (Object.keys(raw).some(k => !TKEYS[t as TeacherMessage['t']].includes(k))) return { ok: false, code: 'bad_shape' };
  const bad = { ok: false, code: 'bad_field' } as const, v = PROTOCOL_VERSION;
  switch (t as TeacherMessage['t']) {
    case 'ping': return { ok: true, msg: { v, t: 'ping' } };
    case 'tsplit': return { ok: true, msg: { v, t: 'tsplit' } };
    case 'taddroom': return { ok: true, msg: { v, t: 'taddroom' } };
    case 'texport': return { ok: true, msg: { v, t: 'texport' } };
    case 'tclear': return { ok: true, msg: { v, t: 'tclear' } };
    case 'tsession':
      if (!isStr(raw.subject) || !ID.test(raw.subject) || !isStr(raw.map) || !ID.test(raw.map) || !(LEVELS as readonly string[]).includes(raw.level as string)) return bad;
      if (!Array.isArray(raw.topics) || raw.topics.length > 32 || !raw.topics.every(x => isStr(x) && ID.test(x))) return bad;
      if (typeof raw.friendlyFire !== 'boolean' || !isInt(raw.buyTime) || typeof raw.streakRewards !== 'boolean' || !isMode(raw.mode)) return bad; // the range is the server's check (teacher.ts)
      return { ok: true, msg: { v, t: 'tsession', subject: raw.subject, level: raw.level as Level, topics: [...raw.topics] as string[], map: raw.map, friendlyFire: raw.friendlyFire, buyTime: raw.buyTime, streakRewards: raw.streakRewards, mode: raw.mode } };
    case 'tcsv':
      if (!isStr(raw.name) || raw.name.length < 1 || raw.name.length > 80 || !isStr(raw.data) || !B64.test(raw.data)) return bad;
      return { ok: true, msg: { v, t: 'tcsv', name: raw.name.replace(/[\u0000-\u001f<>]/g, '').trim() || 'preguntas.csv', data: raw.data } };
    case 'tmove':
      if (!isInt(raw.student) || raw.student < 0 || !isStr(raw.room) || !ROOM_ID.test(raw.room) || (raw.team !== 0 && raw.team !== 1)) return bad;
      if (raw.seat !== undefined && (!isInt(raw.seat) || raw.seat < 0 || raw.seat >= SEATS)) return bad;
      return { ok: true, msg: raw.seat === undefined ? { v, t: 'tmove', student: raw.student, room: raw.room, team: raw.team } : { v, t: 'tmove', student: raw.student, room: raw.room, team: raw.team, seat: raw.seat as number } };
    case 'troom':
      if (!isStr(raw.room) || !ROOM_ID.test(raw.room) || !(raw.action === 'start' || raw.action === 'pause' || raw.action === 'resume' || raw.action === 'end')) return bad;
      return { ok: true, msg: { v, t: 'troom', room: raw.room, action: raw.action } };
    case 'tall':
      if (raw.action !== 'start' && raw.action !== 'end') return bad;
      return { ok: true, msg: { v, t: 'tall', action: raw.action } };
  }
}
