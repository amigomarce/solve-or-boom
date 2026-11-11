// Solve or Boom: the question banks, the math generator and the CSV loader.
// A question is { q, choices: [4 strings], answer: index of the right choice, topic }.
// Banks are data: each entry is [question, right answer, wrong, wrong, wrong].
import type { Loose } from "./game/types";

/** A question as the cards show it: four choices and the index of the right one. */
export interface Question { q: string; choices: string[]; answer: number; topic: string }
/** A question read from a CSV: the right answer first in list. */
export interface CustomQuestion { q: string; list: string[]; fill?: boolean }
/** A subject: its name and its topics by id. */
export interface Subject { name: string; topics: Record<string, string> }
type Rng = () => number;
type Made = { q: string; list: string[] };

/** Built-in subjects. Math is generated so it never runs out; the others are banks. */
export const SUBJECTS: Record<string, Subject> = {
  math: {
    name: 'Math',
    topics: {
      arith: 'Addition & subtraction',
      mult: 'Multiplication & division',
      frac: 'Fractions',
      pct: 'Percentages',
      eq: 'Simple equations',
    },
  },
  science: {
    name: 'Science',
    topics: { life: 'Living things & the body', physics: 'Forces, energy & space', matter: 'Matter & materials' },
  },
  geography: {
    name: 'Geography',
    topics: { capitals: 'Capital cities', world: 'Continents, oceans & peaks', earth: 'Maps & landforms' },
  },
  english: {
    name: 'English',
    topics: { syn: 'Synonyms', ant: 'Antonyms', grammar: 'Grammar & spelling' },
  },
};

