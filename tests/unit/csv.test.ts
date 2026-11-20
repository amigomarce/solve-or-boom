// Vitest: the question CSV reader (src/game/csv.ts, design/gdd/question-bank.md) and the teacher page's downloadable
// template (TD-015, docs/tech-debt-register.md). The template rows live in src/server/profesor.html; this test reads
// them from the page, builds the file exactly as downloadTemplate() does, and checks every row loads.
import { describe, expect, it } from 'vitest';
import page from '../../src/server/profesor.html?raw';
import { decodeCSV, loadQuestionFile, parseCSV } from '../../src/game/csv';

/** The page's TEMPLATE_ROWS array, read from its source (the page is plain JavaScript and cannot be imported). */
function templateRows(): string[] {
  const m = page.match(/const TEMPLATE_ROWS = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('profesor.html has no TEMPLATE_ROWS');
  return new Function(`return ${m[1]};`)() as string[];
}
/** The template file's bytes as downloadTemplate() saves them: a UTF-8 BOM, the rows joined by CRLF, a final CRLF. */
function templateBytes(rows: string[]): ArrayBuffer {
  const u8 = new TextEncoder().encode('﻿' + rows.join('\r\n') + '\r\n');
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
const bytes = (u8: Uint8Array): ArrayBuffer => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

describe('the teacher page CSV template', () => {
  it('loads every example row with none skipped', () => {
    const rows = templateRows();
    const res = parseCSV(decodeCSV(templateBytes(rows)));
    expect(res.skipped).toBe(0);
    expect(res.questions).toHaveLength(rows.length - 1); // all but the header
  });
  it('reads each example form as the page explains it', () => {
    const qs = parseCSV(decodeCSV(templateBytes(templateRows()))).questions;
    const by = (start: string) => qs.find(q => q.q.startsWith(start))!;
    expect(by('¿Cuánto es 7 x 8').list[0]).toBe('56'); // right answer first, level word
    expect(by('¿Cuánto es 7 x 8').level).toBe('facil');
    expect(by('¿Qué elemento').list[0]).toBe('Oxígeno'); // N = 2 picks the second choice
    expect(by('¿Cuántos lados').list[0]).toBe('6'); // N = b picks the second choice
    expect(by('¿Cuántos lados').level).toBe('dificil');
    expect(by('¿Quién escribió').list).toHaveLength(4); // 2 columns: wrong choices borrowed
  });
});

describe('parseCSV', () => {
  it('skips the header row without counting it', () => {
    expect(parseCSV('pregunta,respuesta\n2+2,4').skipped).toBe(0);
  });
  it('finds a semicolon separator from the first row', () => {
    const res = parseCSV('¿Capital de Italia?;Roma;Milán;Turín;Nápoles');
    expect(res.questions[0].list).toEqual(['Roma', 'Milán', 'Turín', 'Nápoles']);
  });
  it('skips and counts a row with 3 or 4 columns', () => {
    expect(parseCSV('a,b,c\nd,e,f,g').skipped).toBe(2);
  });
  it('skips a repeated question and keeps the first', () => {
    const res = parseCSV('Q1,a,b,c,d\nQ1,w,x,y,z');
    expect(res.skipped).toBe(1);
    expect(res.questions[0].list[0]).toBe('a');
  });
  it('skips a row with a repeated choice', () => {
    expect(parseCSV('Q1,a,a,c,d').skipped).toBe(1);
  });
  it('gives a numeric 2-column answer three nearby numbers', () => {
    const q = parseCSV('2+2,4').questions[0];
    expect(q.list[0]).toBe('4');
    expect(new Set(q.list).size).toBe(4);
    expect(q.list.slice(1).every(x => Math.abs(Number(x) - 4) <= 2)).toBe(true);
  });
  it('skips a word 2-column row when there are too few other answers to borrow', () => {
    expect(parseCSV('Q1,uno\nQ2,dos').skipped).toBe(2);
  });
  it('keeps a quoted comma inside a cell', () => {
    expect(parseCSV('"Uno, dos",a,b,c,d').questions[0].q).toBe('Uno, dos');
  });
});

describe('decodeCSV', () => {
  it('reads a Windows-1252 file as Excel saves Spanish text', () => {
    const text = decodeCSV(bytes(new Uint8Array([0x50, 0x61, 0x72, 0xED, 0x73]))); // "París" in Windows-1252
    expect(text).toBe('París');
  });
  it('removes a leading UTF-8 BOM', () => {
    expect(decodeCSV(bytes(new Uint8Array([0xEF, 0xBB, 0xBF, 0x61])))).toBe('a');
  });
});

describe('loadQuestionFile: one load step for the host and the teacher (TD-014)', () => {
  const lim = { maxBytes: 1024, maxQuestions: 3 };
  const file = (text: string): ArrayBuffer => bytes(new TextEncoder().encode(text));
  it('loads a good file and says how many questions', () => {
    const res = loadQuestionFile(file('Q1,a,b,c,d\nQ2,e,f,g,h'), 'mias.csv', lim);
    expect(res).toMatchObject({ ok: true, count: 2, skipped: 0, text: 'Cargadas 2 preguntas de mias.csv' });
    expect(res.questions).toHaveLength(2);
  });
  it('says one question in the singular', () => {
    expect(loadQuestionFile(file('Q1,a,b,c,d'), 'una.csv', lim).text).toBe('Cargada 1 pregunta de una.csv');
  });
  it('refuses a file over the size limit before reading it', () => {
    const res = loadQuestionFile(file('x'.repeat(2048)), 'grande.csv', lim);
    expect(res).toMatchObject({ ok: false, count: 0, skipped: 0, text: 'El archivo es demasiado grande (máximo 1 KB).' });
  });
  it('refuses far more rows than questions allowed before parsing', () => {
    const res = loadQuestionFile(file('Q,a,b,c,d\n'.repeat(8)), 'filas.csv', lim);
    expect(res.ok).toBe(false);
    expect(res.text).toBe('Demasiadas filas (9); el máximo es 3 preguntas.');
  });
  it('refuses more questions than allowed', () => {
    const res = loadQuestionFile(file('Q1,a,b,c,d\nQ2,a,b,c,d\nQ3,a,b,c,d\nQ4,a,b,c,d'), 'muchas.csv', lim);
    expect(res).toMatchObject({ ok: false, count: 4, text: 'Demasiadas preguntas (4); el máximo es 3.' });
    expect(res.questions).toHaveLength(0);
  });
  it('refuses a file with no valid question and counts the skipped rows', () => {
    expect(loadQuestionFile(file('a,b,c'), 'mal.csv', lim)).toMatchObject({ ok: false, count: 0, skipped: 1, text: 'No hay preguntas válidas en mal.csv' });
  });
});
