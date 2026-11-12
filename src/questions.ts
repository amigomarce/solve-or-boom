// Solve or Boom: the subjects, the built-in question banks, the math generator and the match deck.
// Design record: design/gdd/question-bank.md. The banks are the CSV files in assets/questions/<subject>/<topic>.csv,
// bundled into the build (a page opened from disk cannot fetch files). Parsing and the deck live in src/game/.
import { parseCSV, type ParsedQuestion } from './game/csv';
import { createDeck, type Deck, type Question, type RawQuestion } from './game/deck';
import { LEVELS, type Level } from './game/types';
import { tune } from './game/tune';

export type { Question, Deck, Level };
/** A subject: its name and its topics by id. */
export interface Subject { name: string; topics: Record<string, string> }
type Rng = () => number;
type Made = { q: string; list: string[] };

/** The subject id of the host's own CSV. */
export const CUSTOM = 'custom';
/** The name the session screen and cards show for the host's own CSV. */
export const CUSTOM_NAME = 'Mis preguntas';
/** The levels as the screens show them. */
export const LEVEL_NAMES: Record<Level, string> = { facil: 'Fácil', medio: 'Medio', dificil: 'Difícil' };

/** Built-in subjects. Math is generated so it never runs out; the others are the CSV banks (topic id = file name). */
export const SUBJECTS: Record<string, Subject> = {
  matematicas: {
    name: 'Matemáticas',
    topics: {
      arith: 'Sumas y restas',
      mult: 'Multiplicación y división',
      frac: 'Fracciones',
      pct: 'Porcentajes',
      eq: 'Ecuaciones simples',
    },
  },
  ciencias: {
    name: 'Ciencias',
    topics: { 'seres-vivos': 'Seres vivos y el cuerpo', 'fuerzas-energia-espacio': 'Fuerzas, energía y espacio', 'materia-materiales': 'Materia y materiales' },
  },
  geografia: {
    name: 'Geografía',
    topics: { capitales: 'Capitales', 'continentes-oceanos-montanas': 'Continentes, océanos y montañas', 'mapas-relieve': 'Mapas y relieve' },
  },
  lengua: {
    name: 'Lengua',
    topics: { sinonimos: 'Sinónimos', antonimos: 'Antónimos', 'gramatica-ortografia': 'Gramática y ortografía' },
  },
};

import { FILES } from './banks';
/** The parsed built-in banks by topic id. */
const BANK: Record<string, ParsedQuestion[]> = {};
for (const [path, text] of Object.entries(FILES)) {
  const m = /([^/]+)\.csv$/.exec(path);
  if (m) BANK[m[1]] = parseCSV(text).questions;
}

/** The level a topic really uses for `want`: the nearest one that has questions (the easier on a tie), or null. */
function levelWithQuestions(rows: ParsedQuestion[], want: Level): Level | null {
  const has = (l: Level): boolean => rows.some(r => (r.level ?? 'medio') === l);
  const w = LEVELS.indexOf(want);
  const near = [...LEVELS].sort((a, b) => Math.abs(LEVELS.indexOf(a) - w) - Math.abs(LEVELS.indexOf(b) - w) || LEVELS.indexOf(a) - LEVELS.indexOf(b));
  return near.find(has) ?? null;
}
/** The built-in questions of the chosen topics at the level (each topic falls back to its nearest level). */
function builtIn(subject: string, topics: string[], level: Level): RawQuestion[] {
  const out: RawQuestion[] = [];
  for (const t of topics) {
    const rows = BANK[t] ?? [], l = levelWithQuestions(rows, level);
    for (const r of rows) if ((r.level ?? 'medio') === l) out.push({ q: r.q, list: r.list, topic: SUBJECTS[subject].topics[t], level: r.level ?? 'medio' });
  }
  return out;
}

/**
 * How many questions a choice on the session screen really has, after the level fallback.
 * @returns the count, or null for Matemáticas (generated, never runs out)
 */
