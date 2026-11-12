// The browser's connection to the classroom server. BROWSER ONLY: it uses WebSocket, location and
// localStorage, so src/game and src/server must never import it (tsconfig.server.json leaves it out).
//
//   const conn = connect({ name: 'Ana', onJoined: m => showWaiting(m), onRoom: m => redraw(m),
//     onError: e => showMessage(e.text), onClosed: c => showJoinScreen(c.reason) });
//   conn.leave();   // the student leaves for good (the seat becomes a bot at once)
//
// A dropped connection (Wi-Fi, a sleeping tablet) is retried a few times with a growing wait, saying hello
// again with the name the server gave, so the student gets the same seat back. A page reload does the same
// from the join screen: savedName() prefills the name and connect() with it returns the held seat.
// Nothing is stored but the typed name, in localStorage, wrapped in try/catch (it may be blocked).
import { PROTOCOL_VERSION, WS_PATH, parseServerMessage, type BeginMessage, type ErrorCode, type JoinedMessage, type ResultsMessage, type RoomMessage, type SnapMessage } from './protocol';
import { idleInput, type PlayerInput } from '../game/player';

/** Why the connection ended for good. */
export type CloseReason =
  | 'refused'      // the server answered with a fatal error (blank/invalid name, sin_cupo, bad_version, server_full): onError got it first
  | 'left'         // leave() was called
  | 'closed'       // close() was called (the seat is held for the grace on the server)
  | 'unreachable'  // the very first connection never opened
  | 'gave_up';     // the retries ran out
/** The reconnect waits (ms) before each retry: 6 retries, about 45 s in all. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000, 15000];

/** What connect() takes. Every callback is optional. */
export interface ConnectOptions {
  /** The name typed by the student (trimmed by the server; 1-20 characters). */
  name: string;
  /** The WebSocket address; by default ws(s)://<this page's host>/ws. */
  url?: string;
  /** Waits (ms) before each retry; by default RETRY_DELAYS_MS. An empty list means no retries. */
  retryDelaysMs?: readonly number[];
  /** The student has a seat (the first time, and again after every successful rejoin). */
  onJoined?: (m: JoinedMessage) => void;
  /** The seating of the student's room changed. state 'ended' means the room closed: the student may connect again. */
  onRoom?: (m: RoomMessage) => void;
  /** The server refused or dropped something; `text` is Spanish, ready to show. */
  onError?: (e: { code: ErrorCode; text: string }) => void;
  /** The connection was lost and a retry is scheduled in `inMs` ms (attempt 1..max). Show "Reconectando...". */
  onReconnecting?: (attempt: number, max: number, inMs: number) => void;
  /** The connection ended for good; no more callbacks follow. */
  onClosed?: (c: { reason: CloseReason }) => void;
  /** A match starts for the student (after joined, a rejoin, a rematch): build the copy with createMirror(). */
  onBegin?: (m: BeginMessage) => void;
  /** A snapshot arrived (snapshot_hz a second): give it to applySnapshot(). */
  onSnapshot?: (m: SnapMessage) => void;
  /** The snapshot's events, right after onSnapshot, when there are any (applySnapshot returns the same list). */
  onEvents?: (events: SnapMessage['e']) => void;
  /** The student's OWN results for the match that ended (once a match: after its matchEnd snapshot, or when the teacher ends the room). */
  onResults?: (m: ResultsMessage) => void;
  /**
   * Testing only: milliseconds every message waits, each way, before it is sent or read (so 100 gives a 200 ms
   * round trip). By default the page address's ?retraso=<ms> (0 to 1000), else 0.
   */
  simDelayMs?: number;
}
/** A live connection. */
export interface Connection {
  /** The student leaves: tells the server (the seat is a bot at once), closes, and fires onClosed('left'). */
  leave(): void;
  /** Closes without leaving: the server holds the seat for the grace. Fires onClosed('closed'). */
  close(): void;
  /** The name the server gave (e.g. "Ana (2)"), or the typed one until joined. */
  name(): string;
  /** Sends one step's controls with its seq (from predict()); only the fields that are not idle travel. Dropped while not connected. */
  sendInput(seq: number, input: PlayerInput): void;
}

