// The classroom server's network side: one HTTP server on one port serves the game's page (the single-file
// build) and takes WebSocket connections on WS_PATH. Every incoming message goes through
// parseClientMessage(); a connection over its message allowance or with too many refused messages is closed.
// NOT SOURCEABLE in docs/engine-reference/web/ (no Node or WebSocket there): checked against the installed
// ws 8.22.2 (node_modules/ws/wrapper.mjs exports) and @types/ws 8.18.2 (index.d.mts: WebSocketServer options
// server, path, maxPayload; 'connection', 'message' (data, isBinary), 'pong', 'error', 'close' events;
// ping(), terminate(), close(code, reason)), and Node 22's node:http (closeAllConnections) and node:net.
import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMessage, parseTeacherMessage, errorMessage, ERROR_TEXT, PROTOCOL_VERSION, WS_PATH, TEACHER_PATH, TEACHER_WS_PATH, type ErrorCode, type ServerMessage, type ProtocolLimits, type TeacherReply, RESULT_TOPICS_MAX } from '../net/protocol';
import { createTeacher, type Teacher, type TeacherLimits } from './teacher';
import type { Rooms } from './rooms';
import type { Room } from './room';
import { STEP } from '../game/match';
import { createLobby } from './lobby';
import { queueInput, ackOf } from './room';
import { buildSnapshot } from '../net/snapshot';
import { nameKey, newTally, type Results } from './results';

/** A page the server serves: its content type and bytes. The teacher screen (story 006) adds its own. */
export interface Page { type: string; body: Buffer }
/** The network limits (data/aula.json). */
export interface NetLimits extends ProtocolLimits {
  maxConnections: number; rejoinGraceS: number; lobbyTickMs: number; perSecond: number; burst: number; maxStrikes: number; pingIntervalS: number;
  /** Snapshots per second to each student (the step rate divided by a whole number of steps). */
  snapshotHz: number;
  /** Metres within which a student gets another player's shot event. */
  eventRangeM: number;
}
/** What the network side needs: the rooms, the pages by path, a clock in ms, and the logs. */
export interface NetDeps {
  rooms: Rooms; pages: Map<string, Page>; clockMs: () => number;
  /** The teacher's results store (memory only); the same one the rooms count into. */
  results: Results;
  /** When given, the teacher role is served: the page `/profesor` (put it in `pages`) and the WebSocket at TEACHER_WS_PATH, both for loopback only. */
  teacher?: TeacherNetLimits;
  log: (line: string) => void; warn: (kind: string, line: string) => void;
}
/** The teacher role's limits (data/aula.json): the teacher brain's, how often state is checked and pushed, and the largest frame. */
export interface TeacherNetLimits extends TeacherLimits { updateMs: number; heartbeatS: number; maxChars: number }
/**
 * True when a socket's remote address is this PC itself (127.0.0.1, ::1 or ::ffff:127.0.0.1). Read from the
 * socket, never from a header, so a client cannot claim it. A request to the PC's own LAN address arrives from
 * that LAN address and is NOT loopback.
 */
