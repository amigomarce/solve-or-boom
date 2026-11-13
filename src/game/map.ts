// The map: a grid of 3 m cells, its zones, sight lines and paths. No browser in here,
// so the rules that read it run under Vitest in Node.
// The maps themselves are data: one file each in data/maps/ (design/game-brief.md, Features:
// "two bomb sites (A and B), two bases, 3 lanes"). loadMap() builds the grid of the chosen one;
// every helper below reads the loaded map. Every map is checked when this module loads, and a
// broken one throws: a map file that is wrong never reaches a player silently.
import type { Loose } from './types';
import { tune } from './tune';
import pequeno from '../../data/maps/pequeno.json';
import grande from '../../data/maps/grande.json';
import patio from '../../data/maps/patio.json';
import pasillos from '../../data/maps/pasillos.json';
import dospisos from '../../data/maps/dospisos.json';

/** A cell on the grid: [column, row]. In `spawns`, `sites`, `routes` and `anchors` a third number may name the level (0 ground, 1 first floor; default 0). */
export type Cell = number[];
/** One ramp (a stair is a ramp: the surface is smooth, the screen may draw steps). */
export interface RampData {
  /** Cells [x0, y0, x1, y1] (inclusive) the ramp covers. */
  rect: number[];
  /** The way UP: E is +x (east), W is -x, S is +z (the next row), N is -z. The height climbs from 0 at the low edge of the rectangle to one level_height at the high edge, evenly over its length. */
  dir: 'E' | 'W' | 'N' | 'S';
  note?: string;
}
/** One map, as a data/maps/*.json file holds it. */
export interface MapData {
  /** The name the selector shows. */
  name: string;
  /** Size in cells. */
  width: number; height: number;
  /** Seconds until the defenders win by time. */
  round_time: number;
  /** The look: fog [near, far] in metres; the title flyover [x radius, z radius, height] in metres. */
  view: { fog: number[]; flyover: number[] };
  /** Floor rectangles [x0, y0, x1, y1] (inclusive), carved in order; zone: att_base, def_base, A or B. */
  floor: { rect: number[]; zone?: string; note?: string; level?: number }[];
  /** Heights (story 011), all optional: `level: 1` on a floor rectangle puts it on the first floor (data/config.json level_height above the ground; the ground cell below it may be a floor, a crate or a wall); `ramps` join the levels. A map with neither loads exactly as before. */
  ramps?: RampData[];
  /** Crate cells: cover that stops bodies, sight and bullets. A third number 1 puts the crate on the first floor (the cell must be first-floor). */
  crates: Cell[];
  /** Optional dressing of crate cells (story 010): a kind (barrel, pallet or sandbag) per cell that is also in `crates`; the rest stay wooden crates. */
  props?: { kind: string; cell: Cell }[];
  /** Spawn cells per side, one per player of the side. */
  spawns: { att: Cell[]; def: Cell[] };
  /** The cell the painted letter and the bomb carrier aim for, per site. */
  sites: { A: Cell; B: Cell };
  /** The attackers' waypoints to each site: lane (a side lane) and mid (the middle). */
  routes: { A: { lane: Cell[]; mid: Cell[] }; B: { lane: Cell[]; mid: Cell[] } };
  /** Defender anchors: conn (one per round, taken in turn), mid (the defending sniper's hold). */
  anchors: { conn: Cell[]; mid: Cell };
  /** Where the attacking sniper holds before going in. */
  attack_hold: Cell;
}

/** Every map, by id; the order is the selector's. */
// A JSON import types a ramp's dir as string; mapProblems checks it.
export const MAPS: Record<string, MapData> = { pequeno, grande, patio, pasillos, dospisos: dospisos as MapData };
/** The map ids in the selector's order. */
export const MAP_IDS = Object.keys(MAPS);
/** The map ids with the name the selector shows. */
export const MAP_LIST: { id: string; name: string }[] = MAP_IDS.map(id => ({ id, name: MAPS[id].name }));
const ZONES: Record<string, number> = { att_base: 1, def_base: 2, A: 3, B: 4 };

