// The teacher screen's brain (story 006): the session choices, the rooms the teacher manages, and what the teacher
// sees. It has no network code: net.ts hands it each parsed TeacherMessage and sends what it returns.
//
// Rules chosen here (the story did not say):
//  - The session (subject, level, topics, map, CSV, match options) applies to every room built or STARTED after it is set.
//    A waiting room is rebuilt from the session at the moment it starts; a running or paused room keeps its match
//    until the teacher ends it (a new room then takes the new session).
//  - The match options (story 017: friendly fire, buy time) are part of the session like the map: every room's next match.
//    The buy time must be whole seconds inside data/config.json's buy_time min..max (not snapped to its step).
//  - Teacher rooms stay: a won match, or one the teacher ends ("Terminar"), sends each student their results and the room waits again
//    with the same students in the same seats; "Iniciar" plays the next match with the session as it is then. A copy of the room as
//    it ended goes to the finished list, and the card shows that match on its "Última partida" line. "Quitar sala" removes a
//    waiting room for good: its students go back to the entry screen (when they come back they take a free seat, as on any join).
//  - "Repartir automáticamente" refuses while any room runs or is paused, replaces the waiting rooms, and makes
//    ceil(students / 8) rooms with the students spread evenly (so nobody is left out: 10 students make two rooms of 5,
//    3 v 2 plus bots), teams alternating. The free seats stay bots. In Free for All (story 023) there are no teams: the
//    students take the seats in order (0, 1, 2...), the room size unchanged.
//  - Changing the game mode rebuilds the waiting rooms at once (their students stay seated; nothing was played) and pushes
//    each room's seating, so the students' waiting rooms follow on their next message; running and paused rooms are not touched.
//  - Duelo por equipos (story 024) keeps Bomba's teams and seat spread (alternating); its rooms show a `summary` with the teams' kills and the time left.
//  - Oleadas cooperativas (story 025): a room holds up to 4 students (seats 0..3, the enemy bots take the other four); "Repartir" makes ceil(students / 4) rooms; the teacher page shows the wave and who stands.
//  - Free for All rooms show a `summary` instead of the team score: who leads and the time left (a finished room: who won or led).
import { MAP_IDS, MAP_LIST } from '../game/map';
import { LEVELS, type Level } from '../game/types';
import { parseCSV, decodeCSV, type ParsedQuestion } from '../game/csv';
import * as QUESTIONS from '../questions';
import { CONFIG, tune } from '../game/tune';
import { GAME_MODES, MODE_INFO, PROTOCOL_VERSION, SEATS, SEATS_PER_TEAM, type GameModeId, type TeacherInfoMessage, type TeacherMessage, type TeacherReply, type TeacherRoom, type TeacherStateMessage } from '../net/protocol';
import { rebuildMatch, type Room } from './room';
import { ranking } from '../game/ffa';
import type { Rooms } from './rooms';
import type { Lobby } from './lobby';
import { roomLabel, type Results } from './results';

/** The teacher's limits (data/aula.json). */
export interface TeacherLimits { csvMaxBytes: number; csvMaxQuestions: number; maxRooms: number; roomNameMax: number; finishedShown: number; weakBelowPct: number; weakMinAnswers: number }
/** What the teacher needs: the rooms, the lobby (students) and a log. */
export interface TeacherDeps { rooms: Rooms; lobby: Lobby; results: Results; log: (line: string) => void }
/** The teacher screen's brain. */
export interface Teacher {
  /** The catalogue and limits the page builds its form from. */
  info(): TeacherInfoMessage;
  /** Everything on screen now. */
  state(): TeacherStateMessage;
  /** Does what the teacher asked; returns a reply for the sender (a refusal or the CSV result), or null. net.ts sends the new state to every teacher after. */
  handle(msg: TeacherMessage): TeacherReply | null;
  /** Adds one empty waiting room built from the session; null at the room limit. */
  addRoom(): Room | null;
  /** Sets the address the students type (tinfo's `address`); aula.ts calls it once the port is known. */
  setAddress(url: string): void;
}