export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
/** The host names a page on this PC uses for the server: a Host or Origin naming anything else is a foreign page (or DNS rebinding). */
const LOCAL_NAMES = ['localhost', '127.0.0.1', '[::1]'];
/** True when a Host header is one of LOCAL_NAMES with the server's port (the port may be left out only on port 80). */
export function isLocalHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return LOCAL_NAMES.some(n => h === `${n}:${port}` || (port === 80 && h === n));
}
/** True when an Origin header is absent (not a browser page) or is http(s) on one of LOCAL_NAMES with the server's port. */
export function isLocalOrigin(origin: string | undefined, port: number): boolean {
  if (origin === undefined) return true;
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  const p = u.port === '' ? (u.protocol === 'https:' ? 443 : 80) : Number(u.port);
  return (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_NAMES.includes(u.hostname) && p === port;
}
const FORBIDDEN_TEXT = 'Acceso denegado: esta página solo se abre desde el PC del profesor (localhost).';
/** The running network side. */
export interface Net {
  /** The port it listens on (the asked one, or the next free one). */
  port: number;
  /** The teacher role, when it was asked for. */
  teacher: Teacher | null;
  /** Connections open now, and messages dropped since start. */
  counts(): { students: number; connections: number; dropped: number; accepted: number; snapshots: number; snapshotBytes: number };
  /** Closes every connection and the port. */
  close(): Promise<void>;
}

/** One connection's state: no name is kept beyond `named`, and no address at all. */
interface Conn { id: number; tokens: number; lastT: number; strikes: number; alive: boolean; began: string }

/**
 * Listens on `port` on every interface (the next free port when it is busy, up to `tries` ports), serving
 * the pages and the WebSocket.
 * @example const net = await startNet(3000, 20, limits, { rooms, pages, clockMs: () => performance.now(), log, warn });
 */
export async function startNet(port: number, tries: number, lim: NetLimits, deps: NetDeps): Promise<Net> {
  const http: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if ((path === TEACHER_PATH || path.startsWith(TEACHER_PATH + '/')) && (!isLoopback(req.socket.remoteAddress) || !isLocalHost(req.headers.host, at))) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end(FORBIDDEN_TEXT); return;
    }
    const page = deps.pages.get(path);
    if (!page || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado'); return; }
    res.writeHead(200, { 'content-type': page.type, 'content-length': page.body.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : page.body);
  });
  let at = port;
  for (;; at++) {
    const err = await new Promise<NodeJS.ErrnoException | null>(done => {
      http.once('error', done);
      http.listen(at, '0.0.0.0', () => { http.off('error', done); done(null); });
    });
    if (!err) break;
    if (err.code !== 'EADDRINUSE' || at - port + 1 >= tries) throw err;
    deps.log(`El puerto ${at} está ocupado; pruebo el ${at + 1}.`);
  }
  http.on('error', e => deps.warn('http', `Error HTTP: ${e.message}`));

  // Both WebSocket servers take upgrades by hand (noServer) so one handler can route by path and gate the teacher's.
  const wss = new WebSocketServer({ noServer: true, maxPayload: lim.maxChars, perMessageDeflate: false });
  const twss = new WebSocketServer({ noServer: true, maxPayload: deps.teacher?.maxChars ?? 1024, perMessageDeflate: false });
  http.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {}); // a reset during the handshake must not become an uncaught error
    const path = (req.url ?? '/').split('?')[0];
    const reject = (line: string, body = ''): void => {
      const bytes = Buffer.from(body);
      socket.write(`HTTP/1.1 ${line}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${bytes.length}\r\n\r\n`); socket.end(bytes); socket.destroy();
    };
    if (path === WS_PATH) wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    else if (path === TEACHER_WS_PATH && deps.teacher) {
      const origin = req.headers.origin;
      if (!isLoopback(req.socket.remoteAddress) || !isLocalHost(req.headers.host, at) || !isLocalOrigin(origin, at)) {
        deps.warn('teacher-refused', 'Conexión de profesor rechazada: no viene de la página del profesor en este PC'); reject('403 Forbidden', FORBIDDEN_TEXT); return;
      }
      twss.handleUpgrade(req, socket, head, ws => twss.emit('connection', ws, req));
    } else reject('404 Not Found');
  });
  const conns = new Map<WebSocket, Conn>();
  let made = 0, dropped = 0, accepted = 0, snapshots = 0, snapshotBytes = 0;
  const send = (ws: WebSocket, msg: ServerMessage): void => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
  const refuse = (ws: WebSocket, c: Conn, code: ErrorCode): void => {
    dropped++; c.strikes++;
    deps.warn('refused-' + code, `Mensaje descartado (${code}) de la conexión ${c.id}`);
    if (c.strikes >= lim.maxStrikes) { deps.log(`Conexión ${c.id} cerrada: demasiados mensajes descartados`); ws.close(1008, 'demasiados mensajes no válidos'); return; }
    if (code !== 'rate_limited' || c.strikes % 10 === 1) send(ws, errorMessage(code));
  };
  const byId = new Map<number, WebSocket>();
  const lobby = createLobby({ rejoinGraceS: lim.rejoinGraceS, maxName: lim.maxName }, {
    rooms: deps.rooms, clockMs: deps.clockMs, log: deps.log,
    send: (id, msg) => { const ws = byId.get(id); if (ws) send(ws, msg); },
    isAlive: id => { const ws = byId.get(id); return !!ws && !!conns.get(ws)?.alive; },
    close: id => { byId.get(id)?.close(4000, 'sesión recuperada desde otra conexión'); },
    rebegin: id => { const ws = byId.get(id), c = ws && conns.get(ws); if (c) c.began = ''; },
  });
  const lobbyTimer = setInterval(lobby.tick, lim.lobbyTickMs);
  // ---- the teacher role: its own connections, the same frame format, loopback only ----
  const teacher = deps.teacher ? createTeacher(deps.teacher, { rooms: deps.rooms, lobby, results: deps.results, log: deps.log }) : null;
  const tconns = new Set<WebSocket>();
  const tsend = (ws: WebSocket, msg: TeacherReply): void => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
  let lastState = '', lastStateAt = 0;
  /** Sends the state to every teacher page, when it changed or `force`d or the heartbeat is due. */
  const pushState = (force: boolean): void => {
    if (!teacher || !tconns.size) return;
    const text = JSON.stringify(teacher.state()), now = deps.clockMs();
    if (!force && text === lastState && now - lastStateAt < deps.teacher!.heartbeatS * 1000) return;
    lastState = text; lastStateAt = now;
    for (const ws of tconns) if (ws.readyState === ws.OPEN) ws.send(text);
  };
  const teacherTimer = teacher ? setInterval(() => pushState(false), deps.teacher!.updateMs) : undefined;
  twss.on('connection', ws => {
    tconns.add(ws);
    ws.on('error', e => deps.warn('ws-teacher', `Conexión de profesor: ${e.message}`));
    ws.on('close', () => tconns.delete(ws));
    tsend(ws, teacher!.info()); ws.send(JSON.stringify(teacher!.state()));
    ws.on('message', (data, isBinary) => {
      const parsed = isBinary ? null : parseTeacherMessage(data.toString(), deps.teacher!.maxChars);
      if (!parsed || !parsed.ok) { const code = parsed ? parsed.code : 'not_text'; tsend(ws, { v: PROTOCOL_VERSION, t: 'terror', code, text: ERROR_TEXT[code] }); return; }
      try {
        const reply = teacher!.handle(parsed.msg);
        if (reply) tsend(ws, reply);
        freezeFrames();
        pushState(true);
      } catch (e) {
        deps.warn('teacher-fault', `Error al atender al profesor: ${e instanceof Error ? e.message : String(e)}`);
        tsend(ws, { v: PROTOCOL_VERSION, t: 'terror', code: 'interno', text: 'Error interno del servidor: inténtalo otra vez.' });
      }
    });
  });
  // Every snapEvery steps, each connected student of the room gets a snapshot with the events since the last one;
  // a `begin` goes first when their match is new to them (joined, rejoined, a rematch). After a rematch, a student
  // who was in the old match gets its last snapshot (with its matchEnd) before the new match's begin.
  const snapEvery = Math.max(1, Math.round(1 / STEP / lim.snapshotHz));
  /** Sends the room's current match `begin` to one student and marks it sent. */
  const sendBegin = (ws: WebSocket, c: Conn, room: Room, seat: number): void => {
    c.began = `${room.id}:${room.matchNo}`;
    send(ws, { v: PROTOCOL_VERSION, t: 'begin', map: room.match.opts.map, seat, match: room.matchNo, hz: 1 / STEP / snapEvery, names: room.match.players.map(p => p.name),
      subject: room.match.opts.subject, level: room.match.opts.level });
  };
  /**
   * A paused room is not stepped, so nobody who sat down in it since the pause (a join, a rejoin, a teacher's move) got
   * its match: they get the `begin` and one snapshot (no events) now, and see the match frozen with the pause banner.
   */
  const freezeFrames = (): void => {
    for (const room of deps.rooms.all()) {
      if (room.status !== 'paused') continue;
      for (const seat of room.seats) {
        const ws = seat.kind === 'human' && seat.owner !== null ? byId.get(seat.owner) : undefined;
        const c = ws && conns.get(ws);
        if (!ws || !c || ws.readyState !== ws.OPEN || c.began === `${room.id}:${room.matchNo}`) continue;
        sendBegin(ws, c, room, seat.index);
        send(ws, buildSnapshot(room.match, seat.index, ackOf(room, seat.index), room.stats.steps, [], lim.eventRangeM));
      }
    }
  };
  /**
   * Sends the student in `seat` their OWN results for the match whose counts are in `room.report` (just won) or, when
   * the room is ending early, `room.tally`. Nobody else's counts are ever in the message.
   */
  const sendResults = (ws: WebSocket, room: Room, seat: number, won: boolean, matchNo: number): void => {
    const name = room.seats[seat].name, t = (room.report ?? room.tally).get(nameKey(name ?? '')) ?? newTally();
    const total = t.right + t.wrong;
    const topics = [...t.cells.values()].sort((a, b) => a.topic.localeCompare(b.topic, 'es') || a.level.localeCompare(b.level))
      .slice(0, RESULT_TOPICS_MAX).map(c => ({ tp: c.topic, lv: c.level, right: c.right, wrong: c.wrong }));
    send(ws, { v: PROTOCOL_VERSION, t: 'results', match: matchNo, why: won ? 'won' : 'ended', right: t.right, wrong: t.wrong,
      pct: total ? Math.round(100 * t.right / total) : 0, kills: t.kills, deaths: t.deaths, topics });
  };
  /** Sends every connected student of the room their own results, once per match. */
  const sendAllResults = (room: Room, won: boolean): void => {
    if (room.reported) return;
    room.reported = true;
    for (const seat of room.seats) {
      const ws = seat.kind === 'human' && seat.owner !== null ? byId.get(seat.owner) : undefined;
      if (ws && ws.readyState === ws.OPEN) sendResults(ws, room, seat.index, won, room.matchNo - (room.last ? 1 : 0));
    }
  };
  deps.rooms.onRetired = room => { if (room.status === 'ended' || room.status === 'failed') sendAllResults(room, false); };
  deps.rooms.onStepped = room => {
    if (room.stats.steps % snapEvery !== 0 && !room.report) return; // the step a match is won always sends, so matchEnd reaches the students
    for (const seat of room.seats) {
      const ws = seat.kind === 'human' && seat.owner !== null ? byId.get(seat.owner) : undefined;
      const c = ws && conns.get(ws);
      if (!ws || !c || ws.readyState !== ws.OPEN) continue;
      const tag = `${room.id}:${room.matchNo}`;
      if (c.began !== tag) {
        if (room.last && c.began === `${room.id}:${room.matchNo - 1}`) send(ws, buildSnapshot(room.last.match, seat.index, ackOf(room, seat.index), room.stats.steps, room.last.events, lim.eventRangeM));
        if (room.report) sendResults(ws, room, seat.index, true, room.matchNo - 1);
        sendBegin(ws, c, room, seat.index);
      }
      const text = JSON.stringify(buildSnapshot(room.match, seat.index, ackOf(room, seat.index), room.stats.steps, room.pending, lim.eventRangeM));
      ws.send(text); snapshots++; snapshotBytes += Buffer.byteLength(text);
    }
    if (room.report && room.status === 'ended') sendAllResults(room, true); // a won match in a room that does not rematch (a rematch's students got theirs ahead of the next begin)
    room.report = null; room.pending.length = 0; room.last = null;
  };
  wss.on('error', e => deps.warn('ws', `Error WebSocket: ${e.message}`));
  wss.on('connection', ws => {
    const c: Conn = { id: ++made, tokens: lim.burst, lastT: deps.clockMs(), strikes: 0, alive: true, began: '' };
    ws.on('error', e => deps.warn('ws-conn', `Conexión ${c.id}: ${e.message}`)); // a frame over maxPayload lands here, then the socket closes
    if (conns.size >= lim.maxConnections) { send(ws, errorMessage('server_full')); ws.close(1013, 'lleno'); return; }
    conns.set(ws, c); byId.set(c.id, ws);
    ws.on('pong', () => { c.alive = true; });
    ws.on('close', () => { conns.delete(ws); if (byId.get(c.id) === ws) byId.delete(c.id); lobby.dropped(c.id); });
    ws.on('message', (data, isBinary) => {
      if (c.strikes >= lim.maxStrikes) return; // closing: the frames still buffered are not read
      const now = deps.clockMs();
      c.tokens = Math.min(lim.burst, c.tokens + (now - c.lastT) / 1000 * lim.perSecond); c.lastT = now;
      if (c.tokens < 1) { refuse(ws, c, 'rate_limited'); return; }
      c.tokens--;
      if (isBinary) { refuse(ws, c, 'not_text'); return; }
      const parsed = parseClientMessage(data.toString(), lim);
      if (!parsed.ok) { refuse(ws, c, parsed.code); return; }
      const msg = parsed.msg;
      if (msg.t === 'ping') { accepted++; send(ws, { v: PROTOCOL_VERSION, t: 'pong' }); return; }
      if (msg.t === 'hello') { accepted++; lobby.hello(c.id, msg.name, msg.rejoin === true); freezeFrames(); return; }
      if (msg.t === 'leave') { accepted++; lobby.leave(c.id); return; }
      const at = lobby.where(c.id);
      if (!at) { refuse(ws, c, 'need_hello'); return; }
      accepted++;
      if (at.room.status === 'running') queueInput(at.room, at.seat, msg.seq, msg.input);
    });
  });
  const pinger = setInterval(() => {
    for (const [ws, c] of conns) {
      if (!c.alive) { ws.terminate(); conns.delete(ws); continue; }
      c.alive = false; ws.ping();
    }
  }, lim.pingIntervalS * 1000);

  return {
    port: at, teacher,
    counts: () => ({ students: lobby.count(), connections: conns.size, dropped, accepted, snapshots, snapshotBytes }),
    close: () => new Promise(done => {
      deps.rooms.onStepped = null;
      clearInterval(pinger); clearInterval(lobbyTimer); clearInterval(teacherTimer);
      for (const ws of [...conns.keys(), ...tconns]) ws.close(1001, 'servidor detenido');
      wss.close(); twss.close();
      http.close(() => done());
      http.closeAllConnections();
    }),
  };
}
