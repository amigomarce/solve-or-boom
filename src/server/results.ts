// What each student got right and wrong (story 007), kept ONLY in the server's memory: no file, no database.
// A row is keyed by the name the student typed (case-insensitive, like the lobby's uniqueness rule, so "Ana" and
// "Ana (2)" are two students) and holds nothing else. It survives a leave and a rejoin under the same name and a bot
// taking the seat; it vanishes when the server stops or the teacher presses "Borrar resultados".
// The same counting also fills a small per-match tally on each room (room.tally) for the student's own end screen.
import * as QUESTIONS from '../questions';
import { LEVELS } from '../game/types';

/** Answers to one topic at one level in one room. `level` is a level id, or '' for a custom CSV. */
export interface Cell { room: string; topic: string; level: string; right: number; wrong: number }
/** One student's counts: answers by (room, topic, level), kills and deaths. */
export interface Tally { right: number; wrong: number; kills: number; deaths: number; cells: Map<string, Cell> }
/** A new empty tally. */
export const newTally = (): Tally => ({ right: 0, wrong: 0, kills: 0, deaths: 0, cells: new Map() });
/** The key of a typed name (the lobby's rule: case-insensitive). */
export const nameKey = (name: string): string => name.toLocaleLowerCase('es');

/** Adds one judged answer to a tally. */
export function addAnswer(t: Tally, room: string, topic: string, level: string, right: boolean): void {
  const k = `${room}\t${topic}\t${level}`;
  let c = t.cells.get(k);
  if (!c) { c = { room, topic, level, right: 0, wrong: 0 }; t.cells.set(k, c); }
  if (right) { c.right++; t.right++; } else { c.wrong++; t.wrong++; }
}

/** One line of the teacher's student table. */
export interface ResultRow { name: string; room: string; right: number; wrong: number; kills: number; deaths: number }
/** One line of the teacher's topic view: answers across levels and rooms, and how many students answered it. */
export interface TopicRow { topic: string; right: number; wrong: number; students: number }

/** The teacher-side store. */
export interface Results {
  /** The tally of a student (created on first use) and the room they are in now; null when the student limit is reached for a new name. */
  tally(name: string, room: string): Tally | null;
  /** Forgets everything ("Borrar resultados"). */
  clear(): void;
  /** Students with results now. */
  size(): number;
  /** The student table (by name) and the topic view (weakest first), for the teacher page. */
  view(): { students: ResultRow[]; topics: TopicRow[] };
  /** The CSV text with a leading byte-order mark; `label` names a room id in the Sala column (default "Sala N"; story 027); one row per student, room, topic and level. */
  csv(label?: (room: string) => string): string;
}

/** A room id as people read it: "sala-2" is "Sala 2". */
export const roomLabel = (id: string): string => 'Sala ' + id.replace(/^sala-/, '');
const levelLabel = (id: string): string => (LEVELS as readonly string[]).includes(id) ? QUESTIONS.LEVEL_NAMES[id as keyof typeof QUESTIONS.LEVEL_NAMES] : id;
const by = (a: string, b: string): number => a.localeCompare(b, 'es', { numeric: true });

/**
 * One CSV cell. Text is always quoted with " doubled. Against formula injection, a text that starts with = + - @ or
 * a tab / carriage return gets a leading apostrophe, which Excel and Sheets show as text instead of running it (OWASP).
 * @example csvCell('=CMD()') // "'=CMD()" (with the quotes)
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
/** The CSV field separator: a semicolon, which Excel reads as columns in Spanish regional settings (a comma does not there). */
export const CSV_SEP = ';';
/** The CSV header row (Spanish). */
export const CSV_HEADER = ['Alumno', 'Sala', 'Tema', 'Nivel', 'Correctas', 'Incorrectas'];

/**
 * The results store, holding at most `maxStudents` names (more are not counted).
 * @example const r = createResults(1000); const t = r.tally('Ana', 'sala-1'); if (t) addAnswer(t, 'sala-1', 'Sumas', 'facil', true);
 */
export function createResults(maxStudents: number): Results {
  const rows = new Map<string, { name: string; room: string; t: Tally }>();
  return {
    tally(name, room) {
      const k = nameKey(name);
      let e = rows.get(k);
      if (!e) { if (rows.size >= maxStudents) return null; e = { name, room, t: newTally() }; rows.set(k, e); }
      e.room = room;
      return e.t;
    },
    clear: () => rows.clear(),
    size: () => rows.size,
    view() {
      const topics = new Map<string, TopicRow & { who: Set<string> }>();
      for (const [k, e] of rows) for (const c of e.t.cells.values()) {
        let r = topics.get(c.topic);
        if (!r) { r = { topic: c.topic, right: 0, wrong: 0, students: 0, who: new Set() }; topics.set(c.topic, r); }
        r.right += c.right; r.wrong += c.wrong; r.who.add(k);
      }
      const pct = (r: TopicRow): number => r.right / Math.max(1, r.right + r.wrong);
      return {
        students: [...rows.values()].map(e => ({ name: e.name, room: e.room, right: e.t.right, wrong: e.t.wrong, kills: e.t.kills, deaths: e.t.deaths })).sort((a, b) => by(a.name, b.name)),
        topics: [...topics.values()].map(r => ({ topic: r.topic, right: r.right, wrong: r.wrong, students: r.who.size })).sort((a, b) => pct(a) - pct(b) || by(a.topic, b.topic)),
      };
    },
    csv(label = roomLabel) {
      const lines = [CSV_HEADER.map(csvCell).join(CSV_SEP)];
      for (const e of [...rows.values()].sort((a, b) => by(a.name, b.name))) {
        const cells = [...e.t.cells.values()].sort((a, b) => by(a.room, b.room) || by(a.topic, b.topic) || by(a.level, b.level));
        // A student with no answers still gets one row (empty topic, zeros) so the teacher sees who took part.
        const list = cells.length ? cells : [{ room: e.room, topic: '', level: '', right: 0, wrong: 0 }];
        for (const c of list) lines.push([csvCell(e.name), csvCell(label(c.room)), csvCell(c.topic), csvCell(levelLabel(c.level)), String(c.right), String(c.wrong)].join(CSV_SEP));
      }
      return '﻿' + lines.join('\r\n') + '\r\n';
    },
  };
}