export const CELL = 3, WALL_H = 4.5, EYE = 1.6, RADIUS = 0.35;
/** The loaded map's id and data. */
export let MAP_ID = '', MAP: MapData;
/** The loaded map's size in cells. */
export let MW = 0, MH = 0;
export let grid = new Uint8Array(0);   // 0 wall, 1 floor, 2 crate
export let zone = new Uint8Array(0);   // 1 west base, 2 east base, 3 site A, 4 site B
/** The first-floor layer (HEIGHT MODEL): grid1 is 0 where there is no first floor (open air over the ground), 1 floor, 2 crate. zone1 is the zone of a first-floor cell. */
export let grid1 = new Uint8Array(0), zone1 = new Uint8Array(0);
/** Ramp cells: rampDir is 0 (no ramp) or 1 E, 2 W, 3 S, 4 N (the way up); rampLo and rampHi are the height of the cell's low and high edge as a fraction (0..1) of level_height. A ramp cell has grid 1 (ground floor) and no ground surface of its own: the ramp is the only surface. */
export let rampDir = new Uint8Array(0), rampLo = new Float32Array(0), rampHi = new Float32Array(0);
/** True when the loaded map has a first floor or a ramp. False: every height function below is skipped and the rules are exactly the flat ones. */
export let hasHeights = false;
export let isGate = new Uint8Array(0); // floor cells that close a base during buy time
/** The loaded map's crate cells. */
export let CRATES: Cell[] = [];
/** The loaded map's site centres and zone numbers. */
export let SITE: Record<string, { cx: number; cy: number; z: number; lv: number }> = {};
/** The loaded map's floor cells of each site, row by row. */
export let siteCells: Record<string, Cell[]> = { A: [], B: [] };
let bfsPrev = new Int32Array(0);
export const idx = (cx: number, cy: number): number => cy * MW + cx;

/** Builds the grid, zones, gates and sites of a map into the module's state. */
function build(d: MapData): void {
  MW = d.width; MH = d.height;
  grid = new Uint8Array(MW * MH); zone = new Uint8Array(MW * MH); isGate = new Uint8Array(MW * MH);
  bfsPrev = new Int32Array(MW * MH);
  grid1 = new Uint8Array(MW * MH); zone1 = new Uint8Array(MW * MH);
  rampDir = new Uint8Array(MW * MH); rampLo = new Float32Array(MW * MH); rampHi = new Float32Array(MW * MH);
  hasHeights = !!(d.ramps?.length) || d.floor.some(f => f.level === 1);
  for (const f of d.floor) {
    const [x0, y0, x1, y1] = f.rect, z = f.zone ? ZONES[f.zone] : 0, up = f.level === 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (up) { grid1[idx(x, y)] = 1; if (z) zone1[idx(x, y)] = z; } else { grid[idx(x, y)] = 1; if (z) zone[idx(x, y)] = z; }
    }
  }
  for (const r of d.ramps ?? []) {
    const [x0, y0, x1, y1] = r.rect, along = r.dir === 'E' || r.dir === 'W', n = along ? x1 - x0 + 1 : y1 - y0 + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = r.dir === 'E' ? x - x0 : r.dir === 'W' ? x1 - x : r.dir === 'S' ? y - y0 : y1 - y, i = idx(x, y);
      grid[i] = 1; zone[i] = 0; rampDir[i] = ({ E: 1, W: 2, S: 3, N: 4 } as Record<string, number>)[r.dir]; rampLo[i] = k / n; rampHi[i] = (k + 1) / n;
    }
  }
  CRATES = d.crates;
  for (const c of CRATES) { if (c[2] === 1) grid1[idx(c[0], c[1])] = 2; else grid[idx(c[0], c[1])] = 2; }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y);
    if (grid[i] !== 1 || zone[i] === 1 || zone[i] === 2) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = idx(x + dx, y + dy);
      if (zone[j] === 1 || zone[j] === 2) { isGate[i] = zone[j]; break; }
    }
  }
  SITE = { A: { cx: d.sites.A[0], cy: d.sites.A[1], z: 3, lv: d.sites.A[2] === 1 ? 1 : 0 }, B: { cx: d.sites.B[0], cy: d.sites.B[1], z: 4, lv: d.sites.B[2] === 1 ? 1 : 0 } };
  siteCells = { A: [], B: [] };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y);
    const lay = (S: string): [Uint8Array, Uint8Array] => (SITE[S].lv === 1 ? [grid1, zone1] : [grid, zone]);
    if (lay('A')[0][i] === 1 && lay('A')[1][i] === 3) siteCells.A.push([x, y]);
    if (lay('B')[0][i] === 1 && lay('B')[1][i] === 4) siteCells.B.push([x, y]);
  }
}

/** Everything build() makes for one map: kept, so a second match on the same map (or rooms on different maps) switch maps without rebuilding. */
interface Built { MW: number; MH: number; grid: typeof grid; zone: typeof zone; grid1: typeof grid1; zone1: typeof zone1; rampDir: typeof rampDir; rampLo: typeof rampLo; rampHi: typeof rampHi; hasHeights: boolean; isGate: typeof isGate; CRATES: Cell[]; SITE: typeof SITE; siteCells: typeof siteCells; bfsPrev: typeof bfsPrev }
const built: Record<string, Built> = {};

