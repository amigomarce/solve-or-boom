// The classroom wire format: every message between a student's browser and the teacher's server.
// Shared by the server (src/server/) and, from story 004 on, the browser client. No browser and no
// Node in here: plain TypeScript, so both sides import it.
//
// Every message is one JSON text frame: { "v": PROTOCOL_VERSION, "t": "<type>", ...fields }.
// A client may only say who it is (hello), send its controls and answers (input) and check the line
// (ping). It never sends positions, money, health or results: the server owns the match and works
// those out itself. parseClientMessage() is the only door in; anything it refuses is dropped.
import type { PlayerInput } from '../game/player';

/** The format's version. A message with another `v` is refused, so an old page gets a clear error. */
export const PROTOCOL_VERSION = 1;
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
}
/** Client to server: the student leaves for good; the seat becomes a bot at once (no grace). */
export interface LeaveMessage { v: number; t: 'leave' }
/**
 * Client to server: the controls of one step, as src/game/player.ts reads them. Every field is optional
 * (a missing one is idle). The answer to a question card is the `answer` field (0..3, -1 for none) and a
 * purchase is `buyItem`: the server checks both against the match, like the single-player game does.
 */
export interface InputMessage { v: number; t: 'input'; input: Partial<PlayerInput> }
/** Client to server: a line check; the server answers pong. */
export interface PingMessage { v: number; t: 'ping' }
/** Every message a client may send. */
export type ClientMessage = HelloMessage | InputMessage | PingMessage | LeaveMessage;

/** A seat's state: a bot plays it, a student plays it, or it waits for a student. */
export type SeatKind = 'bot' | 'human' | 'open';
/** A room as the server shows it to clients and to the teacher screen: no names, only counts. */
export interface RoomInfo {
  id: string; status: 'running' | 'ended' | 'failed'; map: string;
  seats: number; humans: number; bots: number; open: number;
  round: number; score: number[];
}
/** A room's state as students see it. Rooms start 'running'; 'waiting' and 'paused' are reserved for the teacher screen (story 006). */
export type RoomState = 'waiting' | 'running' | 'paused' | 'ended';
/** One seat as students see it. Open seats are shown as bots. `name` is a student's name or the bot's ("Bot 3"); display only. */
export interface SeatView { index: number; team: number; kind: 'human' | 'bot'; name: string }
/** A room's seating: who sits where. Seats are always 8, in index order (0-3 team 0, 4-7 team 1). */
export interface RoomView { roomId: string; state: RoomState; seats: SeatView[] }
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
/** Every message the server may send. */
export type ServerMessage = WelcomeMessage | JoinedMessage | RoomMessage | PongMessage | ErrorMessage;

/** Why a message was refused. */
export type ErrorCode = 'too_big' | 'not_text' | 'not_json' | 'bad_shape' | 'bad_version' | 'bad_type' | 'bad_field' | 'bad_name'
  | 'rate_limited' | 'need_hello' | 'server_full'
  | 'name_empty' | 'sin_cupo';
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
  sin_cupo: 'No queda ningún sitio libre en las salas. Avisa al profesor.',
};

/** The limits parseClientMessage() applies (data/aula.json). */
export interface ProtocolLimits { maxChars: number; maxName: number; maxLook: number }
/** What parseClientMessage() returns: the message, or why it was refused. */
export type Parsed = { ok: true; msg: ClientMessage } | { ok: false; code: ErrorCode };

