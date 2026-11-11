// The map: a grid of 3 m cells, its zones, sight lines and paths. No browser in here,
// so the rules that read it run under Vitest in Node.
import type { Loose } from './types';

export const CELL = 3, MW = 36, MH = 24, WALL_H = 4.5, EYE = 1.6, RADIUS = 0.35;
export const grid = new Uint8Array(MW * MH);   // 0 wall, 1 floor, 2 crate
export const zone = new Uint8Array(MW * MH);   // 1 west base, 2 east base, 3 site A, 4 site B
export const isGate = new Uint8Array(MW * MH); // floor cells that close a base during buy time
export const idx = (cx: number, cy: number): number => cy * MW + cx;
function carve(x0: number, y0: number, x1: number, y1: number, z = 0): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { grid[idx(x, y)] = 1; if (z) zone[idx(x, y)] = z; }
}
carve(1, 8, 5, 15, 1);      // west base (attackers spawn here)
carve(30, 8, 34, 15, 2);    // east base (defenders spawn here)
carve(6, 2, 7, 9); carve(6, 2, 21, 4);       // north lane
carve(22, 2, 28, 8, 3);     // site A
carve(29, 5, 31, 7);        // A to east base
carve(6, 11, 29, 12);       // middle lane
carve(19, 5, 20, 10); carve(21, 6, 21, 7);   // mid connector up to A, side door into A
carve(6, 14, 7, 21); carve(6, 19, 21, 21);   // south lane
carve(22, 15, 28, 21, 4);   // site B
carve(29, 16, 31, 18);      // B to east base
carve(19, 13, 20, 18); carve(21, 16, 21, 17); // mid connector down to B, side door into B
export const CRATES: number[][] = [[24, 4], [26, 6], [23, 19], [26, 16], [11, 11], [17, 12], [25, 11], [14, 3], [14, 20], [27, 3], [27, 20]];
for (const [x, y] of CRATES) grid[idx(x, y)] = 2;
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  const i = idx(x, y);
  if (grid[i] !== 1 || zone[i] === 1 || zone[i] === 2) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const j = idx(x + dx, y + dy);
    if (zone[j] === 1 || zone[j] === 2) { isGate[i] = zone[j]; break; }
  }
}
export const SITE: Record<string, { cx: number; cy: number; z: number }> = { A: { cx: 25, cy: 5, z: 3 }, B: { cx: 25, cy: 18, z: 4 } };
export const siteCells: Record<string, number[][]> = { A: [], B: [] };
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  const i = idx(x, y);
  if (grid[i] === 1 && zone[i] === 3) siteCells.A.push([x, y]);
  if (grid[i] === 1 && zone[i] === 4) siteCells.B.push([x, y]);
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
const bfsPrev = new Int32Array(MW * MH);
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
