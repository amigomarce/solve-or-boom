// The teacher screen's brain (story 006): the session choices, the rooms the teacher manages, and what the teacher
// sees. It has no network code: net.ts hands it each parsed TeacherMessage and sends what it returns.
//
// Rules chosen here (the story did not say):
//  - The session (subject, level, topics, map, CSV, match options) applies to every room built or STARTED after it is set.
//    A waiting room is rebuilt from the session at the moment it starts; a running or paused room keeps its match
//    until the teacher ends it (a new room then takes the new session).
//  - The match options (story 017: friendly fire, buy time) are part of the session like the map: every room's next match.
//    The buy time must be whole seconds inside data/config.json's buy_time min..max (not snapped to its step).
//  - Teacher rooms never rematch: a won match ends the room and its students reach the results screen.
//  - "Repartir automáticamente" refuses while any room runs or is paused, replaces the waiting rooms, and makes
//    ceil(students / 8) rooms with the students spread evenly (so nobody is left out: 10 students make two rooms of 5,
//    3 v 2 plus bots), teams alternating. The free seats stay bots.
import { MAP_IDS, MAP_LIST } from '../game/map';
import { LEVELS, type Level } from '../game/types';
import { parseCSV, decodeCSV, type ParsedQuestion } from '../game/csv';
import * as QUESTIONS from '../questions';
import { CONFIG, tune } from '../game/tune';
import { PROTOCOL_VERSION, SEATS, SEATS_PER_TEAM, type TeacherInfoMessage, type TeacherMessage, type TeacherReply, type TeacherRoom, type TeacherStateMessage } from '../net/protocol';
import { rebuildMatch, type Room } from './room';
import type { Rooms } from './rooms';
import type { Lobby } from './lobby';
import type { Results } from './results';

/** The teacher's limits (data/aula.json). */
export interface TeacherLimits { csvMaxBytes: number; csvMaxQuestions: number; maxRooms: number; finishedShown: number; weakBelowPct: number; weakMinAnswers: number }
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
}

/**
 * The teacher over the given rooms and lobby.
 * @example const teacher = createTeacher({ csvMaxBytes: 262144, csvMaxQuestions: 500, maxRooms: 16, finishedShown: 8 }, { rooms, lobby, log });
 */
