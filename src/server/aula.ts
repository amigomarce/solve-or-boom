// npm run aula: the classroom server. Run on the teacher's PC, it serves the game on the school network and
// runs 4 v 4 rooms, each with its own match, the server the authority (design/game-brief.md, Feature 16).
// Needs no internet: it makes no outbound request; it logs only room ids, counts and timings.
//
//   npm run aula                         the server and data/aula.json's demo_rooms rooms of bots
//   npm run aula -- --salas 3            three demo rooms (0 = none)
//   npm run aula -- --gracia 5           seconds a dropped student's seat is held (default rejoin_grace_s)
//   npm run aula -- --puerto 8080        another port (or AULA_PORT=8080)
//   npm run aula -- --carga --segundos 60   the load check: load_rooms rooms of bots, no network, then a report
//
// It is built by `vite build --mode server` into dist-server/aula.js (the question banks and data files
// inlined, ws left as a package), then run by plain node.
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { MAP_IDS } from '../game/map';
import { STEP } from '../game/match';
import { aula } from './settings';
import { log, rateLimitedLog } from './log';
import { createRooms, type Rooms } from './rooms';
import { createResults } from './results';
import { startNet, type Net } from './net';
import profesorHtml from './profesor.html?raw';
import { TEACHER_PATH } from '../net/protocol';
import { fillTeacherPage } from './teacher';

const args = process.argv.slice(2);
/** The number after a flag, or undefined. Exits saying so when it is not a whole number >= 0. */
function flag(name: string): number | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 0) { console.error(`${name} necesita un número entero (por ejemplo ${name} 3).`); process.exit(2); }
  return n;
}
const clockMs = (): number => performance.now();
const warn = rateLimitedLog(aula.log_repeat_s * 1000, clockMs);
// The students' results: memory only, gone when the server stops (story 007).
const results = createResults(aula.results_max_students);
const rooms: Rooms = createRooms(
  { tickBudgetMs: aula.tick_budget_ms, maxCatchupSteps: aula.max_catchup_steps, maxBacklogSteps: aula.max_backlog_steps, emptyGraceS: aula.empty_grace_s, voteS: aula.rematch_vote_s,
    play: { queueMax: aula.input_queue_max, holdSteps: aula.input_hold_steps } },
  { clockMs, log, warn, results },
);
const ticker = setInterval(rooms.tick, aula.tick_ms);
let net: Net | null = null, stopping = false;

/** Stops the rooms and the network, says so in Spanish, and exits. A second Ctrl+C exits at once. */
async function stop(why: string): Promise<void> {
  if (stopping) process.exit(1);
  stopping = true;
  clearInterval(ticker);
  rooms.endAll(why);
  await net?.close();
  console.log('\nServidor del aula detenido. Los alumnos ya no pueden conectarse.');
  process.exit(0);
}
process.on('SIGINT', () => void stop('servidor detenido (Ctrl+C)'));
process.on('SIGTERM', () => void stop('servidor detenido'));
// A fault outside every room (a room's own is caught in rooms.ts) is logged, and the class goes on.
process.on('uncaughtException', e => warn('uncaught', `Error inesperado: ${e.name}: ${e.message}`));