/**
 * Makes the map with this id the one every helper reads. Throws on an unknown id. The grid of each map is built
 * once and kept; switching back to it is only a swap of the module's references, so the classroom server (many
 * rooms, several maps, one process) switches to a match's map at the start of each of its steps.
 */
export function loadMap(id: string): void {
  const d = MAPS[id];
  if (!d) throw new Error(`No map "${id}": the maps are ${MAP_IDS.join(', ')}`);
  MAP_ID = id; MAP = d;
  if (!built[id]) { build(d); built[id] = { MW, MH, grid, zone, grid1, zone1, rampDir, rampLo, rampHi, hasHeights, isGate, CRATES, SITE, siteCells, bfsPrev }; return; }
  ({ MW, MH, grid, zone, grid1, zone1, rampDir, rampLo, rampHi, hasHeights, isGate, CRATES, SITE, siteCells, bfsPrev } = built[id]);
}

/**
 * What is wrong with a map, as sentences; empty when it is sound. Checks the size and the
 * floor rectangles, that every spawn, waypoint, anchor, hold spot and site centre (and the
 * carrier's plant cells beside it) is walkable floor, that the bases and sites exist, that the
 * closed gates keep both bases shut, and that each base reaches both sites, and every waypoint
 * in order, once the gates are open. Leaves the loaded map and the gates as it found them.
 */
