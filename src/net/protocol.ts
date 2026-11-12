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
export interface HelloMessage { v: number; t: 'hello'; name: string }
/**
 * Client to server: the controls of one step, as src/game/player.ts reads them. Every field is optional
 * (a missing one is idle). The answer to a question card is the `answer` field (0..3, -1 for none) and a
 * purchase is `buyItem`: the server checks both against the match, like the single-player game does.
 */
export interface InputMessage { v: number; t: 'input'; input: Partial<PlayerInput> }
/** Client to server: a line check; the server answers pong. */
export interface PingMessage { v: number; t: 'ping' }
/** Every message a client may send. */
export type ClientMessage = HelloMessage | InputMessage | PingMessage;

/** A seat's state: a bot plays it, a student plays it, or it waits for a student. */
export type SeatKind = 'bot' | 'human' | 'open';
/** A room as the server shows it to clients and to the teacher screen: no names, only counts. */
export interface RoomInfo {
  id: string; status: 'running' | 'ended' | 'failed'; map: string;
  seats: number; humans: number; bots: number; open: number;
  round: number; score: number[];
}
/** Server to client: the hello was accepted; the rooms there are. */
export interface WelcomeMessage { v: number; t: 'welcome'; rooms: RoomInfo[] }
/** Server to client: the answer to a ping. */
export interface PongMessage { v: number; t: 'pong' }
/** Server to client: why a message was dropped (ERROR_TEXT has the sentence the page shows). */
export interface ErrorMessage { v: number; t: 'error'; code: ErrorCode; text: string }
/** Every message the server may send. */
export type ServerMessage = WelcomeMessage | PongMessage | ErrorMessage;

/** Why a message was refused. */
export type ErrorCode = 'too_big' | 'not_text' | 'not_json' | 'bad_shape' | 'bad_version' | 'bad_type' | 'bad_field' | 'bad_name'
  | 'rate_limited' | 'need_hello' | 'server_full';
/** The sentence a page shows for each error, in Spanish. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  too_big: 'Mensaje demasiado grande.',
  not_text: 'Solo se aceptan mensajes de texto.',
  not_json: 'El mensaje no es JSON.',
  bad_shape: 'El mensaje no tiene la forma esperada.',
  bad_version: 'Versión distinta: recarga la página del juego.',
  bad_type: 'Tipo de mensaje desconocido.',
  bad_field: 'Un campo del mensaje no es válido.',
  bad_name: 'El nombre no es válido: usa letras, números y espacios.',
  rate_limited: 'Demasiados mensajes: más despacio.',
  need_hello: 'Primero hay que presentarse (hello).',
  server_full: 'El servidor está lleno.',
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
const KEYS: Record<ClientMessage['t'], string[]> = { hello: ['v', 't', 'name'], input: ['v', 't', 'input'], ping: ['v', 't'] };
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
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
  if (t !== 'hello' && t !== 'input' && t !== 'ping') return { ok: false, code: 'bad_type' };
  if (Object.keys(raw).some(k => !KEYS[t].includes(k))) return { ok: false, code: 'bad_shape' };
  if (t === 'ping') return { ok: true, msg: { v: PROTOCOL_VERSION, t } };
  if (t === 'hello') {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > lim.maxName || !NAME.test(name)) return { ok: false, code: 'bad_name' };
    return { ok: true, msg: { v: PROTOCOL_VERSION, t, name } };
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