export const BANKS: Record<string, string[][]> = {
  life: [
    ['Which organ pumps blood around the body?', 'Heart', 'Lungs', 'Liver', 'Stomach'],
    ['Which gas do plants take in for photosynthesis?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
    ['What is the basic unit of life?', 'The cell', 'The atom', 'The organ', 'The tissue'],
    ['Which part of a plant cell carries out photosynthesis?', 'Chloroplast', 'Nucleus', 'Cell wall', 'Vacuole'],
    ['How many bones are in an adult human body?', '206', '106', '306', '186'],
    ['Which blood cells fight infection?', 'White blood cells', 'Red blood cells', 'Platelets', 'Plasma'],
    ['Animals with a backbone are called...', 'Vertebrates', 'Invertebrates', 'Arthropods', 'Molluscs'],
    ['Which organs do we breathe with?', 'Lungs', 'Kidneys', 'Heart', 'Liver'],
    ['What do herbivores eat?', 'Plants', 'Only meat', 'Only insects', 'Nothing'],
    ['Where are most nutrients from food absorbed?', 'Small intestine', 'Large intestine', 'Mouth', 'Lungs'],
    ['A frog belongs to which group?', 'Amphibians', 'Reptiles', 'Mammals', 'Fish'],
    ['Which organ controls the whole body?', 'Brain', 'Heart', 'Liver', 'Skin'],
  ],
  physics: [
    ['Which force pulls objects toward the Earth?', 'Gravity', 'Friction', 'Magnetism', 'Tension'],
    ['Which planet is closest to the Sun?', 'Mercury', 'Venus', 'Mars', 'Earth'],
    ['What is the unit of force?', 'Newton', 'Joule', 'Watt', 'Metre'],
    ['Which planet is called the Red Planet?', 'Mars', 'Jupiter', 'Venus', 'Saturn'],
    ['What is the largest planet in our Solar System?', 'Jupiter', 'Saturn', 'Earth', 'Neptune'],
    ['Which force slows down a box sliding on the floor?', 'Friction', 'Magnetism', 'Buoyancy', 'Lift'],
    ['The energy stored in food is...', 'Chemical energy', 'Kinetic energy', 'Sound energy', 'Light energy'],
    ['The energy of a moving object is called...', 'Kinetic energy', 'Potential energy', 'Thermal energy', 'Chemical energy'],
    ['What does the Moon orbit?', 'The Earth', 'Mars', 'Venus', 'Jupiter'],
    ['Sound cannot travel through...', 'A vacuum', 'Water', 'Steel', 'Air'],
    ['What does a thermometer measure?', 'Temperature', 'Mass', 'Speed', 'Volume'],
    ['What is the unit of energy?', 'Joule', 'Newton', 'Volt', 'Kilogram'],
  ],
  matter: [
    ['At sea level, water boils at...', '100 °C', '50 °C', '0 °C', '150 °C'],
    ['Water freezes at...', '0 °C', '10 °C', '-10 °C', '32 °C'],
    ['What is the chemical formula of water?', 'H2O', 'CO2', 'O2', 'NaCl'],
    ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Go', 'Gd'],
    ['Which state of matter keeps its own shape?', 'Solid', 'Liquid', 'Gas', 'Steam'],
    ['A liquid turning into a gas is called...', 'Evaporation', 'Condensation', 'Freezing', 'Melting'],
    ['A gas turning into a liquid is called...', 'Condensation', 'Evaporation', 'Melting', 'Boiling'],
    ['Which gas do we need to breathe to survive?', 'Oxygen', 'Carbon dioxide', 'Helium', 'Hydrogen'],
    ['Which of these is a metal?', 'Iron', 'Wood', 'Glass', 'Plastic'],
    ['Most of the air we breathe is made of...', 'Nitrogen', 'Oxygen', 'Carbon dioxide', 'Argon'],
    ['Salt stirred into water until it disappears makes a...', 'Solution', 'Solid', 'Gas', 'Element'],
    ['What is the pH of pure water?', '7', '1', '14', '0'],
  ],
  capitals: [
    ['What is the capital of France?', 'Paris', 'Lyon', 'Marseille', 'Nice'],
    ['What is the capital of Japan?', 'Tokyo', 'Osaka', 'Kyoto', 'Seoul'],
    ['What is the capital of Brazil?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Buenos Aires'],
    ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
    ['What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
    ['What is the capital of Spain?', 'Madrid', 'Barcelona', 'Seville', 'Lisbon'],
    ['What is the capital of Egypt?', 'Cairo', 'Alexandria', 'Luxor', 'Nairobi'],
    ['What is the capital of Italy?', 'Rome', 'Milan', 'Venice', 'Naples'],
    ['What is the capital of Argentina?', 'Buenos Aires', 'Córdoba', 'Santiago', 'Montevideo'],
    ['What is the capital of Germany?', 'Berlin', 'Munich', 'Hamburg', 'Vienna'],
    ['What is the capital of Kenya?', 'Nairobi', 'Mombasa', 'Addis Ababa', 'Kampala'],
    ['What is the capital of Colombia?', 'Bogotá', 'Medellín', 'Cali', 'Quito'],
    ['What is the capital of Mexico?', 'Mexico City', 'Guadalajara', 'Monterrey', 'Cancún'],
    ['What is the capital of India?', 'New Delhi', 'Mumbai', 'Kolkata', 'Chennai'],
  ],
  world: [
    ['What is the largest ocean on Earth?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'],
    ['How many continents are there?', '7', '5', '6', '8'],
    ['What is the largest continent?', 'Asia', 'Africa', 'North America', 'Europe'],
    ['What is the highest mountain on Earth?', 'Everest', 'K2', 'Kilimanjaro', 'Aconcagua'],
    ['What is the largest hot desert?', 'Sahara', 'Gobi', 'Kalahari', 'Atacama'],
    ['Most of the Amazon rainforest is in which country?', 'Brazil', 'Peru', 'Colombia', 'Venezuela'],
    ['On which continent is Egypt?', 'Africa', 'Asia', 'Europe', 'Oceania'],
    ['Which ocean lies between Europe and North America?', 'Atlantic', 'Pacific', 'Indian', 'Southern'],
    ['On which continent are the Andes mountains?', 'South America', 'Asia', 'Africa', 'Europe'],
    ['What is the largest country by area?', 'Russia', 'Canada', 'China', 'USA'],
    ['Which line splits the Earth into north and south halves?', 'The Equator', 'The Prime Meridian', 'The Tropic of Cancer', 'The Arctic Circle'],
    ['Which continent is covered in ice and has no countries?', 'Antarctica', 'Australia', 'Greenland', 'Asia'],
  ],
  earth: [
    ['Lines on a map that run from pole to pole are lines of...', 'Longitude', 'Latitude', 'Altitude', 'Contour'],
    ['Which direction is opposite to east?', 'West', 'North', 'South', 'Up'],
    ['Land with water all around it is an...', 'Island', 'Peninsula', 'Isthmus', 'Valley'],
    ['Land with water on three sides is a...', 'Peninsula', 'Island', 'Plateau', 'Canyon'],
    ['Melted rock that flows out of a volcano is called...', 'Lava', 'Magma chamber', 'Ash', 'Crust'],
    ['The usual weather of a place over many years is its...', 'Climate', 'Forecast', 'Season', 'Temperature'],
    ['The scale on a map tells you...', 'Distances', 'Heights', 'Temperatures', 'Population'],
    ['What is the outer layer of the Earth called?', 'Crust', 'Core', 'Mantle', 'Magma'],
    ['Which instrument records earthquakes?', 'Seismograph', 'Barometer', 'Compass', 'Telescope'],
    ['Land built up where a river meets the sea is a...', 'Delta', 'Glacier', 'Canyon', 'Dune'],
    ['The layer of gases around the Earth is the...', 'Atmosphere', 'Crust', 'Ocean', 'Core'],
    ['A tool that always points north is a...', 'Compass', 'Map scale', 'Ruler', 'Thermometer'],
  ],
  syn: [
    ['Which word means the same as "happy"?', 'Joyful', 'Angry', 'Tired', 'Sleepy'],
    ['Which word means the same as "big"?', 'Large', 'Tiny', 'Narrow', 'Quiet'],
    ['Which word means the same as "quick"?', 'Fast', 'Slow', 'Heavy', 'Late'],
    ['Which word means the same as "begin"?', 'Start', 'Finish', 'Stop', 'Wait'],
    ['Which word means the same as "brave"?', 'Courageous', 'Scared', 'Lazy', 'Shy'],
    ['Which word means the same as "clever"?', 'Smart', 'Silly', 'Rude', 'Weak'],
    ['Which word means the same as "difficult"?', 'Hard', 'Easy', 'Simple', 'Soft'],
    ['Which word means the same as "ancient"?', 'Very old', 'Modern', 'Young', 'Shiny'],
    ['Which word means the same as "tiny"?', 'Small', 'Huge', 'Wide', 'Tall'],
    ['Which word means the same as "furious"?', 'Very angry', 'Calm', 'Pleased', 'Bored'],
    ['Which word means the same as "gift"?', 'Present', 'Letter', 'Price', 'Promise'],
    ['Which word means the same as "shout"?', 'Yell', 'Whisper', 'Mumble', 'Listen'],
  ],
  ant: [
    ['What is the opposite of "hot"?', 'Cold', 'Warm', 'Boiling', 'Sunny'],
    ['What is the opposite of "ancient"?', 'Modern', 'Old', 'Historic', 'Broken'],
    ['What is the opposite of "generous"?', 'Selfish', 'Kind', 'Friendly', 'Rich'],
    ['What is the opposite of "victory"?', 'Defeat', 'Win', 'Success', 'Prize'],
    ['What is the opposite of "expand"?', 'Shrink', 'Grow', 'Stretch', 'Swell'],
    ['What is the opposite of "noisy"?', 'Quiet', 'Loud', 'Busy', 'Crowded'],
    ['What is the opposite of "arrive"?', 'Depart', 'Reach', 'Enter', 'Land'],
    ['What is the opposite of "strong"?', 'Weak', 'Tough', 'Heavy', 'Hard'],
    ['What is the opposite of "accept"?', 'Refuse', 'Take', 'Agree', 'Allow'],
    ['What is the opposite of "early"?', 'Late', 'Soon', 'First', 'Quick'],
    ['What is the opposite of "float"?', 'Sink', 'Swim', 'Drift', 'Fly'],
    ['What is the opposite of "brave"?', 'Cowardly', 'Bold', 'Heroic', 'Daring'],
  ],
  grammar: [
    ['Which word is a noun? "The dog ran quickly."', 'dog', 'ran', 'quickly', 'the'],
    ['What is the past tense of "go"?', 'went', 'goed', 'gone', 'going'],
    ['What is the plural of "child"?', 'children', 'childs', 'childes', 'childen'],
    ['Which word is an adjective? "A red car stopped."', 'red', 'car', 'stopped', 'a'],
    ['Which word is a verb? "She sings loudly."', 'sings', 'she', 'loudly', 'song'],
    ['Which spelling is correct?', 'necessary', 'neccessary', 'necesary', 'neccesary'],
    ['Fill the gap: "They ___ playing football."', 'are', 'is', 'am', 'be'],
    ['What is the plural of "mouse"?', 'mice', 'mouses', 'mousen', 'meese'],
    ['Which word completes: "This one is ___ than that one." (good)', 'better', 'gooder', 'best', 'more good'],
    ['What is the past tense of "write"?', 'wrote', 'writed', 'written', 'writing'],
    ['Which word is an adverb? "He ran quickly."', 'quickly', 'ran', 'he', 'run'],
    ['Fill the gap: "___ going to the park after school."', "They're", 'Their', 'There', 'Theyre'],
  ],
};

// ---- Math, generated from the game's seeded rng so it never runs out --------------------
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
const MATH: Record<string, (rng: Rng) => Made> = {
  arith(rng: Rng): Made {
    const add = rng() < 0.5;
    let a = 12 + Math.floor(rng() * 488), b = 11 + Math.floor(rng() * 288);
    if (!add && b > a) [a, b] = [b, a];
    const ans = add ? a + b : a - b;
    return { q: `${a} ${add ? '+' : '−'} ${b} = ?`, list: numberChoices(rng, ans, 20) };
  },
  mult(rng: Rng): Made {
    const a = 2 + Math.floor(rng() * 11), b = 2 + Math.floor(rng() * 11);
    if (rng() < 0.6) return { q: `${a} × ${b} = ?`, list: numberChoices(rng, a * b, a) };
    return { q: `${a * b} ÷ ${a} = ?`, list: numberChoices(rng, b, 3) };
  },
  frac(rng: Rng): Made {
    const kind = Math.floor(rng() * 3);
    if (kind === 0) { // add with the same denominator
      const d = [4, 5, 6, 8, 10, 12][Math.floor(rng() * 6)];
      const a = 1 + Math.floor(rng() * (d - 2)), b = 1 + Math.floor(rng() * (d - a - 1));
      const right = frac(a + b, d);
      const wrong = new Set([`${a + b}/${d + d}`, frac(Math.abs(a - b) || 1, d), frac(a + b + 1, d), `${a * b}/${d}`]);
      wrong.delete(right);
      return { q: `${a}/${d} + ${b}/${d} = ?  (simplest form)`, list: [right, ...[...wrong].slice(0, 3)] };
    }
    if (kind === 1) { // a fraction of a number
      const d = [2, 3, 4, 5, 10][Math.floor(rng() * 5)], n = 1 + Math.floor(rng() * (d - 1));
      const whole = d * (2 + Math.floor(rng() * 10));
      return { q: `What is ${n}/${d} of ${whole}?`, list: numberChoices(rng, (whole / d) * n, Math.max(2, whole / d)) };
    }
    const d = [4, 6, 8, 9, 10, 12][Math.floor(rng() * 6)]; // simplify
    const f = [2, 3, 4].find(k => d % k === 0) || 2, n = f * (1 + Math.floor(rng() * (d / f - 1)));
    const right = frac(n, d);
    const wrong = new Set([`${n}/${d}`, frac(n + 1, d), `${n / gcd(n, d)}/${d}`, frac(n, d + 2)]);
    wrong.delete(right);
    const w = [...wrong].slice(0, 3);
    while (w.length < 3) w.push(`${w.length + 2}/${d + w.length + 1}`);
    return { q: `Simplify ${n}/${d}`, list: [right, ...w] };
  },
  pct(rng: Rng): Made {
    const p = [10, 20, 25, 50, 75][Math.floor(rng() * 5)];
    const base = [20, 40, 60, 80, 120, 200, 360, 400][Math.floor(rng() * 8)];
    return { q: `What is ${p}% of ${base}?`, list: numberChoices(rng, (p * base) / 100, Math.max(5, base / 10)) };
  },
  eq(rng: Rng): Made {
    const x = 1 + Math.floor(rng() * 12), a = 2 + Math.floor(rng() * 8), b = 1 + Math.floor(rng() * 20);
    const k = Math.floor(rng() * 3);
    if (k === 0) return { q: `x + ${b} = ${x + b}.  x = ?`, list: numberChoices(rng, x, 3) };
    if (k === 1) return { q: `${a}x = ${a * x}.  x = ?`, list: numberChoices(rng, x, 3) };
    return { q: `${a}x + ${b} = ${a * x + b}.  x = ?`, list: numberChoices(rng, x, 3) };
  },
};

/** Shuffles a [right, wrong...] list into a question with the right index. */
function make(rng: Rng, q: string, list: string[], topic: string): Question {
  const order = list.map((s, i) => ({ s, i, k: rng() })).sort((a, b) => a.k - b.k);
  return { q, choices: order.map(o => o.s), answer: order.findIndex(o => o.i === 0), topic };
}

/**
 * A deck: draws questions for one session without repeating until the pool runs out.
 * @param {string} subject  'math' | 'science' | 'geography' | 'english' | 'custom'
 * @param {string[]} topics topic ids picked on the session screen
 * @param {object[]} custom questions from a CSV (subject 'custom')
 * @param {function} rng    the game's seeded random
 */
export function deck(subject: string, topics: string[], custom: CustomQuestion[], rng: Rng): { next(): Question } {
  let pool: Loose[] = [], last = '';
  function refill() {
    if (subject === 'custom') pool = custom.map((c, i) => i);
    else if (subject !== 'math') topics.forEach(t => BANKS[t].forEach((_, i) => pool.push([t, i])));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  }
  return {
    /** The next question, never the same text as the one before it. */
    next(): Question {
      for (let guard = 0; guard < 6; guard++) {
        let out: Question;
        if (subject === 'math') {
          const t = topics[Math.floor(rng() * topics.length)];
          const g = MATH[t](rng); out = make(rng, g.q, g.list, SUBJECTS.math.topics[t]);
        } else {
          if (!pool.length) refill();
          const p = pool.pop();
          if (subject === 'custom') { const c = custom[p]; out = make(rng, c.q, c.list, 'My questions'); }
          else { const e = BANKS[p[0]][p[1]]; out = make(rng, e[0], e.slice(1), topicName(p[0])); }
        }
        if (out.q !== last || guard === 5) { last = out.q; return out; }
      }
      throw new Error("unreachable: the sixth try always returns");
    },
  };
}
function topicName(id: string): string {
  for (const s of Object.values(SUBJECTS)) if (s.topics[id]) return s.topics[id];
  return id;
}

// ---- CSV ---------------------------------------------------------------------------
function splitRows(text: string): string[][] {
  text = text.replace(/^﻿/, '');
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
  return rows.map(r => r.filter((c, i) => c !== '' || i < 2)).filter(r => r.some(c => c));
}

/**
 * Reads a CSV of questions. Accepted rows (comma, semicolon or tab):
 *   question,answer                          -> the wrong choices come from other rows' answers
 *   question,right,wrong1,wrong2,wrong3      -> the right answer first
 *   question,a,b,c,d,2  (or B)               -> four choices and which one is right
 * A first row that starts with "question" or "pregunta" is a header and is skipped.
 * @returns {{questions: object[], skipped: string[]}}
 */
export function parseCSV(text: string): { questions: CustomQuestion[]; skipped: string[] } {
  const rows = splitRows(text), out: CustomQuestion[] = [], skipped: string[] = [];
  rows.forEach((r, i) => {
    const c = r.filter(x => x !== '');
    if (i === 0 && /^(question|pregunta|q)\b/i.test(c[0] || '')) return;
    if (c.length < 2) { skipped.push(`row ${i + 1}: needs a question and an answer`); return; }
    if (c.length >= 6 && /^([1-4]|[a-d])$/i.test(c[5])) {
      const k = /[1-4]/.test(c[5]) ? Number(c[5]) - 1 : 'abcd'.indexOf(c[5].toLowerCase());
      const list = [c[1 + k], ...[1, 2, 3, 4].filter(j => j !== 1 + k).map(j => c[j])];
      out.push({ q: c[0], list }); return;
    }
    if (c.length >= 3) { out.push({ q: c[0], list: c.slice(1, 5) }); return; }
    out.push({ q: c[0], list: [c[1]], fill: true });
  });
  // Two-column rows borrow their wrong answers from the other rows' answers.
  const answers = [...new Set(out.map(o => o.list[0]))];
  for (const o of out) {
    if (!o.fill && o.list.length >= 4) continue;
    const others = answers.filter(a => a !== o.list[0]);
    let k = 0;
    while (o.list.length < 4 && k < others.length) {
      const pick = others[(o.q.length * 7 + k * 13) % others.length]; k++;
      if (!o.list.includes(pick)) o.list.push(pick);
    }
    const num = Number(o.list[0]);
    let n = 1;
    while (o.list.length < 4) {
      const alt = Number.isFinite(num) ? String(num + n * (n % 2 ? 1 : -1)) : `Not ${o.list[0]} (${n})`;
      if (!o.list.includes(alt)) o.list.push(alt); n++;
    }
    delete o.fill;
  }
  return { questions: out, skipped };
}