export function mapProblems(id: string): string[] {
  const d = MAPS[id], out: string[] = [], keepId = MAP_ID, keepClosed = mapState.gatesClosed;
  const inside = (x: number, y: number): boolean => x >= 1 && y >= 1 && x <= d.width - 2 && y <= d.height - 2;
  if (!(d.width > 2 && d.height > 2)) return [`${id}: size ${d.width} x ${d.height}`];
  if (!(d.round_time > 0)) out.push(`${id}: round_time ${d.round_time}`);
  for (const f of d.floor) {
    const [x0, y0, x1, y1] = f.rect;
    if (!inside(x0, y0) || !inside(x1, y1) || x0 > x1 || y0 > y1) out.push(`${id}: floor ${f.rect} leaves the map or is empty (a wall ring stays round the edge)`);
    if (f.zone && !(f.zone in ZONES)) out.push(`${id}: floor ${f.rect} has zone "${f.zone}"`);
    if (f.level !== undefined && f.level !== 0 && f.level !== 1) out.push(`${id}: floor ${f.rect} is on level ${f.level}, only 0 (ground) and 1 (first floor) exist`);
  }
  for (const r of d.ramps ?? []) {
    const [x0, y0, x1, y1] = r.rect;
    if (!inside(x0, y0) || !inside(x1, y1) || x0 > x1 || y0 > y1) out.push(`${id}: ramp ${r.rect} leaves the map or is empty`);
    else if (!['E', 'W', 'N', 'S'].includes(r.dir)) out.push(`${id}: ramp ${r.rect} has direction "${r.dir}", it must be E, W, N or S`);
    else {
      const run = ((r.dir === 'E' || r.dir === 'W') ? x1 - x0 + 1 : y1 - y0 + 1) * CELL, slope = tune.level_height / run;
      if (slope > tune.ramp_max_slope) out.push(`${id}: ramp ${r.rect} is too steep: it climbs ${tune.level_height} m in ${run} m (slope ${slope.toFixed(2)}, the most is ${tune.ramp_max_slope}); make it longer`);
    }
  }
  if (out.length) return out;
  build(d);
  for (const [x, y, lv] of d.crates) if (!inside(x, y) || !d.floor.some(f => (f.level === 1 ? 1 : 0) === (lv === 1 ? 1 : 0) && x >= f.rect[0] && x <= f.rect[2] && y >= f.rect[1] && y <= f.rect[3])) out.push(`${id}: crate ${x},${y}${lv === 1 ? ' on the first floor' : ''} is not on the floor`);
  for (const p of d.props ?? []) if (!['barrel', 'pallet', 'sandbag'].includes(p.kind) || !d.crates.some(c => c[0] === p.cell[0] && c[1] === p.cell[1])) out.push(`${id}: prop ${p.kind} at ${p.cell} is not a known kind on a crate cell`);
  mapState.gatesClosed = false;
  const lvOf = (c: Cell): number => (c && c[2] === 1 ? 1 : 0);
  const need = (c: Cell, what: string): boolean => {
    const ok = !!c && (lvOf(c) === 1 ? c[0] >= 0 && c[1] >= 0 && c[0] < MW && c[1] < MH && grid1[idx(c[0], c[1])] === 1 : walkable(c[0], c[1]) && !rampDir[idx(c[0], c[1])]);
    if (!ok) out.push(`${id}: ${what} ${c}${c && lvOf(c) === 1 ? ' on the first floor' : ''} is not walkable floor`);
    return ok;
  };
  const lvl = (c: Cell): string => (lvOf(c) === 1 ? ' on the first floor' : '');
  const zoneOf = (c: Cell): number => (lvOf(c) === 1 ? zone1 : zone)[idx(c[0], c[1])];
  for (const side of ['att', 'def'] as const) {
    const base = side === 'att' ? 1 : 2;
    if (d.spawns[side].length < 4) out.push(`${id}: ${side} has ${d.spawns[side].length} spawns, 4 needed`);
    for (const c of d.spawns[side]) if (need(c, `${side} spawn`) && zoneOf(c) !== base) out.push(`${id}: ${side} spawn ${c} is outside its base`);
  }
  for (const S of ['A', 'B'] as const) {
    if (!siteCells[S].length) out.push(`${id}: no site ${S}`);
    const s = d.sites[S];
    if (need(s, `site ${S} centre`) && zoneOf(s) !== SITE[S].z) out.push(`${id}: site ${S} centre ${s} is outside the site`);
    need([s[0] - 1, s[1], lvOf(s)], `site ${S} plant cell`); need([s[0] + 1, s[1], lvOf(s)], `site ${S} plant cell`);
    for (const k of ['lane', 'mid'] as const) d.routes[S][k].forEach(c => need(c, `route ${S} ${k} waypoint`));
  }
  d.anchors.conn.forEach(c => need(c, 'conn anchor'));
  if (!d.anchors.conn.length) out.push(`${id}: no conn anchor`);
  need(d.anchors.mid, 'mid anchor'); need(d.attack_hold, 'attack hold');
  if (out.length) { restore(keepId, keepClosed); return out; }
  const walks = (a: Cell, b: Cell): boolean => (a[0] === b[0] && a[1] === b[1] && lvOf(a) === lvOf(b)) ||
    (hasHeights ? bfs3(a[0], a[1], lvOf(a), b[0], b[1], lvOf(b)).length > 0 : bfs(a[0], a[1], b[0], b[1]).length > 0);
  if (hasHeights) {
    // Ramps: each must meet the ground at its low end and a first-floor cell at its top, or it leads nowhere.
    let goodRamp = false;
    for (const r of d.ramps ?? []) {
      const [x0, y0, x1, y1] = r.rect, v = ({ E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] } as Record<string, number[]>)[r.dir];
      if (!v) continue;
      const lowCells: Cell[] = [], highCells: Cell[] = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = idx(x, y);
        if (rampLo[i] === 0) lowCells.push([x - v[0], y - v[1]]);
        if (rampHi[i] === 1) highCells.push([x + v[0], y + v[1]]);
      }
      const lowOk = lowCells.some(c => walkable(c[0], c[1]) && !rampDir[idx(c[0], c[1])]), highOk = highCells.some(c => grid1[idx(c[0], c[1])] === 1);
      if (!lowOk) out.push(`${id}: ramp ${r.rect} leads nowhere at its bottom: the cell before its low end is not ground floor`);
      if (!highOk) out.push(`${id}: ramp ${r.rect} leads nowhere at its top: the cell after its high end is not a first-floor cell`);
      if (lowOk && highOk) goodRamp = true;
    }
    if (d.floor.some(f => f.level === 1) && !goodRamp) out.push(`${id}: the first floor has no way up: no ramp or stair joins the ground to it`);
  }
  for (const side of ['att', 'def'] as const) for (const S of ['A', 'B'] as const) {
    const from = d.spawns[side][0], to = d.sites[S];
    if (!walks(from, to)) out.push(`${id}: no path from the ${side} base to site ${S}${lvl(to)} with the gates open${lvOf(to) === 1 ? ' (that level cannot be reached)' : ''}`);
    mapState.gatesClosed = true;
    if (walks(from, to)) out.push(`${id}: the ${side} base reaches site ${S} with the gates closed`);
    mapState.gatesClosed = false;
  }
  for (const S of ['A', 'B'] as const) for (const k of ['lane', 'mid'] as const) {
    let at = d.spawns.att[0];
    for (const w of [...d.routes[S][k], d.sites[S]]) { if (!walks(at, w)) out.push(`${id}: route ${S} ${k} cannot walk ${at} to ${w}`); at = w; }
  }
  for (const c of [d.attack_hold, ...d.spawns.att]) if (!walks(d.spawns.att[0], c)) out.push(`${id}: the attackers cannot reach ${c}${lvl(c)}${lvOf(c) === 1 ? ': that level cannot be reached' : ''}`);
  for (const c of [d.anchors.mid, ...d.anchors.conn, ...d.spawns.def]) if (!walks(d.spawns.def[0], c)) out.push(`${id}: the defenders cannot reach ${c}${lvl(c)}${lvOf(c) === 1 ? ': that level cannot be reached' : ''}`);
  restore(keepId, keepClosed);
  return out;
}
function restore(id: string, closed: boolean): void {
  mapState.gatesClosed = closed;
  if (id) build(MAPS[id]);
}