export function availableCount(subject: string, topics: string[], level: Level, custom: ParsedQuestion[]): number | null {
  if (subject === CUSTOM) return custom.length;
  if (subject === 'matematicas') return null;
  return builtIn(subject, topics, level).length;
}

// ---- Math, generated from the game's seeded rng so it never runs out --------------------
// The number ranges per level are in data/config.json (math_<topic>_<part>_<level>).
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : Math.abs(a); }
function frac(n: number, d: number): string { const g = gcd(n, d); return `${n / g}/${d / g}`; }
function numberChoices(rng: Rng, ans: number, spread: number): string[] {
  const out = new Set([ans]);
  const tries = [ans + 1, ans - 1, ans + 10, ans - 10, ans + 2, ans - 2, ans * 2, ans + spread, ans - spread];
  while (out.size < 4) {
    const pick = tries.length ? tries.splice(Math.floor(rng() * tries.length), 1)[0]
      : ans + Math.round((rng() - 0.5) * 4 * spread) + 3;
    if (Number.isFinite(pick) && pick >= 0 && !out.has(pick)) out.add(pick);
  }
  return [...out].map(String);
}
/** A whole number from lo to hi, both included. */
const between = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
/** Three distinct wrong fractions: the candidates, padded with the numerator moved up. */
function wrongFracs(right: string, candidates: string[], num: number, den: number): string[] {
  const w = new Set(candidates);
  w.delete(right);
  for (let k = 1; w.size < 3; k++) { const f = frac(num + k, den); if (f !== right) w.add(f); }
  return [...w].slice(0, 3);
}
const MATH: Record<string, (rng: Rng, level: Level) => Made> = {
  arith(rng, level) {
    const t = (part: string): number => tune[`math_arith_${part}_${level}`];
    const add = rng() < 0.5;
    let a = between(rng, t('a_min'), t('a_max')), b = between(rng, t('b_min'), t('b_max'));
    if (!add && b > a) [a, b] = [b, a];
    const ans = add ? a + b : a - b;
    return { q: `${a} ${add ? '+' : '−'} ${b} = ?`, list: numberChoices(rng, ans, 20) };
  },
  mult(rng, level) {
    const lo = tune[`math_mult_min_${level}`], hi = tune[`math_mult_max_${level}`];
    const a = between(rng, lo, hi), b = between(rng, lo, hi);
    if (rng() < 0.6) return { q: `${a} × ${b} = ?`, list: numberChoices(rng, a * b, a) };
    return { q: `${a * b} ÷ ${a} = ?`, list: numberChoices(rng, b, 3) };
  },
  frac(rng, level) {
    const lo = tune[`math_frac_den_min_${level}`], hi = tune[`math_frac_den_max_${level}`];
    const kind = Math.floor(rng() * 3);
    if (kind === 0 && level === 'dificil') { // add with different denominators
      const d1 = between(rng, lo, hi), d2 = between(rng, lo, hi - 1), d = d2 >= d1 ? d2 + 1 : d2;
      const a = between(rng, 1, d1 - 1), b = between(rng, 1, d - 1), num = a * d + b * d1, den = d1 * d;
      const right = frac(num, den);
      return { q: `${a}/${d1} + ${b}/${d} = ?  (forma simplificada)`, list: [right, ...wrongFracs(right, [`${a + b}/${d1 + d}`, frac(num + 1, den), frac(a * b, den)], num, den)] };
    }
    if (kind === 0) { // add with the same denominator
      const d = between(rng, lo, hi);
      const a = 1 + Math.floor(rng() * (d - 2)), b = 1 + Math.floor(rng() * (d - a - 1));
      const right = frac(a + b, d);
      return { q: `${a}/${d} + ${b}/${d} = ?  (forma simplificada)`, list: [right, ...wrongFracs(right, [`${a + b}/${d + d}`, frac(Math.abs(a - b) || 1, d), frac(a + b + 1, d), `${a * b}/${d}`], a + b, d)] };
    }
    if (kind === 1) { // a fraction of a number
      const d = between(rng, lo, hi), n = 1 + Math.floor(rng() * (d - 1));
      const whole = d * between(rng, 2, tune[`math_frac_mult_max_${level}`]);
      return { q: `¿Cuánto es ${n}/${d} de ${whole}?`, list: numberChoices(rng, (whole / d) * n, Math.max(2, whole / d)) };
    }
    // simplify: the denominator needs a factor 2, 3 or 4 that leaves at least 2
    const dens: number[] = [];
    for (let d = lo; d <= hi; d++) if ([2, 3, 4].some(k => d % k === 0 && d / k >= 2)) dens.push(d);
    const d = dens.length ? dens[Math.floor(rng() * dens.length)] : 4;
    const f = [2, 3, 4].find(k => d % k === 0 && d / k >= 2)!, n = f * (1 + Math.floor(rng() * (d / f - 1)));
    const right = frac(n, d);
    return { q: `Simplifica ${n}/${d}`, list: [right, ...wrongFracs(right, [`${n}/${d}`, frac(n + 1, d), `${n / gcd(n, d)}/${d}`, frac(n, d + 2)], n, d)] };
  },
  pct(rng, level) {
    const t = (part: string): number => tune[`math_pct_${part}_${level}`];
    // Steps of 5 and 20 keep every answer a whole number.
    const p = 5 * between(rng, t('p_min') / 5, t('p_max') / 5);
    const base = 20 * between(rng, t('base_min') / 20, t('base_max') / 20);
    return { q: `¿Cuánto es el ${p}% de ${base}?`, list: numberChoices(rng, (p * base) / 100, Math.max(5, base / 10)) };
  },
  eq(rng, level) {
    const t = (part: string): number => tune[`math_eq_${part}_${level}`];
    const x = between(rng, 1, t('x_max')), a = between(rng, 2, t('a_max')), b = between(rng, 1, t('b_max'));
    const list = (): string[] => numberChoices(rng, x, 3);
    if (level === 'dificil') { // one more step than medio
      if (rng() < 0.5) return { q: `${a}(x + ${b}) = ${a * (x + b)}.  x = ?`, list: list() };
      const big = Math.max(3, a), c = between(rng, 2, big - 1);
      return { q: `${big}x + ${b} = ${c}x + ${(big - c) * x + b}.  x = ?`, list: list() };
    }
    const k = Math.floor(rng() * 3);
    if (k === 0) return { q: `x + ${b} = ${x + b}.  x = ?`, list: list() };
    if (k === 1) return { q: `${a}x = ${a * x}.  x = ?`, list: list() };
    return { q: `${a}x + ${b} = ${a * x + b}.  x = ?`, list: list() };
  },
};

