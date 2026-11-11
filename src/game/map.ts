// The map: a grid of 3 m cells, its zones, sight lines and paths. No browser in here,
// so the rules that read it run under Vitest in Node.
// The maps themselves are data: one file each in data/maps/ (design/game-brief.md, Features:
// "two bomb sites (A and B), two bases, 3 lanes"). loadMap() builds the grid of the chosen one;
// every helper below reads the loaded map. Every map is checked when this module loads, and a
// broken one throws: a map file that is wrong never reaches a player silently.
import type { Loose } from './types';
import pequeno from '../../data/maps/pequeno.json';
import grande from '../../data/maps/grande.json';
import patio from '../../data/maps/patio.json';
import pasillos from '../../data/maps/pasillos.json';

/** A cell on the grid: [column, row]. */
export type Cell = number[];
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
  floor: { rect: number[]; zone?: string; note?: string }[];
  /** Crate cells: cover that stops bodies, sight and bullets. */
  crates: Cell[];
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
export const MAPS: Record<string, MapData> = { pequeno, grande, patio, pasillos };
/** The map ids in the selector's order. */
export const MAP_IDS = Object.keys(MAPS);
const ZONES: Record<string, number> = { att_base: 1, def_base: 2, A: 3, B: 4 };

export const CELL = 3, WALL_H = 4.5, EYE = 1.6, RADIUS = 0.35;
/** The loaded map's id and data. */
export let MAP_ID = '', MAP: MapData;
/** The loaded map's size in cells. */
export let MW = 0, MH = 0;
export let grid = new Uint8Array(0);   // 0 wall, 1 floor, 2 crate
export let zone = new Uint8Array(0);   // 1 west base, 2 east base, 3 site A, 4 site B
export let isGate = new Uint8Array(0); // floor cells that close a base during buy time
/** The loaded map's crate cells. */
export let CRATES: Cell[] = [];
/** The loaded map's site centres and zone numbers. */
export let SITE: Record<string, { cx: number; cy: number; z: number }> = {};
/** The loaded map's floor cells of each site, row by row. */
export let siteCells: Record<string, Cell[]> = { A: [], B: [] };
let bfsPrev = new Int32Array(0);
export const idx = (cx: number, cy: number): number => cy * MW + cx;

/** Builds the grid, zones, gates and sites of a map into the module's state. */
function build(d: MapData): void {
  MW = d.width; MH = d.height;
  grid = new Uint8Array(MW * MH); zone = new Uint8Array(MW * MH); isGate = new Uint8Array(MW * MH);
  bfsPrev = new Int32Array(MW * MH);
  for (const f of d.floor) {
    const [x0, y0, x1, y1] = f.rect, z = f.zone ? ZONES[f.zone] : 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { grid[idx(x, y)] = 1; if (z) zone[idx(x, y)] = z; }
  }
  CRATES = d.crates;
  for (const [x, y] of CRATES) grid[idx(x, y)] = 2;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y);
    if (grid[i] !== 1 || zone[i] === 1 || zone[i] === 2) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = idx(x + dx, y + dy);
      if (zone[j] === 1 || zone[j] === 2) { isGate[i] = zone[j]; break; }
    }
  }
  SITE = { A: { cx: d.sites.A[0], cy: d.sites.A[1], z: 3 }, B: { cx: d.sites.B[0], cy: d.sites.B[1], z: 4 } };
  siteCells = { A: [], B: [] };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y);
    if (grid[i] === 1 && zone[i] === 3) siteCells.A.push([x, y]);
    if (grid[i] === 1 && zone[i] === 4) siteCells.B.push([x, y]);
  }
}