/** Mutable map state: the base gates close during buy time. The match keeps its own copy (match.gatesClosed); step() loads it. */
export const mapState = { gatesClosed: true };
export const center = (c: number): number => (c + 0.5) * CELL;
export const cellOf = (v: number): number => Math.floor(v / CELL);
/** True when a body may stand in the cell. */
export function walkable(cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return false;
  const i = idx(cx, cy);
  return grid[i] === 1 && !(mapState.gatesClosed && isGate[i]);
}
/** True when walls or crates stop sight and bullets at (x, z). */
export function solidSight(x: number, z: number): boolean { // walls and crates stop sight and bullets; gates do not
  const cx = cellOf(x), cy = cellOf(z);
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return true;
  return grid[idx(cx, cy)] !== 1;
}
/** The height of the first floor above the ground, in metres (data/config.json level_height). */
export const levelHeight = (): number => tune.level_height;
/** The level (0 ground, 1 first floor) a body whose feet are at height y stands on: the nearer of the two floors. */
export const levelOfY = (y: number): number => (y > levelHeight() / 2 ? 1 : 0);
/** The height in metres of level 0 or 1 (a flat floor). */
export const levelY = (level: number): number => (level === 1 ? levelHeight() : 0);
/** The zone number (1 west base, 2 east base, 3 site A, 4 site B, 0 none) of cell (cx, cy) on the level of height y. */
export function zoneAt(cx: number, cy: number, y: number): number {
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return 0;
  return levelOfY(y) === 1 ? zone1[idx(cx, cy)] : zone[idx(cx, cy)];
}
/** The ramp direction of a cell: 0 none, 1 E (+x), 2 W, 3 S (+z), 4 N: the way UP. */
export const rampAt = (cx: number, cy: number): number => (cx < 0 || cy < 0 || cx >= MW || cy >= MH ? 0 : rampDir[idx(cx, cy)]);
const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
/** The four corners of a body's square (x sign, z sign), flattened: built once, read by supportAt and rampSide every step. */
const CORNER_X = [-1, 1, -1, 1], CORNER_Z = [-1, -1, 1, 1];
/** The height of the ramp surface of cell (cx, cy) at the point (x, z) in metres; 0 when the cell is not a ramp. */
export function rampHeight(cx: number, cy: number, x: number, z: number): number {
  const i = idx(cx, cy), d = rampDir[i];
  if (!d) return 0;
  const fx = Math.min(1, Math.max(0, x / CELL - cx)), fz = Math.min(1, Math.max(0, z / CELL - cy));
  const t = d === 1 ? fx : d === 2 ? 1 - fx : d === 3 ? fz : 1 - fz;
  return (rampLo[i] + (rampHi[i] - rampLo[i]) * t) * levelHeight();
}
/** The highest surface of cell (cx, cy) at (x, z) that is at or below `maxY`, or -Infinity when the cell offers none. A cell offers: the ground floor (height 0; not a crate or a wall, not a closed gate), the ramp surface (instead of the ground), the first floor (height level_height). */
function surfaceIn(cx: number, cy: number, x: number, z: number, maxY: number): number {
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return -Infinity;
  const i = idx(cx, cy);
  if (grid1[i] === 2 && maxY >= levelHeight()) return -Infinity; // a first-floor crate is solid to a body on the first floor
  let best = -Infinity;
  if (rampDir[i]) { const h = rampHeight(cx, cy, x, z); if (h <= maxY) best = h; }
  else if (grid[i] === 1 && !(mapState.gatesClosed && isGate[i])) best = 0;
  if (grid1[i] === 1 && levelHeight() <= maxY) best = Math.max(best, levelHeight());
  return best;
}
/**
 * Where a body of RADIUS whose feet are at height y would stand if it were at (x, z): the height of the floor under it,
 * or null when it cannot be there (a wall, a crate, a closed gate, or a floor more than step_height above its feet: the
 * edge of a higher floor, or a ceiling-high ramp). The floor under the body's centre wins while it is within step_height
 * of the feet, so a ramp is climbed smoothly; at a ledge (the centre has nothing near) the highest corner still holds it
 * up until the whole body is over the drop. Flat maps: always 0 when the cell is walkable.
 */
