// The classroom server's network side: one HTTP server on one port serves the game's page (the single-file
// build) and takes WebSocket connections on WS_PATH. Every incoming message goes through
// parseClientMessage(); a connection over its message allowance or with too many refused messages is closed.
// NOT SOURCEABLE in docs/engine-reference/web/ (no Node or WebSocket there): checked against the installed
// ws 8.22.2 (node_modules/ws/wrapper.mjs exports) and @types/ws 8.18.2 (index.d.mts: WebSocketServer options
// server, path, maxPayload; 'connection', 'message' (data, isBinary), 'pong', 'error', 'close' events;
// ping(), terminate(), close(code, reason)), and Node 22's node:http (closeAllConnections) and node:net.
import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMessage, errorMessage, PROTOCOL_VERSION, WS_PATH, type ErrorCode, type ServerMessage, type ProtocolLimits } from '../net/protocol';
import type { Rooms } from './rooms';
import { STEP } from '../game/match';
import { createLobby } from './lobby';
import { queueInput, ackOf } from './room';
import { buildSnapshot } from '../net/snapshot';

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
  log: (line: string) => void; warn: (kind: string, line: string) => void;
}
/** The running network side. */
export interface Net {
  /** The port it listens on (the asked one, or the next free one). */
  port: number;
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
    const page = deps.pages.get((req.url ?? '/').split('?')[0]);
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

  const wss = new WebSocketServer({ server: http, path: WS_PATH, maxPayload: lim.maxChars, perMessageDeflate: false });
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
  });
  const lobbyTimer = setInterval(lobby.tick, lim.lobbyTickMs);
  // Every snapEvery steps, each connected student of the room gets a snapshot with the events since the last one;
  // a `begin` goes first when their match is new to them (joined, rejoined, a rematch). After a rematch, a student
  // who was in the old match gets its last snapshot (with its matchEnd) before the new match's begin.
  const snapEvery = Math.max(1, Math.round(1 / STEP / lim.snapshotHz));
  deps.rooms.onStepped = room => {
    if (room.stats.steps % snapEvery !== 0) return;
    for (const seat of room.seats) {
      const ws = seat.kind === 'human' && seat.owner !== null ? byId.get(seat.owner) : undefined;
      const c = ws && conns.get(ws);
      if (!ws || !c || ws.readyState !== ws.OPEN) continue;
      const tag = `${room.id}:${room.matchNo}`;
      if (c.began !== tag) {
        if (room.last && c.began === `${room.id}:${room.matchNo - 1}`) send(ws, buildSnapshot(room.last.match, seat.index, ackOf(room, seat.index), room.stats.steps, room.last.events, lim.eventRangeM));
        c.began = tag;
        send(ws, { v: PROTOCOL_VERSION, t: 'begin', map: room.match.opts.map, seat: seat.index, match: room.matchNo, hz: 1 / STEP / snapEvery, names: room.match.players.map(p => p.name),
          subject: room.match.opts.subject, level: room.match.opts.level });
      }
      const text = JSON.stringify(buildSnapshot(room.match, seat.index, ackOf(room, seat.index), room.stats.steps, room.pending, lim.eventRangeM));
      ws.send(text); snapshots++; snapshotBytes += Buffer.byteLength(text);
    }
    room.pending.length = 0; room.last = null;
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
      if (msg.t === 'hello') { accepted++; lobby.hello(c.id, msg.name, msg.rejoin === true); return; }
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
    port: at,
    counts: () => ({ students: lobby.count(), connections: conns.size, dropped, accepted, snapshots, snapshotBytes }),
    close: () => new Promise(done => {
      deps.rooms.onStepped = null;
      clearInterval(pinger); clearInterval(lobbyTimer);
      for (const ws of conns.keys()) ws.close(1001, 'servidor detenido');
      wss.close();
      http.close(() => done());
      http.closeAllConnections();
    }),
  };
}