/**
 * Builds the deck of one match from the subject, topics and level (GDD Core Rule 5 and 6).
 * @param subject 'matematicas' | 'ciencias' | 'geografia' | 'lengua' | 'custom'
 * @param topics  topic ids picked on the session screen (ignored for 'custom')
 * @param level   facil | medio | dificil: the base level (ignored for 'custom'); `next(level)` on the deck can ask for another
 * @param custom  questions from the host's CSV (subject 'custom')
 * @param rng     the game's seeded random
 */
export function deck(subject: string, topics: string[], level: Level, custom: ParsedQuestion[], rng: Rng): Deck {
  const gap = tune.retry_gap, max = tune.retry_max;
  if (subject === CUSTOM) return createDeck(custom.map(c => ({ q: c.q, list: c.list, topic: CUSTOM_NAME })), rng, gap, max);
  if (subject === 'matematicas') {
    return createDeck((lv = level) => {
      const t = topics[Math.floor(rng() * topics.length)], g = MATH[t](rng, lv);
      return { q: g.q, list: g.list, topic: SUBJECTS.matematicas.topics[t], level: lv };
    }, rng, gap, max);
  }
  // One pool per level, each with its own nearest-level fallback; `level` is only the default of a level-less draw.
  return createDeck(Object.fromEntries(LEVELS.map(l => [l, builtIn(subject, topics, l)])) as Record<Level, RawQuestion[]>, rng, gap, max);
}