/** Makes the map with this id the one every helper reads. Throws on an unknown id. */
export function loadMap(id: string): void {
  const d = MAPS[id];
  if (!d) throw new Error(`No map "${id}": the maps are ${MAP_IDS.join(', ')}`);
  MAP_ID = id; MAP = d;
  build(d);
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
  }
  if (out.length) return out;
  build(d);
  for (const [x, y] of d.crates) if (!inside(x, y) || !d.floor.some(f => x >= f.rect[0] && x <= f.rect[2] && y >= f.rect[1] && y <= f.rect[3])) out.push(`${id}: crate ${x},${y} is not on the floor`);
  mapState.gatesClosed = false;
  const need = (c: Cell, what: string): boolean => {
    const ok = !!c && walkable(c[0], c[1]);
    if (!ok) out.push(`${id}: ${what} ${c} is not walkable floor`);
    return ok;
  };
  for (const side of ['att', 'def'] as const) {
    const base = side === 'att' ? 1 : 2;
    if (d.spawns[side].length < 4) out.push(`${id}: ${side} has ${d.spawns[side].length} spawns, 4 needed`);
    for (const c of d.spawns[side]) if (need(c, `${side} spawn`) && zone[idx(c[0], c[1])] !== base) out.push(`${id}: ${side} spawn ${c} is outside its base`);
  }
  for (const S of ['A', 'B'] as const) {
    if (!siteCells[S].length) out.push(`${id}: no site ${S}`);
    const s = d.sites[S];
    if (need(s, `site ${S} centre`) && zone[idx(s[0], s[1])] !== SITE[S].z) out.push(`${id}: site ${S} centre ${s} is outside the site`);
    need([s[0] - 1, s[1]], `site ${S} plant cell`); need([s[0] + 1, s[1]], `site ${S} plant cell`);
    for (const k of ['lane', 'mid'] as const) d.routes[S][k].forEach(c => need(c, `route ${S} ${k} waypoint`));
  }
  d.anchors.conn.forEach(c => need(c, 'conn anchor'));
  if (!d.anchors.conn.length) out.push(`${id}: no conn anchor`);
  need(d.anchors.mid, 'mid anchor'); need(d.attack_hold, 'attack hold');
  if (out.length) { restore(keepId, keepClosed); return out; }
  const walks = (a: Cell, b: Cell): boolean => (a[0] === b[0] && a[1] === b[1]) || bfs(a[0], a[1], b[0], b[1]).length > 0;
  for (const side of ['att', 'def'] as const) for (const S of ['A', 'B'] as const) {
    const from = d.spawns[side][0], to = d.sites[S];
    if (!walks(from, to)) out.push(`${id}: no path from the ${side} base to site ${S} with the gates open`);
    mapState.gatesClosed = true;
    if (walks(from, to)) out.push(`${id}: the ${side} base reaches site ${S} with the gates closed`);
    mapState.gatesClosed = false;
  }
  for (const S of ['A', 'B'] as const) for (const k of ['lane', 'mid'] as const) {
    let at = d.spawns.att[0];
    for (const w of [...d.routes[S][k], d.sites[S]]) { if (!walks(at, w)) out.push(`${id}: route ${S} ${k} cannot walk ${at} to ${w}`); at = w; }
  }
  for (const c of [d.attack_hold, ...d.spawns.att]) if (!walks(d.spawns.att[0], c)) out.push(`${id}: the attackers cannot reach ${c}`);
  for (const c of [d.anchors.mid, ...d.anchors.conn, ...d.spawns.def]) if (!walks(d.spawns.def[0], c)) out.push(`${id}: the defenders cannot reach ${c}`);
  restore(keepId, keepClosed);
  return out;
}
function restore(id: string, closed: boolean): void {
  mapState.gatesClosed = closed;
  if (id) build(MAPS[id]);
}

/** Mutable map state: the base gates close during buy time. */
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
/** True when a body of RADIUS at (x, z) overlaps a blocked cell. */
export function hitsWall(x: number, z: number): boolean {
  return !walkable(cellOf(x - RADIUS), cellOf(z - RADIUS)) || !walkable(cellOf(x + RADIUS), cellOf(z - RADIUS)) ||
    !walkable(cellOf(x - RADIUS), cellOf(z + RADIUS)) || !walkable(cellOf(x + RADIUS), cellOf(z + RADIUS));
}
/** Moves a body, sliding along walls one axis at a time. */
export function moveBody(p: Loose, dx: number, dz: number): void {
  if (!hitsWall(p.x + dx, p.z)) p.x += dx;
  if (!hitsWall(p.x, p.z + dz)) p.z += dz;
}
/** True when nothing solid lies between the two points. */
export function losClear(x0: number, z0: number, x1: number, z1: number): boolean {
  const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.5);
  for (let i = 1; i < n; i++) if (solidSight(x0 + dx * i / n, z0 + dz * i / n)) return false;
  return true;
}
/** True when a body can walk the straight line between the two points. */
export function walkClear(x0: number, z0: number, x1: number, z1: number): boolean {
  const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.4);
  for (let i = 1; i <= n; i++) if (hitsWall(x0 + dx * i / n, z0 + dz * i / n)) return false;
  return true;
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

// The data-file boundary: every map is checked once, here, and a broken one stops the game
// (and every test) with the list of what is wrong.
{
  const problems = MAP_IDS.flatMap(mapProblems);
  if (problems.length) throw new Error('Broken map data in data/maps/:\n' + problems.join('\n'));
}
loadMap('pequeno'); // the map the checks know; the game loads the session's map before it builds the world