/** The ?retraso=<ms> of the page address, 0 to 1000 (0 outside a browser). */
function delayFromAddress(): number {
  const v = typeof location === 'undefined' ? 0 : Number(new URLSearchParams(location.search).get('retraso'));
  return Number.isFinite(v) ? Math.max(0, Math.min(1000, v)) : 0;
}
const IDLE = idleInput();
/** The fields of `input` that differ from an idle input. */
function compact(input: PlayerInput): Partial<PlayerInput> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const idle = (IDLE as unknown as Record<string, unknown>)[k];
    if (Array.isArray(v) ? v.length > 0 : v !== idle) out[k] = v;
  }
  return out as Partial<PlayerInput>;
}

const NAME_KEY = 'aula.nombre';
/** Errors after which retrying cannot help. */
const FATAL: readonly ErrorCode[] = ['name_empty', 'bad_name', 'sin_cupo', 'bad_version', 'server_full'];

/** The last name typed on this device, or '' (localStorage may be missing or blocked). */
export function savedName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

/**
 * Opens the connection, says hello and keeps the student seated across drops. Never throws: a bad address
 * or a blocked socket arrives as onClosed.
 * @example const conn = connect({ name: savedName() || 'Ana', onJoined: m => console.log(m.you.room, m.you.team) });
 */
export function connect(opts: ConnectOptions): Connection {
  const delays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  const url = opts.url ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${WS_PATH}`;
  let name = opts.name, ws: WebSocket | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  let everJoined = false, seated = false, attempt = 0, done = false;
  const delay = opts.simDelayMs ?? delayFromAddress();
  /** Sends now, or after the simulated delay (equal delays keep the order). */
  const sendText = (s: WebSocket, text: string): void => {
    const go = (): void => { if (s.readyState === WebSocket.OPEN) s.send(text); };
    if (delay > 0) setTimeout(go, delay); else go();
  };

  const finish = (reason: CloseReason): void => {
    if (done) return;
    done = true; clearTimeout(timer);
    const s = ws; ws = null;
    if (s) { s.onopen = s.onmessage = s.onclose = s.onerror = null; try { s.close(); } catch { /* already closed */ } }
    opts.onClosed?.({ reason });
  };
  const open = (): void => {
    let s: WebSocket;
    try { s = new WebSocket(url); } catch { finish('unreachable'); return; }
    ws = s;
    s.onopen = () => sendText(s, JSON.stringify(attempt > 0 ? { v: PROTOCOL_VERSION, t: 'hello', name, rejoin: true } : { v: PROTOCOL_VERSION, t: 'hello', name }));
    const read = (data: unknown): void => {
      const m = typeof data === 'string' ? parseServerMessage(data) : null;
      if (!m || done || ws !== s) return;
      if (m.t === 'joined') {
        everJoined = true; seated = true; attempt = 0; name = m.you.name;
        try { localStorage.setItem(NAME_KEY, opts.name.trim()); } catch { /* blocked: no prefill */ }
        opts.onJoined?.(m);
      } else if (m.t === 'room') opts.onRoom?.(m);
      else if (m.t === 'begin') opts.onBegin?.(m);
      else if (m.t === 'snap') { opts.onSnapshot?.(m); if (m.e.length) opts.onEvents?.(m.e); }
      else if (m.t === 'results') opts.onResults?.(m);
      else if (m.t === 'error') {
        opts.onError?.({ code: m.code, text: m.text });
        if (FATAL.includes(m.code)) finish('refused');
      }
    };
    s.onmessage = ev => { if (delay > 0) setTimeout(() => read(ev.data), delay); else read(ev.data); };
    s.onclose = () => {
      if (done || ws !== s) return;
      ws = null; seated = false;
      if (!everJoined) { finish('unreachable'); return; }
      if (attempt >= delays.length) { finish('gave_up'); return; }
      const wait = delays[attempt++];
      opts.onReconnecting?.(attempt, delays.length, wait);
      timer = setTimeout(open, wait);
    };
    s.onerror = () => { /* onclose follows and decides */ };
  };
  open();
  return {
    leave() {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'leave' })); // not delayed: finish() closes at once
      finish('left');
    },
    close: () => finish('closed'),
    name: () => name,
    sendInput(seq, input) { if (ws && seated) sendText(ws, JSON.stringify({ v: PROTOCOL_VERSION, t: 'input', seq, input: compact(input) })); },
  };
}