export function createTeacher(lim: TeacherLimits, deps: TeacherDeps): Teacher {
  const session = { subject: 'matematicas', level: 'medio' as Level, topics: ['arith', 'mult'], map: MAP_IDS[0], custom: [] as ParsedQuestion[], customName: '', skipped: 0,
    friendlyFire: false, buyTime: Number(tune.buy_time) };
  const buyRange = CONFIG.buy_time as { min: number; max: number; step: number };
  const v = PROTOCOL_VERSION;
  const err = (code: string, text: string): TeacherReply => ({ v, t: 'terror', code, text });
  const matchChoices = () => ({
    subject: session.subject, level: session.level, topics: session.subject === QUESTIONS.CUSTOM ? [] : [...session.topics],
    custom: session.custom, customName: session.customName, map: session.map, friendlyFire: session.friendlyFire, buyTime: session.buyTime,
  });
  const seed = (): number => (Math.random() * 2 ** 31) >>> 0;
  const make = (): Room | null => (deps.rooms.all().length >= lim.maxRooms ? null
    : deps.rooms.create({ managed: true, waiting: true, rematch: false, match: matchChoices(), seed: seed() }));
  /** Starts a waiting room with the session as it is now. */
  const start = (room: Room): boolean => rebuildMatch(room, matchChoices(), seed()) && deps.rooms.transition(room.id, 'start');
  const refresh = (room: Room | undefined): void => { if (room) deps.lobby.refresh(room); };

  const split = (): TeacherReply | null => {
    if (deps.rooms.all().some(r => r.status === 'running' || r.status === 'paused')) return err('salas_en_marcha', 'Hay salas en marcha o en pausa: termínalas antes de repartir.');
    const students = deps.lobby.list().filter(s => s.connected);
    if (!students.length) return err('sin_alumnos', 'No hay alumnos conectados.');
    const count = Math.ceil(students.length / SEATS), old = deps.rooms.all().filter(r => r.managed && r.status === 'waiting');
    if (deps.rooms.all().length - old.length + count > lim.maxRooms) return err('demasiadas_salas', `Harían falta ${count} salas y el máximo es ${lim.maxRooms}.`);
    const fresh = Array.from({ length: count }, () => make()!);
    let next = 0;
    fresh.forEach((room, k) => {
      const size = Math.floor(students.length / count) + (k < students.length % count ? 1 : 0);
      for (let j = 0; j < size; j++) {
        const team = j % 2, seat = team * SEATS_PER_TEAM + Math.floor(j / 2);
        deps.lobby.move(students[next++].id, room.id, team, seat);
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
    }),
    state() {
      const students = deps.lobby.list();
      const seatsOf = (r: Room): TeacherRoom['seats'] => r.seats.map(s => ({
        index: s.index, team: s.team, kind: s.kind === 'human' ? 'human' : 'bot',
        name: s.kind === 'human' ? s.name ?? '' : `Bot ${s.index + 1}`,
        student: s.kind === 'human' ? students.find(x => x.room === r.id && x.seat === s.index)?.id ?? null : null,
      }));
      const row = (r: Room, live: boolean): TeacherRoom => ({
        id: r.id, status: r.status, managed: r.managed, map: r.spec.match.map, round: r.match.round, score: [...r.match.score], matches: r.matches, reason: r.reason,
        seats: live ? seatsOf(r) : [],
      });
      return {
        v, t: 'tstate', students: students.map(s => ({ ...s })),
        session: { subject: session.subject, level: session.level, topics: [...session.topics], map: session.map, friendlyFire: session.friendlyFire, buyTime: session.buyTime,
          csv: session.customName ? { name: session.customName, count: session.custom.length, skipped: session.skipped } : null,
          available: QUESTIONS.availableCount(session.subject, session.topics, session.level, session.custom) },
        results: deps.results.view(),
        rooms: [...deps.rooms.all().map(r => row(r, true)), ...deps.rooms.finished.slice(-lim.finishedShown).map(r => row(r, false))],
      };
    },
    addRoom: make,
    handle(msg) {
      switch (msg.t) {
        case 'ping': return { v, t: 'pong' };
        case 'tsession': {
          const topics = [...new Set(msg.topics)];
          if (!MAP_IDS.includes(msg.map)) return err('mapa', 'Ese mapa no existe.');
          if (msg.buyTime < buyRange.min || msg.buyTime > buyRange.max) return err('compra', `El tiempo de compra va de ${buyRange.min} a ${buyRange.max} segundos.`);
          const options = { friendlyFire: msg.friendlyFire, buyTime: msg.buyTime };
          if (msg.subject === QUESTIONS.CUSTOM) {
            if (!session.custom.length) return err('sin_csv', 'Primero sube un archivo CSV de preguntas.');
            Object.assign(session, { subject: msg.subject, level: msg.level, topics: [], map: msg.map, ...options });
            return null;
          }
          if (!Object.hasOwn(QUESTIONS.SUBJECTS, msg.subject)) return err('materia', 'Esa materia no existe.');
          const known = QUESTIONS.SUBJECTS[msg.subject].topics;
          if (!topics.length || !topics.every(t => Object.hasOwn(known, t))) return err('temas', 'Elige al menos un tema de la materia.');
          const n = QUESTIONS.availableCount(msg.subject, topics, msg.level, session.custom);
          if (n !== null && n < 1) return err('sin_preguntas', 'Esa elección no tiene preguntas.');
          Object.assign(session, { subject: msg.subject, level: msg.level, topics, map: msg.map, ...options });
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
        case 'texport': { const text = deps.results.csv(); return { v, t: 'texported', name: 'resultados.csv', text, rows: text.split('\r\n').length - 2 }; }
        case 'tclear': deps.results.clear(); deps.log('Resultados borrados por el profesor'); return null;
        case 'taddroom': return make() ? null : err('demasiadas_salas', `Ya hay ${lim.maxRooms} salas, el máximo.`);
        case 'tsplit': return split();
        case 'tmove': {
          const problem = deps.lobby.move(msg.student, msg.room, msg.team, msg.seat);
          return problem ? err('mover', problem) : null;
        }
        case 'troom': {
          const room = deps.rooms.get(msg.room);
          if (!room) return err('sala', 'Esa sala no existe o ya terminó.');
          const ok = msg.action === 'end' ? deps.rooms.end(room.id, 'terminada por el profesor')
            : msg.action === 'start' ? start(room) : deps.rooms.transition(room.id, msg.action);
          if (!ok) return err('estado', `No se puede hacer eso: la sala está ${({ waiting: 'esperando', running: 'en marcha', paused: 'en pausa', ended: 'terminada', failed: 'con error' })[room.status]}.`);
          refresh(room);
          return null;
        }
        case 'tall': {
          for (const room of deps.rooms.all()) {
            if (msg.action === 'end') deps.rooms.end(room.id, 'terminada por el profesor');
            else if (room.status === 'waiting' && start(room)) refresh(room);
          }
          return null;
        }
      }
    },
  };
}
