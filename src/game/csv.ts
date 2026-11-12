// Solve or Boom: reads question CSVs (the host's upload and the built-in banks), with no browser needed.
// Design record: design/gdd/question-bank.md (Core Rules 4 and 9, Edge Cases "Data and files").
import { LEVELS, type Level } from './types';

/** A question read from a CSV: the right answer first in `list`, always 4 distinct non-empty choices. */
export interface ParsedQuestion { q: string; list: string[]; level?: Level }

/**
 * Turns the bytes of an uploaded file into text: strict UTF-8 first, and only if that throws (the bytes are not
 * valid UTF-8) Windows-1252, which is what Excel saves Spanish text as. A leading BOM is removed in both cases.
 */
export function decodeCSV(bytes: ArrayBuffer): string {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1252').decode(bytes); }
  return text.replace(/^(\uFEFF|\u00EF\u00BB\u00BF)/, '');
}

/** Splits CSV text into rows of cells (comma, semicolon or tab, found from the first row). */
function splitRows(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
  const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows: string[][] = []; let row: string[] = [], cell = ''; inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell.trim()); rows.push(row);
  return rows.filter(r => r.some(c => c));
}

/** A level word (facil, Fácil, DIFICIL...) as a Level, or undefined. */
function levelOf(word: string | undefined): Level | undefined {
  const w = (word || '').normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase();
  return LEVELS.find(l => l === w);
}

/** Three nearby numbers for a numeric answer, or null when the answer is not a number. */
function nearbyNumbers(right: string): string[] | null {
  const num = Number(right);
  if (right === '' || !Number.isFinite(num)) return null;
  const out: string[] = [];
  for (let n = 1; out.length < 3; n++) {
    for (const d of [n, -n]) {
      const alt = String(Number((num + d).toFixed(6)));
      if (out.length < 3 && !(num >= 0 && num + d < 0) && alt !== right && !out.includes(alt)) out.push(alt);
    }
  }
  return out;
}

/**
 * Reads a CSV of questions. Accepted rows (comma, semicolon or tab, found from the first row):
 *   question,answer                                  -> the wrong choices are borrowed from other rows
 *   question,right,wrong1,wrong2,wrong3[,level]      -> the right answer first
 *   question,a,b,c,d,N[,level]                       -> N is 1-4 or a-d: which choice is right
 * `level` is facil, medio or dificil. Only the first 4 values after the question are choices.
 * A first row that starts with "question" or "pregunta" is a header and is not counted.
 * Skipped (and counted): fewer than 2 columns, 3 or 4 columns, an empty or repeated choice, a repeated
 * question text (the first is kept; texts and choices are compared exactly, case included), a 2-column row that cannot reach 4 distinct choices.
 */
export function parseCSV(text: string): { questions: ParsedQuestion[]; skipped: number } {
  const rows = splitRows(text), out: ParsedQuestion[] = [], fill: ParsedQuestion[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  rows.forEach((r, i) => {
    if (i === 0 && /^(question|pregunta|q)\b/i.test(r[0])) return;
    // A 2-column row exported with empty padding cells still counts as 2 columns.
    const c = r.slice(2).every(x => x === '') ? r.slice(0, 2) : r;
    if (c.length < 2 || c[0] === '' || seen.has(c[0])) { skipped++; return; }
    let list: string[], level: Level | undefined;
    if (c.length === 2) list = [c[1]];
    else if (c.length < 5) { skipped++; return; }
    else {
      list = c.slice(1, 5);
      const sixth = c[5] || '';
      if (/^([1-4]|[a-d])$/i.test(sixth)) {
        const k = /[1-4]/.test(sixth) ? Number(sixth) - 1 : 'abcd'.indexOf(sixth.toLowerCase());
        list = [list[k], ...list.filter((_, j) => j !== k)];
        level = levelOf(c[6]);
      } else level = levelOf(sixth);
      if (list.some(x => x === '') || new Set(list).size < 4) { skipped++; return; }
    }
    if (list[0] === '') { skipped++; return; }
    seen.add(c[0]);
    const item: ParsedQuestion = { q: c[0], list, level };
    out.push(item);
    if (c.length === 2) fill.push(item);
  });
  // Two-column rows borrow their wrong choices from the other rows' answers (numbers get nearby numbers).
  // The pool of answers is built once (rebuilding it per row was quadratic); a row's own answer is skipped by index.
  const pool = [...new Set(out.map(o => o.list[0]))], at = new Map(pool.map((a, i) => [a, i]));
  const bad = new Set<ParsedQuestion>();
  for (const o of fill) {
    const near = nearbyNumbers(o.list[0]);
    if (near) { o.list.push(...near); continue; }
    const own = at.get(o.list[0]) ?? -1, size = pool.length - (own >= 0 ? 1 : 0);
    if (size < 3) { bad.add(o); continue; }
    const start = [...o.q].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % size;
    for (let k = 0; k < 3; k++) { const i = (start + k) % size; o.list.push(pool[own >= 0 && i >= own ? i + 1 : i]); }
  }
  skipped += bad.size;
  return { questions: out.filter(o => !bad.has(o)), skipped };
}