export function supportAt(x: number, z: number, y: number): number | null {
  const maxY = y + tune.step_height;
  let hi = -Infinity;
  for (let k = 0; k < 4; k++) {
    const px = x + CORNER_X[k] * RADIUS, pz = z + CORNER_Z[k] * RADIUS, h = surfaceIn(cellOf(px), cellOf(pz), px, pz, maxY);
    if (h === -Infinity) return null;
    hi = Math.max(hi, h);
  }
  const c = surfaceIn(cellOf(x), cellOf(z), x, z, maxY);
  return c >= y - tune.step_height && c > -Infinity ? c : hi;
}
/** True when a body of RADIUS at (x, z), feet at height y (default the ground), overlaps a blocked cell. */
export function hitsWall(x: number, z: number, y = 0): boolean {
  if (hasHeights) return supportAt(x, z, y) === null;
  return !walkable(cellOf(x - RADIUS), cellOf(z - RADIUS)) || !walkable(cellOf(x + RADIUS), cellOf(z - RADIUS)) ||
    !walkable(cellOf(x - RADIUS), cellOf(z + RADIUS)) || !walkable(cellOf(x + RADIUS), cellOf(z + RADIUS));
}
/**
 * True when a body of RADIUS centred at (x, z) over a flat cell has a corner over a ramp cell that does not join that
 * cell along the ramp's axis (canStep both ways): it would be climbing, or hanging off, the ramp's side. Ramps are
 * entered and left only by their ends. Always false on a flat map.
 */
export function rampSide(x: number, z: number): boolean {
  if (!hasHeights) return false;
  const cx = cellOf(x), cz = cellOf(z);
  if (rampAt(cx, cz)) return false;
  for (let k = 0; k < 4; k++) {
    const rx = cellOf(x + CORNER_X[k] * RADIUS), rz = cellOf(z + CORNER_Z[k] * RADIUS);
    if ((rx !== cx || rz !== cz) && rampAt(rx, rz) && !canStepXY(cx, cz, 0, rx, rz, 0) && !canStepXY(rx, rz, 0, cx, cz, 1)) return true;
  }
  return false;
}
/**
 * Moves a body, sliding along walls one axis at a time. With heights the body is held at p.st.y (the height of its feet):
 * it follows the ramp, cannot enter a cell whose floor is more than step_height higher, and walking off a first-floor
 * edge sets it down on the lower floor as a fall (its jumpY takes the drop, so the usual gravity and the landing noise run).
 */
export function moveBody(p: Loose, dx: number, dz: number): void {
  if (!hasHeights) {
    if (!hitsWall(p.x + dx, p.z)) p.x += dx;
    if (!hitsWall(p.x, p.z + dz)) p.z += dz;
    return;
  }
  const st = p.st, y = st ? st.y : 0;
  // The ramp-side rule (story 011): a body may not move onto a spot where it would lean on a ramp's side, unless it already does (so it can always step out).
  const from = rampSide(p.x, p.z);
  if (!hitsWall(p.x + dx, p.z, y) && (from || !rampSide(p.x + dx, p.z))) p.x += dx;
  if (!hitsWall(p.x, p.z + dz, y) && (from || !rampSide(p.x, p.z + dz))) p.z += dz;
  if (!st) return;
  const s = supportAt(p.x, p.z, y);
  if (s === null) return;
  if (s < y - tune.step_height) st.jumpY += y - s; // off a ledge: fall (no damage)
  st.y = s;
}
/** True when a point at (x, z, h) in metres (h from the ground floor) lies inside something that stops a shot or sight, given the previous point's height. */
function solidAt(x: number, z: number, h: number, hPrev: number): boolean {
  const cx = cellOf(x), cy = cellOf(z);
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return true;
  const i = idx(cx, cy), g = grid[i], H1 = levelHeight();
  if (g === 0) return true;                                     // walls rise through every level
  if (h <= 0) return true;                                      // under the ground
  if (g === 2 && (grid1[i] !== 1 || h < H1)) return true;       // a ground crate (under a first floor: up to that floor)
  if (grid1[i] === 2 && h >= H1) return true;                   // a first-floor crate
  if (rampDir[i] && h < rampHeight(cx, cy, x, z)) return true;  // the ramp is solid below its surface
  if (grid1[i] === 1 && (hPrev - H1) * (h - H1) <= 0) return true; // the first floor is a slab: a shot cannot cross it
  return false;
}
/** True when nothing solid lies between the two points. With heights, y0 and y1 are the heights (from the ground floor) of the two ends and floors, ceilings, ramps and first-floor crates count; without them the line is the flat one. */
export function losClear(x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 0): boolean {
  const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.5);
  if (hasHeights) {
    for (let i = 1; i < n; i++) if (solidAt(x0 + dx * i / n, z0 + dz * i / n, y0 + (y1 - y0) * i / n, y0 + (y1 - y0) * (i - 1) / n)) return false;
    return true;
  }
  for (let i = 1; i < n; i++) if (solidSight(x0 + dx * i / n, z0 + dz * i / n)) return false;
  return true;
}
/**
 * How far a shot from (x, z) at height h0 (metres from the ground floor), going the horizontal way (hx, hz) (a unit vector) with
 * the slope `tp` (tan of the pitch), travels before it meets a wall, crate, floor or ceiling; `max` when nothing. Only for maps with heights.
 */
