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
import { PROTOCOL_VERSION, WS_PATH, parseServerMessage, type ErrorCode, type JoinedMessage, type RoomMessage } from './protocol';

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
}
/** A live connection. */
export interface Connection {
  /** The student leaves: tells the server (the seat is a bot at once), closes, and fires onClosed('left'). */
  leave(): void;
  /** Closes without leaving: the server holds the seat for the grace. Fires onClosed('closed'). */
  close(): void;
  /** The name the server gave (e.g. "Ana (2)"), or the typed one until joined. */
  name(): string;
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
  let everJoined = false, attempt = 0, done = false;

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
    s.onopen = () => s.send(JSON.stringify(attempt > 0 ? { v: PROTOCOL_VERSION, t: 'hello', name, rejoin: true } : { v: PROTOCOL_VERSION, t: 'hello', name }));
    s.onmessage = ev => {
      const m = typeof ev.data === 'string' ? parseServerMessage(ev.data) : null;
      if (!m || done) return;
      if (m.t === 'joined') {
        everJoined = true; attempt = 0; name = m.you.name;
        try { localStorage.setItem(NAME_KEY, opts.name.trim()); } catch { /* blocked: no prefill */ }
        opts.onJoined?.(m);
      } else if (m.t === 'room') opts.onRoom?.(m);
      else if (m.t === 'error') {
        opts.onError?.({ code: m.code, text: m.text });
        if (FATAL.includes(m.code)) finish('refused');
      }
    };
    s.onclose = () => {
      if (done || ws !== s) return;
      ws = null;
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
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'leave' }));
      finish('left');
    },
    close: () => finish('closed'),
    name: () => name,
  };
}