type Check = (v: unknown, lim: ProtocolLimits) => boolean;
const isBool: Check = v => typeof v === 'boolean';
const isAxis: Check = v => v === -1 || v === 0 || v === 1;
const isLook: Check = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim.maxLook;
/** Each input field and the values it may hold. Typed by PlayerInput, so a new control must be added here. */
const INPUT_FIELDS: Record<keyof PlayerInput, Check> = {
  moveF: isAxis, moveS: isAxis, walk: isBool, sprint: isBool, crouch: isBool, use: isBool, usePress: isBool,
  fire: isBool, firePress: isBool, lookLeft: isBool, lookRight: isBool, lookUp: isBool, lookDown: isBool,
  lookYaw: isLook, lookPitch: isLook, shop: isBool, prone: isBool, jump: isBool, primary: isBool, pistol: isBool,
  swap: isBool, reload: isBool, scope: isBool,
  digits: v => Array.isArray(v) && v.length <= 5 && v.every(d => Number.isInteger(d) && d >= 0 && d <= 4),
  buyItem: v => typeof v === 'string' && v.length <= 16 && /^[a-z]*$/.test(v),
  answer: v => Number.isInteger(v) && (v as number) >= -1 && (v as number) <= 3,
  closeShop: isBool, closeCard: isBool, spectate: isBool, spectateKey: isBool,
};
/** The keys each message type may carry; any other key refuses the message. */
const KEYS: Record<ClientMessage['t'], string[]> = { hello: ['v', 't', 'name', 'rejoin'], input: ['v', 't', 'input'], ping: ['v', 't'], leave: ['v', 't'] };
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks one text frame from a client and returns the message, or the reason it is refused: too long,
 * not JSON, not an object, another version, an unknown type, an unknown or extra key, or a field out of
 * its range. The input returned holds only known fields, copied one by one.
 * @example parseClientMessage('{"v":1,"t":"ping"}', { maxChars: 2048, maxName: 20, maxLook: 3.2 }) // { ok: true, msg: { v: 1, t: 'ping' } }
 */
export function parseClientMessage(text: string, lim: ProtocolLimits): Parsed {
  if (text.length > lim.maxChars) return { ok: false, code: 'too_big' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, code: 'not_json' }; }
  if (!isObject(raw)) return { ok: false, code: 'bad_shape' };
  if (raw.v !== PROTOCOL_VERSION) return { ok: false, code: 'bad_version' };
  const t = raw.t;
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
    return { ok: true, msg: raw.rejoin ? { v: PROTOCOL_VERSION, t, name, rejoin: true } : { v: PROTOCOL_VERSION, t, name } };
  }
  if (!isObject(raw.input)) return { ok: false, code: 'bad_shape' };
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw.input)) {
    const check = Object.hasOwn(INPUT_FIELDS, k) ? INPUT_FIELDS[k as keyof PlayerInput] : undefined;
    if (!check || !check(v, lim)) return { ok: false, code: 'bad_field' };
    input[k] = Array.isArray(v) ? [...v] : v;
  }
  return { ok: true, msg: { v: PROTOCOL_VERSION, t, input: input as Partial<PlayerInput> } };
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
  && Array.isArray(r.seats) && r.seats.length === SEATS && r.seats.every(isSeatView);
const isRoomInfo = (r: unknown): r is RoomInfo =>
  isObject(r) && isStr(r.id) && (r.status === 'running' || r.status === 'ended' || r.status === 'failed') && isStr(r.map)
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
      return isRoomView(raw) ? { v, t: 'room', roomId: raw.roomId, state: raw.state, seats: raw.seats.map(s => ({ index: s.index, team: s.team, kind: s.kind, name: s.name })) } : null;
    case 'joined': {
      const y = raw.you;
      if (!isObject(y) || !isStr(y.name) || !isStr(y.room) || !isInt(y.seat) || !isInt(y.team) || !isRoomView(raw.room)) return null;
      const r = raw.room;
      return { v, t: 'joined', you: { name: y.name, room: y.room, seat: y.seat, team: y.team },
        room: { roomId: r.roomId, state: r.state, seats: r.seats.map(s => ({ index: s.index, team: s.team, kind: s.kind, name: s.name })) } };
    }
    case 'welcome': return Array.isArray(raw.rooms) && raw.rooms.every(isRoomInfo) ? { v, t: 'welcome', rooms: raw.rooms.map(r => ({ ...r })) } : null;
    default: return null;
  }
}