export function rayStop(x: number, z: number, h0: number, hx: number, hz: number, tp: number, max = 200): number {
  let prev = h0;
  for (let s = 0.2; s < max; s += 0.2) { const h = h0 + tp * s; if (solidAt(x + hx * s, z + hz * s, h, prev)) return s; prev = h; }
  return max;
}
/** True when a body can walk the straight line between the two points (feet at height y, default the ground; the height follows ramps along the way). */
export function walkClear(x0: number, z0: number, x1: number, z1: number, y = 0): boolean {
  const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.4);
  let cy = y;
  for (let i = 1; i <= n; i++) {
    const px = x0 + dx * i / n, pz = z0 + dz * i / n;
    if (hitsWall(px, pz, cy)) return false;
    if (hasHeights) { const s = supportAt(px, pz, cy); if (s !== null && s >= cy - tune.step_height) cy = s; else return false; } // a drop is not a walk
  }
  return true;
}
/** True when cell (ax, ay) may step to its 4-neighbour (bx, by) going from level la to lb: the rules of the walking graph (ramps only along their axis, up a ramp's top onto the first floor, a one-way drop off a first-floor edge). */
export function canStepXY(ax: number, ay: number, la: number, bx: number, by: number, lb: number): boolean {
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) + Math.abs(dy) !== 1 || bx < 0 || by < 0 || bx >= MW || by >= MH) return false;
  const ia = idx(ax, ay), ib = idx(bx, by), ra = rampDir[ia], rb = rampDir[ib];
  if (la === 0 && lb === 0) {
    if (!walkable(ax, ay) || !walkable(bx, by)) return false;
    if (ra && !((dx === DIRS[ra][0] * 1 && dy === DIRS[ra][1] * 1) || (dx === DIRS[ra][0] * -1 && dy === DIRS[ra][1] * -1))) return false;
    if (rb && !((dx === DIRS[rb][0] * 1 && dy === DIRS[rb][1] * 1) || (dx === DIRS[rb][0] * -1 && dy === DIRS[rb][1] * -1))) return false;
    if (ra && !rb) return (dx === DIRS[ra][0] * -1 && dy === DIRS[ra][1] * -1) && rampLo[ia] === 0;          // down off the low edge onto the ground
    if (!ra && rb) return (dx === DIRS[rb][0] * 1 && dy === DIRS[rb][1] * 1) && rampLo[ib] === 0;           // onto the low edge from the ground
    return true;
  }
  if (la === 0 && lb === 1) return !!ra && (dx === DIRS[ra][0] * 1 && dy === DIRS[ra][1] * 1) && rampHi[ia] === 1 && grid1[ib] === 1 && walkable(ax, ay);
  if (la === 1 && lb === 0) {
    if (grid1[ia] !== 1 || !walkable(bx, by)) return false;
    if (rb) return (dx === DIRS[rb][0] * -1 && dy === DIRS[rb][1] * -1) && rampHi[ib] === 1;                 // down the top of a ramp
    return grid1[ib] === 0;                                                 // a drop off the edge, only into open air (never through the slab or a first-floor crate)
  }
  return grid1[ia] === 1 && grid1[ib] === 1;
}
/** canStepXY for cells given as [cx, cy] (planning code; the per-step paths call canStepXY and allocate nothing). */
export function canStep(a: Cell, la: number, b: Cell, lb: number): boolean { return canStepXY(a[0], a[1], la, b[0], b[1], lb); }
/** The levels cell (cx, cy) can be walked on: 0 (ground or ramp, gates considered), 1 (first floor). */
export function cellLevels(cx: number, cy: number): number[] {
  const out: number[] = [];
  if (walkable(cx, cy)) out.push(0);
  if (cx >= 0 && cy >= 0 && cx < MW && cy < MH && grid1[idx(cx, cy)] === 1) out.push(1);
  return out;
}
/** The height in metres of the floor at the centre of cell (cx, cy) on `level` (a ramp cell: its middle). */
export function floorHeight(cx: number, cy: number, level: number): number {
  if (level === 0 && rampAt(cx, cy)) return rampHeight(cx, cy, center(cx), center(cy));
  return levelY(level);
}
/** 4-way shortest path on the grid from cell (sx, sy) to (tx, ty), start excluded. */
export function bfs(sx: number, sy: number, tx: number, ty: number): number[][] { // 4-way shortest path on the grid, start excluded
  if (sx === tx && sy === ty) return [];
  bfsPrev.fill(-1);
  const s = idx(sx, sy), t = idx(tx, ty), q: number[] = [s];
  bfsPrev[s] = s;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === t) break;
    const cx = c % MW, cy = (c / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      const n = idx(nx, ny);
      if (bfsPrev[n] !== -1) continue;
      bfsPrev[n] = c; q.push(n);
    }
  }
  if (bfsPrev[t] === -1) return [];
  const path: number[][] = [];
  for (let c = t; c !== s; c = bfsPrev[c]) path.push([c % MW, (c / MW) | 0]);
  return path.reverse();
}