if (args.includes('--carga')) {
  const seconds = flag('--segundos') ?? aula.load_seconds, count = flag('--salas') ?? aula.load_rooms;
  console.log(`Prueba de carga: ${count} salas solo con bots durante ${seconds} s...`);
  for (let i = 0; i < count; i++) rooms.create({ match: { subject: 'matematicas', level: 'medio', topics: ['arith', 'mult'], custom: [], customName: '', map: MAP_IDS[i % MAP_IDS.length] } });
  const all = rooms.list().map(r => rooms.get(r.id)!);
  setTimeout(() => {
    clearInterval(ticker);
    console.log(`\nResultado tras ${seconds} s (se esperaban unos ${Math.round(seconds / STEP)} pasos por sala):`);
    console.log('sala      mapa       estado     pasos   descartados  partidas  ronda  media ms  máx ms');
    for (const r of all) {
      console.log(`${r.id.padEnd(9)} ${r.spec.match.map.padEnd(10)} ${r.status.padEnd(10)} ${String(r.stats.steps).padStart(6)} ${String(r.stats.dropped).padStart(12)} ${String(r.matches).padStart(9)} ${String(r.match.round).padStart(6)} ${(r.stats.totalMs / Math.max(1, r.stats.steps)).toFixed(3).padStart(9)} ${r.stats.maxMs.toFixed(2).padStart(7)}`);
    }
    const failed = all.filter(r => r.status === 'failed');
    console.log(failed.length ? `ERRORES: ${failed.map(r => `${r.id}: ${r.reason}`).join('; ')}` : 'Sin errores.');
    process.exit(failed.length ? 1 : 0);
  }, seconds * 1000);
} else {
  let page: Buffer;
  try { page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-class', 'index.html')); } catch {
    console.error('Falta dist-class/index.html: ejecuta "npm run build:class" (npm run aula lo hace solo).');
    process.exit(1);
  }
  const port = flag('--puerto') ?? (process.env.AULA_PORT ? Number(process.env.AULA_PORT) : aula.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error(`Puerto no válido: ${port}`); process.exit(2); }
  // The marker that tells the page it was served by the classroom server, so it opens on the join screen (src/main.ts CLASS_MODE).
  const html = { type: 'text/html; charset=utf-8', body: Buffer.from(page.toString('utf8').replace('<head>', '<head><meta name="aula" content="1">')) };
  try {
    net = await startNet(port, aula.port_tries, {
      maxChars: aula.max_message_bytes, maxName: aula.max_name_length, maxLook: aula.max_look_per_message,
      maxConnections: aula.max_connections, rejoinGraceS: flag('--gracia') ?? aula.rejoin_grace_s, lobbyTickMs: aula.lobby_tick_ms, perSecond: aula.max_messages_per_second, burst: aula.message_burst,
      maxStrikes: aula.max_strikes, pingIntervalS: aula.ping_interval_s, snapshotHz: aula.snapshot_hz, eventRangeM: aula.event_range_m,
    }, { rooms, results, pages: new Map([['/', html], ['/index.html', html], [TEACHER_PATH, { type: 'text/html; charset=utf-8', body: Buffer.from(fillTeacherPage(profesorHtml)) }]]), clockMs, log, warn,
      teacher: { csvMaxBytes: aula.csv_max_bytes, csvMaxQuestions: aula.csv_max_questions, csvMaxFiles: aula.csv_max_files, maxRooms: aula.max_rooms, roomNameMax: aula.teacher_room_name_max, finishedShown: aula.finished_rooms_shown, weakBelowPct: aula.weak_below_pct, weakMinAnswers: aula.weak_min_answers,
        updateMs: aula.teacher_update_ms, heartbeatS: aula.teacher_heartbeat_s, maxChars: aula.teacher_max_message_bytes } });
  } catch (e) {
    console.error(`No se pudo abrir el servidor: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const demo = flag('--salas') ?? aula.demo_rooms;
  for (let i = 0; i < demo; i++) rooms.create({ match: { subject: 'matematicas', level: 'medio', topics: ['arith', 'mult'], custom: [], customName: '', map: MAP_IDS[i % MAP_IDS.length] } });
  for (let i = 0; i < aula.waiting_rooms; i++) net.teacher?.addRoom(); // empty rooms the students sit in until the teacher splits and starts
  const lan = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `http://${a!.address}:${net!.port}`);
  net.teacher?.setAddress(lan[0] ?? ''); // the first address printed below: the one the teacher page shows the students
  console.log('\n=== Servidor del aula en marcha ===');
  if (lan.length) { console.log('Los alumnos abren en su navegador (misma red del colegio):'); for (const u of lan) console.log('   ' + u); }
  else console.log(`Este PC no tiene dirección de red local: solo funciona en este PC, en http://localhost:${net.port}`);
  console.log(`En este PC: http://localhost:${net.port}`);
  console.log(`Pantalla del profesor (solo en este PC): http://localhost:${net.port}${TEACHER_PATH}`);
  console.log(`Salas de espera: ${aula.waiting_rooms}; salas de prueba (solo bots, en marcha): ${demo}. No hace falta internet.`);
  console.log('Para detenerlo: pulsa Ctrl+C en esta ventana.\n');
  if (aula.status_every_s > 0) setInterval(() => {
    const c = net!.counts(), list = rooms.list();
    log(`${list.length} salas en marcha (${list.map(r => `${r.id} ronda ${r.round} ${r.score.join('-')}`).join(', ')}); ${c.students} alumnos, ${c.connections} conexiones; ${c.accepted} mensajes aceptados, ${c.dropped} descartados`);
  }, aula.status_every_s * 1000);
}