/**
 * The teacher over the given rooms and lobby.
 * @example const teacher = createTeacher({ csvMaxBytes: 262144, csvMaxQuestions: 500, maxRooms: 16, finishedShown: 8 }, { rooms, lobby, log });
 */
export function createTeacher(lim: TeacherLimits, deps: TeacherDeps): Teacher {
  const session = { subject: 'matematicas', level: 'medio' as Level, topics: ['arith', 'mult'], map: MAP_IDS[0], custom: [] as ParsedQuestion[], customName: '', skipped: 0,
    friendlyFire: false, buyTime: Number(tune.buy_time), streakRewards: true, mode: 'bomb' as GameModeId };
  const buyRange = CONFIG.buy_time as { min: number; max: number; step: number };
  const v = PROTOCOL_VERSION;
  let address = '';
  /** A room's name for the CSV: the teacher's, else "Sala N" (a removed room has none). */
  const labelOf = (id: string): string => deps.rooms.get(id)?.name || roomLabel(id);
  const err = (code: string, text: string): TeacherReply => ({ v, t: 'terror', code, text });
  const matchChoices = () => ({
    subject: session.subject, level: session.level, topics: session.subject === QUESTIONS.CUSTOM ? [] : [...session.topics],
    custom: session.custom, customName: session.customName, map: session.map, friendlyFire: session.friendlyFire, buyTime: session.buyTime,
    streakRewards: session.streakRewards, mode: session.mode,
  });
  const seed = (): number => (Math.random() * 2 ** 31) >>> 0;
  const make = (): Room | null => (deps.rooms.all().length >= lim.maxRooms ? null
    : deps.rooms.create({ managed: true, waiting: true, rematch: false, match: matchChoices(), seed: seed() }));
  /** Starts a waiting room with the session as it is now. */
  const start = (room: Room): boolean => rebuildMatch(room, matchChoices(), seed()) && deps.rooms.transition(room.id, 'start');
  const refresh = (room: Room | undefined): void => { if (room) deps.lobby.refresh(room); };
  deps.rooms.onReopened = room => refresh(room); // a teacher room waits again: its students' waiting rooms follow at once

  /** The mode changed (story 023): each waiting room is rebuilt with the session (its students keep their seats) and its students get the new seating; other rooms keep their match. */
  const followMode = (): void => {
    for (const room of deps.rooms.all()) if (room.managed && room.status === 'waiting' && rebuildMatch(room, matchChoices(), seed())) refresh(room);
  };

  const split = (): TeacherReply | null => {
    if (deps.rooms.all().some(r => r.status === 'running' || r.status === 'paused')) return err('salas_en_marcha', 'Hay salas en marcha o en pausa: termínalas antes de repartir.');
    const students = deps.lobby.list().filter(s => s.connected);
    if (!students.length) return err('sin_alumnos', 'No hay alumnos conectados.');
    const coop = MODE_INFO[session.mode].coop, cap = coop ? SEATS_PER_TEAM : SEATS; // story 025: only seats 0..3 take students
    const count = Math.ceil(students.length / cap), old = deps.rooms.all().filter(r => r.managed && r.status === 'waiting');
    if (deps.rooms.all().length - old.length + count > lim.maxRooms) return err('demasiadas_salas', `Harían falta ${count} salas y el máximo es ${lim.maxRooms}.`);
    const fresh = Array.from({ length: count }, () => make()!);
    fresh.forEach((room, k) => { if (old[k]) room.name = old[k].name; }); // story 027: the teacher's room names stay with their place in the order
    let next = 0;
    fresh.forEach((room, k) => {
      const size = Math.floor(students.length / count) + (k < students.length % count ? 1 : 0);
      for (let j = 0; j < size; j++) {
        const ffa = !MODE_INFO[session.mode].teams, team = ffa ? 0 : j % 2, seat = ffa ? j : team * SEATS_PER_TEAM + Math.floor(j / 2);
        deps.lobby.move(students[next++].id, room.id, ffa ? Math.floor(seat / SEATS_PER_TEAM) : team, seat);
      }
    });
    for (const r of old) deps.rooms.remove(r.id);
    deps.log(`Reparto: ${students.length} alumnos en ${count} salas`);
    return null;
  };

  return {
    info: () => ({
      v, t: 'tinfo', levels: LEVELS.map(id => ({ id, name: QUESTIONS.LEVEL_NAMES[id] })), maps: MAP_LIST.map(m => ({ ...m })), weakBelowPct: lim.weakBelowPct, weakMinAnswers: lim.weakMinAnswers,
      subjects: [...Object.entries(QUESTIONS.SUBJECTS).map(([id, s]) => ({ id, name: s.name, topics: Object.entries(s.topics).map(([tid, name]) => ({ id: tid, name })) })),
        { id: QUESTIONS.CUSTOM, name: QUESTIONS.CUSTOM_NAME, topics: [] }],
      csvMaxBytes: lim.csvMaxBytes, csvMaxQuestions: lim.csvMaxQuestions, buyTime: { min: buyRange.min, max: buyRange.max, step: buyRange.step },
      address,
      modes: GAME_MODES.map(id => ({ id, ...MODE_INFO[id] })),
    }),
    state() {
      const students = deps.lobby.list();
      /** The seats the page shows; in Oleadas cooperativas (story 025) the enemy seats are left out. */
      const seatsOf = (r: Room): TeacherRoom['seats'] => r.seats.filter(s => !MODE_INFO[r.match.opts.mode].coop || s.team === 0).map(s => ({
        index: s.index, team: s.team, kind: s.kind === 'human' ? 'human' : 'bot',
        name: s.kind === 'human' ? s.name ?? '' : `Bot ${s.index + 1}`,
        student: s.kind === 'human' ? students.find(x => x.room === r.id && x.seat === s.index)?.id ?? null : null,
      }));
      const mmss = (t: number): string => { const n = Math.max(0, Math.ceil(t)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
      /** Each mode's line for a room on the teacher page ('' in Bomba, whose rows show the score). Names come from the seats (a bot is "Bot n"). */
      const SUMMARY: Record<GameModeId, (r: Room) => string> = {
        bomb: () => '',
        duel: r => { // story 024: the teams' kills (match.score), the time left and, when over, the winner
          if (r.status === 'waiting') return 'Todavía no ha empezado';
          const [a, b] = r.match.score, tally = `Equipo 1 ${a} – ${b} Equipo 2`, left = r.status === 'running' || r.status === 'paused';
          if (r.match.over) return a === b ? `Empate · ${tally}` : `Ganó el Equipo ${a > b ? 1 : 2} · ${tally}`;
          return left ? `${tally} · Quedan ${mmss(r.match.roundT)}` : tally;
        },
        waves: r => { // story 025: the wave, who stands and the enemies left; when over, the waves survived
          if (r.status === 'waiting') return 'Todavía no ha empezado';
          const [left, up] = r.match.score, humans = r.seats.filter(s => s.kind === 'human').length;
          if (r.match.over) return `Cayeron en la oleada ${r.match.round} · sobrevivieron ${r.match.survived ?? 0}`;
          const wave = r.match.round > 0 ? `Oleada ${r.match.round}` : 'Antes de la oleada 1', pause = r.match.phaseT > 0 ? ' (pausa)' : ` · ${left} enemigos`;
          return `${wave}${pause} · En pie ${up} de ${SEATS_PER_TEAM}${humans ? '' : ' (solo bots)'}`;
        },
        ffa: r => { // story 023: who leads and the time left
          if (r.status === 'waiting') return 'Todavía no ha empezado';
          const lead = ranking(r.match)[0], seat = r.seats[lead.id], name = seat.kind === 'human' ? seat.name ?? '' : `Bot ${seat.index + 1}`;
          const kills = `${lead.kills} ${lead.kills === 1 ? 'baja' : 'bajas'}`;
          if (r.match.over) return `Ganó ${name} con ${kills}`;
          const left = r.status === 'running' || r.status === 'paused';
          if (!lead.kills) return left ? `Sin bajas todavía · Quedan ${mmss(r.match.roundT)}` : 'Sin bajas';
          return left ? `Va primero ${name} con ${kills} · Quedan ${mmss(r.match.roundT)}` : `Iba primero ${name} con ${kills}`;
        },
      };
      const summaryOf = (r: Room): string => SUMMARY[r.match.opts.mode](r);
      /** A finished match in one line: the mode's summary (Bomba: the final score), and why it ended. */
      const lastOf = (r: Room | null): string => !r ? ''
        : `${MODE_INFO[r.match.opts.mode].bomb ? `Marcador final ${r.match.score[0]} – ${r.match.score[1]}` : summaryOf(r)}${r.reason ? ' · ' + r.reason : ''}`;
      const row = (r: Room, live: boolean): TeacherRoom => ({
        mode: r.match.opts.mode, summary: summaryOf(r), last: live ? lastOf(r.prev) : '',
        id: r.id, name: deps.rooms.get(r.id)?.name ?? '', status: r.status, managed: r.managed, map: r.spec.match.map, round: r.match.round, score: [...r.match.score], matches: r.matches, reason: r.reason,
        seats: live ? seatsOf(r) : [],
      });
      return {
        v, t: 'tstate', students: students.map(s => ({ ...s })),
        session: { subject: session.subject, level: session.level, topics: [...session.topics], map: session.map, friendlyFire: session.friendlyFire, buyTime: session.buyTime, streakRewards: session.streakRewards, mode: session.mode,
          csv: session.customName ? { name: session.customName, count: session.custom.length, skipped: session.skipped } : null,
          available: QUESTIONS.availableCount(session.subject, session.topics, session.level, session.custom) },
        results: deps.results.view(),
        rooms: [...deps.rooms.all().map(r => row(r, true)), ...deps.rooms.finished.slice(-lim.finishedShown).map(r => row(r, false))],
      };
    },
    addRoom: make,
    setAddress(url) { address = url; },
    handle(msg) {
      switch (msg.t) {
        case 'ping': return { v, t: 'pong' };
        case 'tsession': {
          const topics = [...new Set(msg.topics)];
          if (!MAP_IDS.includes(msg.map)) return err('mapa', 'Ese mapa no existe.');
          if (msg.buyTime < buyRange.min || msg.buyTime > buyRange.max) return err('compra', `El tiempo de compra va de ${buyRange.min} a ${buyRange.max} segundos.`);
          const modeChanged = msg.mode !== session.mode;
          const options = { friendlyFire: msg.friendlyFire, buyTime: msg.buyTime, streakRewards: msg.streakRewards, mode: msg.mode };
          if (msg.subject === QUESTIONS.CUSTOM) {
            if (!session.custom.length) return err('sin_csv', 'Primero sube un archivo CSV de preguntas.');
            Object.assign(session, { subject: msg.subject, level: msg.level, topics: [], map: msg.map, ...options });
            if (modeChanged) followMode();
            return null;
          }
          if (!Object.hasOwn(QUESTIONS.SUBJECTS, msg.subject)) return err('materia', 'Esa materia no existe.');
          const known = QUESTIONS.SUBJECTS[msg.subject].topics;
          if (!topics.length || !topics.every(t => Object.hasOwn(known, t))) return err('temas', 'Elige al menos un tema de la materia.');
          const n = QUESTIONS.availableCount(msg.subject, topics, msg.level, session.custom);
          if (n !== null && n < 1) return err('sin_preguntas', 'Esa elección no tiene preguntas.');
          Object.assign(session, { subject: msg.subject, level: msg.level, topics, map: msg.map, ...options });
          if (modeChanged) followMode();
          return null;
        }
        case 'tcsv': {
          if (msg.data.length > Math.ceil(lim.csvMaxBytes / 3) * 4) return { v, t: 'tcsvok', ok: false, name: msg.name, count: 0, skipped: 0, text: `El archivo es demasiado grande (máximo ${Math.floor(lim.csvMaxBytes / 1024)} KB).` };
          const bytes = Buffer.from(msg.data, 'base64');
          if (bytes.length > lim.csvMaxBytes) return { v, t: 'tcsvok', ok: false, name: msg.name, count: 0, skipped: 0, text: `El archivo es demasiado grande (máximo ${Math.floor(lim.csvMaxBytes / 1024)} KB).` };
          // Rejected before parsing when the lines are far more than the questions allowed (a header and blank lines fit; 2x leaves room for quoted line breaks).
          let lines = 1;
          for (const b of bytes) if (b === 10) lines++;
          if (lines > lim.csvMaxQuestions * 2 + 1) return { v, t: 'tcsvok', ok: false, name: msg.name, count: 0, skipped: 0, text: `Demasiadas filas (${lines}); el máximo es ${lim.csvMaxQuestions} preguntas.` };
          const res = parseCSV(decodeCSV(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer));
          if (res.questions.length < 1) return { v, t: 'tcsvok', ok: false, name: msg.name, count: 0, skipped: res.skipped, text: `No hay preguntas válidas en ${msg.name}` };
          if (res.questions.length > lim.csvMaxQuestions) return { v, t: 'tcsvok', ok: false, name: msg.name, count: res.questions.length, skipped: res.skipped, text: `Demasiadas preguntas (${res.questions.length}); el máximo es ${lim.csvMaxQuestions}.` };
          Object.assign(session, { custom: res.questions, customName: msg.name, skipped: res.skipped, subject: QUESTIONS.CUSTOM, topics: [] });
          return { v, t: 'tcsvok', ok: true, name: msg.name, count: res.questions.length, skipped: res.skipped,
            text: `${res.questions.length === 1 ? 'Cargada 1 pregunta' : `Cargadas ${res.questions.length} preguntas`} de ${msg.name}` };
        }
        case 'texport': { const text = deps.results.csv(labelOf); return { v, t: 'texported', name: 'resultados.csv', text, rows: text.split('\r\n').length - 2 }; }
        case 'tclear': deps.results.clear(); deps.log('Resultados borrados por el profesor'); return null;
        case 'taddroom': return make() ? null : err('demasiadas_salas', `Ya hay ${lim.maxRooms} salas, el máximo.`);
        case 'trename': {
          const room = deps.rooms.get(msg.room), name = msg.name.replace(/[\u0000-\u001f<>]/g, '').trim();
          if (!room) return err('sala', 'Esa sala no existe o ya terminó.');
          if (name.length > lim.roomNameMax) return err('nombre_largo', `El nombre de la sala puede tener hasta ${lim.roomNameMax} letras.`);
          room.name = name;
          return null;
        }
        case 'tsplit': return split();
        case 'tmove': {
          const problem = deps.lobby.move(msg.student, msg.room, msg.team, msg.seat);
          return problem ? err('mover', problem) : null;
        }
        case 'troom': {
          const room = deps.rooms.get(msg.room);
          if (!room) return err('sala', 'Esa sala no existe o ya terminó.');
          const playing = room.status === 'running' || room.status === 'paused';
          const ok = msg.action === 'end' ? playing && deps.rooms.end(room.id, 'terminada por el profesor')
            : msg.action === 'remove' ? room.status === 'waiting' && deps.rooms.close(room.id, 'quitada por el profesor')
            : msg.action === 'start' ? start(room) : deps.rooms.transition(room.id, msg.action);
          if (!ok) return err('estado', `No se puede hacer eso: la sala está ${({ waiting: 'esperando', running: 'en marcha', paused: 'en pausa', ended: 'terminada', failed: 'con error' })[room.status]}.`);
          refresh(room);
          return null;
        }
        case 'tall': {
          for (const room of deps.rooms.all()) {
            if (msg.action === 'end') { if (room.status === 'running' || room.status === 'paused') deps.rooms.end(room.id, 'terminada por el profesor'); }
            else if (room.status === 'waiting' && start(room)) refresh(room);
          }
          return null;
        }
      }
    },
  };
}

/** The marker in profesor.html that the served page's protocol version replaces. */
const VERSION_MARK = '__PROTOCOL_VERSION__';
/**
 * The teacher page as served: its protocol version filled in from PROTOCOL_VERSION, so it can never fall behind the
 * server's (TD-019). Throws when the page has no marker, so a page that would answer "bad_version" never starts.
 * @example const body = fillTeacherPage(profesorHtml);
 */
export function fillTeacherPage(html: string): string {
  if (!html.includes(VERSION_MARK)) throw new Error(`profesor.html has no ${VERSION_MARK} to fill in`);
  return html.split(VERSION_MARK).join(String(PROTOCOL_VERSION));
}