/**
 * 4-way shortest path across both levels from (sx, sy) on level sl to (tx, ty) on level tl, start excluded; each step is
 * [cx, cy, level]. Moves follow canStep: ramps join the levels, and dropping off a first-floor edge is a one-way step.
 * Empty when there is none (or the start is the target). A ramp cell counts as level 0. Flat maps: the same cells as bfs().
 */
export function bfs3(sx: number, sy: number, sl: number, tx: number, ty: number, tl: number): number[][] {
  if (sx === tx && sy === ty && sl === tl) return [];
  const n = MW * MH * 2;
  if (bfsSeen.length < n) { bfsSeen = new Uint32Array(n); bfsFrom = new Int32Array(n); bfsQ = new Int32Array(n); bfsStamp = 0; }
  if (++bfsStamp === 0xffffffff) { bfsSeen.fill(0); bfsStamp = 1; }
  const seen = bfsSeen, from = bfsFrom, q = bfsQ, stamp = bfsStamp;
  const s0 = (sy * MW + sx) * 2 + sl, t0 = (ty * MW + tx) * 2 + tl;
  if (sx < 0 || sy < 0 || sx >= MW || sy >= MH) return [];
  seen[s0] = stamp; from[s0] = -1; q[0] = s0;
  let tail = 1;
  for (let h = 0; h < tail; h++) {
    const k = q[h];
    if (k === t0) break;
    const cl = k & 1, c = k >> 1, cx = c % MW, cy = (c - cx) / MW;
    for (let d = 1; d <= 4; d++) for (let nl = 0; nl < 2; nl++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!canStepXY(cx, cy, cl, nx, ny, nl)) continue;
      const nk = (ny * MW + nx) * 2 + nl;
      if (seen[nk] === stamp) continue;
      seen[nk] = stamp; from[nk] = k; q[tail++] = nk;
    }
  }
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || seen[t0] !== stamp) return [];
  const path: number[][] = [];
  for (let k = t0; k !== s0; k = from[k]) { const l = k & 1, c = k >> 1; path.push([c % MW, (c / MW) | 0, l]); }
  return path.reverse();
}
/** bfs3's buffers, reused across calls (a stamp marks the cells seen in the current search). */
let bfsSeen = new Uint32Array(0), bfsFrom = new Int32Array(0), bfsQ = new Int32Array(0), bfsStamp = 0;

// The data-file boundary: every map is checked once, here, and a broken one stops the game
// (and every test) with the list of what is wrong.
{
  const problems = MAP_IDS.flatMap(mapProblems);
  if (problems.length) throw new Error('Broken map data in data/maps/:\n' + problems.join('\n'));
}
loadMap('pequeno'); // the map the checks know; the game loads the session's map before it builds the world
