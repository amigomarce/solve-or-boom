// The 3D world: the renderer and camera, the map's geometry and textures, the figures, the guns (third and first person),
// the effect pools (tracers, sparks, puffs, bullet holes, the explosion) and the roster's models. Moved out of src/main.ts
// (TD-016, docs/tech-debt-register.md). Its load-time code builds meshes from its own helpers only; what it reads from
// main.ts it reads when it is called.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { tune } from './config';
import { type Loose } from './game/types';
import { clock, params } from './hook';
import { CELL, CRATES, CRATE_FILL, CRATE_H, MAP, MAP_ID, MH, MW, SITE, WALL_H, canStepXY, center, grid, grid1, hasHeights, idx, isGate, levelHeight, loadMap, rampAt, rampHeight, zone, zone1 } from './game/map';
import { lerp } from './game/rules';
import { ROSTER } from './game/match';
import { TOUCH, renderRatio } from './touch';
import { H, W, canvas, fit, glCanvas, setRenderer } from './screen';
import { css } from './hud';
import { state } from './main';

// ---- Three.js world -----------------------------------------------------------------
export const CHEAP = params.get('render') === 'cheap'; // a headless shot or check: 3D draws cheap; players never see it
export const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !CHEAP && !TOUCH }); // the phone graphics level: no antialiasing, a lower pixel ratio (touch_pixel_ratio)
renderer.setPixelRatio(CHEAP ? 0.5 : Math.min(renderRatio(), 2));
renderer.autoClear = false;
setRenderer(renderer);
fit();
export const world = new THREE.Scene();
const SKY = 0xa8daf2;
world.background = new THREE.Color(SKY);
world.fog = new THREE.Fog(SKY, 70, 170);
export const camera = new THREE.PerspectiveCamera(tune.view_fov, W / H, 0.05, 400);
world.add(new THREE.HemisphereLight(0xfff4e0, 0x8d7c60, 2.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(30, 60, 18); world.add(sun);
export const lam = (c: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export const SIDE_HEX: Record<string, number> = { att: 0xf08a24, def: 0x1fb3a6, ffa: 0xc04ad8 }; // ffa: Free for All, one colour for everybody (story 019)
export const SIDE_CSS: Record<string, string> = { att: '#f39436', def: '#2cc4b6', ffa: '#d46ae8' };

/** Deterministic noise in 0..1 from three integers: the scenery must look the same on every run and every machine. */
const hash3 = (x: number, y: number, s: number): number => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const rgbCss = (r: number, g: number, b: number): string => `rgb(${r | 0},${g | 0},${b | 0})`;
// Walls (story 010): brick courses with a darker base band and a lighter cap, each brick a little different. Drawn once.
const wallTex = canvasTex(256, 256, (g, w, h) => {
  const capH = h * 0.09, baseH = h * 0.2, rows = 6, bh = (h - capH - baseH) / rows;
  g.fillStyle = '#6a5340'; g.fillRect(0, 0, w, h); // mortar
  for (let r = 0; r < rows; r++) for (let k = -1; k < 5; k++) {
    const bw = w / 4, x = k * bw + (r % 2) * bw / 2, v = hash3(k, r, 3) * 26 - 13;
    g.fillStyle = rgbCss(236 + v, 222 + v, 192 + v); g.fillRect(x + 2, capH + r * bh + 2, bw - 4, bh - 4);
  }
  g.fillStyle = '#9a7f62'; g.fillRect(0, h - baseH, w, baseH); // darker base band
  g.fillStyle = '#7a6148'; g.fillRect(0, h - baseH, w, 6);
  for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(60,45,30,0.25)'; g.fillRect(k * w / 4 + 10, h - baseH + 14, w / 4 - 20, baseH - 28); }
  g.fillStyle = '#fff6e0'; g.fillRect(0, 0, w, capH); // lighter cap
  g.fillStyle = '#6a5340'; g.fillRect(0, capH, w, 4);
  g.strokeStyle = '#4f3f31'; g.lineWidth = 8; g.strokeRect(0, 0, w, h);
});
const crateTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#cf8f48'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 6; y++) { g.fillStyle = rgbCss(207 + hash3(y, 1, 5) * 24 - 12, 143 + hash3(y, 2, 5) * 20 - 10, 72); g.fillRect(0, y * 21, w, 21); }
  g.strokeStyle = '#8a5524'; g.lineWidth = 4;
  for (let y = 21; y < h; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.lineWidth = 12; g.strokeStyle = '#9c6230'; g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.moveTo(w - 10, 10); g.lineTo(10, h - 10); g.stroke();
  g.lineWidth = 14; g.strokeStyle = '#6e421b'; g.strokeRect(0, 0, w, h);
  g.fillStyle = '#3d3a36'; for (const [x, y] of [[0, 0], [w - 24, 0], [0, h - 24], [w - 24, h - 24]]) { g.fillRect(x, y, 24, 24); g.fillStyle = '#9aa0a6'; g.fillRect(x + 9, y + 9, 6, 6); g.fillStyle = '#3d3a36'; }
});
/** A flag's picture (drawn once): a letter on red for a bomb site, white chevrons on the side's colour for a base. */
function flagTex(css: string, letter: string): THREE.CanvasTexture {
  return canvasTex(64, 96, (g, w, h) => {
    g.fillStyle = css; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    if (letter) { g.font = 'bold 70px Verdana, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.fillText(letter, w / 2, h / 2 + 4); }
    else { g.lineWidth = 9; for (const y of [24, 50, 76]) { g.beginPath(); g.moveTo(14, y - 12); g.lineTo(w / 2, y + 4); g.lineTo(w - 14, y - 12); g.stroke(); } }
  });
}
const FLAG_TEX: Record<string, THREE.CanvasTexture> = { A: flagTex('#d2452f', 'A'), B: flagTex('#d2452f', 'B'), att: flagTex(SIDE_CSS.att, ''), def: flagTex(SIDE_CSS.def, '') };
// The sky: a gradient dome with a sun disc, painted once and kept on the camera (never moves, never fogged).
const sky = ((): THREE.Mesh => {
  const sd = new THREE.Vector3().copy(sun.position).normalize(), W2 = 1024, H2 = 512;
  const tex = canvasTex(W2, H2, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, H2 / 2); gr.addColorStop(0, '#4f98de'); gr.addColorStop(0.55, '#86c4f0'); gr.addColorStop(1, '#a8daf2');
    g.fillStyle = gr; g.fillRect(0, 0, W2, H2 / 2); g.fillStyle = '#a8daf2'; g.fillRect(0, H2 / 2, W2, H2 / 2);
    const at = (dx: number, dy: number, dz: number): [number, number, number] => { const th = Math.acos(dy); return [(((Math.atan2(dz, -dx) / (2 * Math.PI)) % 1) + 1) % 1 * W2, th / Math.PI * H2, Math.sin(th)]; };
    const [sx, sy, ss] = at(sd.x, sd.y, sd.z), R = tune.scn_sun_size / 180 * H2; // radius in degrees; the width stretches toward the pole
    for (const [r, a] of [[R * 3, 0.18], [R * 1.8, 0.3], [R, 1]] as const) { g.fillStyle = `rgba(255,248,214,${a})`; g.beginPath(); g.ellipse(sx, sy, r / ss, r, 0, 0, 7); g.fill(); }
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; m.frustumCulled = false; m.matrixAutoUpdate = false;
  m.onBeforeRender = (_r, _s, cam) => { m.matrixWorld.setPosition(cam.position); }; // follows the eye, so the dome is always the same distance away
  world.add(m); return m;
})();
// Blocky clouds (story 010): `scn_clouds` clusters of 3 or 4 white blocks with a flat bottom, high round the arena, joined into one
// mesh that follows the eye like the dome. Drawn first, without depth, so everything in the arena covers them.
{
  const parts: THREE.BufferGeometry[] = [], S = tune.scn_cloud_size, c = new THREE.Color();
  for (let i = 0; i < tune.scn_clouds; i++) {
    const a = hash3(i, 1, 9) * Math.PI * 2, r = 210 + hash3(i, 2, 9) * 50, y0 = 55 + hash3(i, 3, 9) * 45, n = 3 + (i % 2);
    for (let k = 0; k < n; k++) {
      const w = S * (0.8 + hash3(i, 10 + k, 9) * 0.5), h = S * (k === 1 || k === 2 ? 0.55 : 0.35) * (0.8 + hash3(i, 20 + k, 9) * 0.4);
      const g = new THREE.BoxGeometry(w, h, S * 0.7); g.translate((k - (n - 1) / 2) * S * 0.75, y0 + h / 2, 0); // all blocks sit on the same bottom line
      g.rotateY(Math.PI / 2 - a); g.translate(Math.cos(a) * r, 0, Math.sin(a) * r); // the row of blocks faces the arena
      c.setHex(k % 2 ? 0xffffff : 0xeef4fa); const col = new Float32Array(g.getAttribute('position').count * 3); for (let j = 0; j < col.length; j += 3) col.set([c.r, c.g, c.b], j);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
    }
  }
  if (parts.length) {
    const clouds = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, depthTest: false }));
    parts.forEach(g => g.dispose());
    clouds.renderOrder = -9; clouds.frustumCulled = false; clouds.matrixAutoUpdate = false;
    clouds.onBeforeRender = (_r, _s, cam) => { clouds.matrixWorld.setPosition(cam.position); };
    world.add(clouds);
  }
}
const BARREL_COL = [0xc2432f, 0x2f6fb3, 0xd9a82e, 0x4f8a45], BAG_COL = [0xc9b27a, 0xbfa76d, 0xd2bd88, 0xb59f66];
// The map's meshes: built for the loaded map (src/game/map.ts, from data/maps/), thrown away for the next.
let mapGroup: THREE.Group | null = null, floorTex: THREE.CanvasTexture | null = null, slabTex: THREE.CanvasTexture | null = null, builtFor = '';
/** Story 021: true while the world is built for Free for All, with no bases, sites or gates (the map data keeps them; only the drawing leaves them out). */
let worldFfa = false;
/** The zone of cell i as the world is drawn: 0 everywhere in Free for All (no base or site paint, posts, flags or tinted walls). */
const zoneOn = (i: number): number => (worldFfa ? 0 : zone[i]);
const zone1On = (i: number): number => (worldFfa ? 0 : zone1[i]);
export const gates: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
/**
 * Builds the 3D world of the loaded map (floor, walls, crates and props, site and base marks, gates), disposing the previous map's.
 * Story 010 (Brief MVP feature 23): everything is drawn or built once; the props, posts and flags of a map are merged into a
 * few meshes. Props only dress cells that are crates in the grid (data/maps/*.json `props`), so nothing the rules read changes.
 */
/**
 * The first floor (story 012; rules in story 011): drawn only on a map with heights, so the flat maps are untouched.
 * The slab is a concrete box per cell (its underside is the ceiling of the rooms under it) with a painted top in the
 * floor's style; open edges get a fascia and a low rail (drawing only: the rules have no rails, you see and shoot over
 * it); first-floor crates stand in two, like the ground's; ramps are drawn as solid stairs with yellow nosings and
 * stepped side cheeks. Everything goes into the merged buckets of buildWorld: no per-frame cost but the triangles.
 */
type PutFn = (key: string, mat: () => THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry?: number, color?: number) => void;
function drawFirstFloor(put: PutFn, bx: (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => void): void {
  const H1 = levelHeight(), T = tune.scn_slab_thick, R = tune.scn_rail_height, P = 40;
  const up = (x: number, y: number): number => (x < 0 || y < 0 || x >= MW || y >= MH ? 0 : grid1[idx(x, y)]);
  slabTex = canvasTex(MW * P, MH * P, (g) => { // the slab's top: the floor's slabs in a cooler grey, the first-floor site's border and letter
    g.fillStyle = '#77736a'; g.fillRect(0, 0, MW * P, MH * P);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y);
      if (!grid1[i]) continue;
      for (let k = 0; k < 2; k++) {
        const v = hash3(x, y * 2 + k, 3) * 20 - 10;
        g.fillStyle = rgbCss(196 + v, 190 + v, 176 + v); g.fillRect(x * P, y * P + k * P / 2, P, P / 2);
        g.fillStyle = 'rgba(60,55,45,0.3)'; g.fillRect(x * P, y * P + k * P / 2, P, 2); g.fillRect(x * P + ((y * 2 + k) & 1) * P / 2, y * P + k * P / 2, 2, P / 2);
      }
      if (zone1On(i) >= 3) for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { // a dashed red and white border where the site ends
        const nx = x + dx, ny = y + dy;
        if (up(nx, ny) === 1 && zone1[idx(nx, ny)] === zone1[i]) continue;
        const ex = dx > 0 ? (x + 1) * P - 8 : x * P, ey = dy > 0 ? (y + 1) * P - 8 : y * P;
        g.fillStyle = '#d2452f'; g.fillRect(ex, ey, dx === 0 ? P : 8, dy === 0 ? P : 8);
        g.fillStyle = '#ffffff'; for (let t = 0; t < P; t += 16) g.fillRect(dx === 0 ? x * P + t + 8 : ex, dy === 0 ? y * P : ey + t + 8, 8, 8);
      }
    }
    for (const [k, st] of Object.entries(SITE)) {
      if (st.lv !== 1 || worldFfa) continue;
      g.save(); g.translate((st.cx + 0.5) * P, (st.cy + 0.5) * P);
      g.font = `bold ${P * 4.6}px Verdana, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineJoin = 'round'; g.strokeText(k, 0, 6);
      g.fillStyle = '#d2452f'; g.fillText(k, 0, 6); g.restore();
    }
  });
  const tex = slabTex, topMat = (): THREE.Material => new THREE.MeshLambertMaterial({ map: tex });
  const crateMat = (): THREE.Material => new THREE.MeshLambertMaterial({ map: crateTex });
  const crateGeo = new THREE.BoxGeometry(CELL * CRATE_FILL, CRATE_H, CELL * CRATE_FILL);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const g1 = grid1[idx(x, y)];
    if (!g1) continue;
    bx(CELL, T, CELL, center(x), H1 - T / 2 - 0.01, center(y), 0x9a9488); // the slab; its underside is the ceiling below
    const top = new THREE.PlaneGeometry(CELL, CELL); top.rotateX(-Math.PI / 2);
    const uv = top.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i)) / MW, 1 - (y + 1 - uv.getY(i)) / MH);
    put('slabtop', topMat, top, center(x), H1, center(y)); top.dispose(); // put() keeps a clone
    if (g1 === 2) { put('crate1', crateMat, crateGeo, center(x), H1 + CRATE_H / 2, center(y)); put('crate1', crateMat, crateGeo, center(x), H1 + CRATE_H * 1.5, center(y), ((x + y) % 3) * 0.2); } // two crates, the top one turned
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { // an open edge: not more slab, not a wall, not the top of a stair
      const nx = x + dx, ny = y + dy;
      if (up(nx, ny) || nx < 0 || ny < 0 || nx >= MW || ny >= MH || grid[idx(nx, ny)] === 0) continue;
      if (rampAt(nx, ny) && canStepXY(nx, ny, 0, x, y, 1)) continue;
      const ex = center(x) + dx * (CELL / 2 - 0.05), ez = center(y) + dy * (CELL / 2 - 0.05), w = dx === 0 ? CELL : 0.1, d = dx === 0 ? 0.1 : CELL;
      bx(dx === 0 ? CELL : 0.14, T + 0.12, dx === 0 ? 0.14 : CELL, center(x) + dx * CELL / 2, H1 - T / 2, center(y) + dy * CELL / 2, 0x6e6a62); // the fascia
      bx(w + (dx === 0 ? 0 : 0.02), 0.08, d + (dy === 0 ? 0 : 0.02), ex, H1 + R, ez, 0x3a3f47); bx(w, 0.05, d, ex, H1 + R / 2, ez, 0x3a3f47); // top and middle bars
      for (const t of [-0.5, 0, 0.5]) bx(0.08, R, 0.08, ex + (dx === 0 ? t * CELL * 0.98 : 0), H1 + R / 2, ez + (dy === 0 ? t * CELL * 0.98 : 0), 0x3a3f47); // posts
    }
  }
  crateGeo.dispose(); // put() kept clones
  const n = tune.scn_stair_steps_per_cell;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const dir = rampAt(x, y);
    if (!dir) continue;
    const ax = dir === 1 ? 1 : dir === 2 ? -1 : 0, az = dir === 3 ? 1 : dir === 4 ? -1 : 0, along = ax !== 0;
    for (let k = 0; k < n; k++) { // step k: its centre along the axis, its tread at the slope's height there
      const f = (k + 0.5) / n - 0.5, sx = center(x) + (along ? f * CELL : 0), sz = center(y) + (along ? 0 : f * CELL);
      const h = Math.max(0.05, rampHeight(x, y, Math.min(Math.max(sx, x * CELL), (x + 1) * CELL - 1e-4), Math.min(Math.max(sz, y * CELL), (y + 1) * CELL - 1e-4)));
      const sw = along ? CELL / n : CELL, sd = along ? CELL : CELL / n;
      bx(sw, h, sd, sx, h / 2, sz, (k & 1) ? 0xb0aa9c : 0xa49e90);
      const nose = (along ? -ax : 0) * CELL / n / 2, noseZ = (along ? 0 : -az) * CELL / n / 2; // the yellow nosing on the step's low edge
      bx(along ? 0.08 : CELL, 0.03, along ? CELL : 0.08, sx + nose * 0.9, h + 0.015, sz + noseZ * 0.9, 0xe0b830);
      for (const side of [-1, 1]) { // stepped side cheeks where the stair has no stair beside it
        const cx = x + (along ? 0 : side), cy = y + (along ? side : 0);
        if (rampAt(cx, cy)) continue;
        bx(along ? CELL / n : 0.16, h + 0.9, along ? 0.16 : CELL / n, sx + (along ? 0 : side * (CELL / 2 - 0.08)), (h + 0.9) / 2, sz + (along ? side * (CELL / 2 - 0.08) : 0), 0x8e887c);
      }
    }
  }
}
function buildWorld(): void {
  if (mapGroup) {
    mapGroup.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) m.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    world.remove(mapGroup);
    floorTex?.dispose(); slabTex?.dispose(); slabTex = null;
  }
  const group = new THREE.Group();
  const isWall = (x: number, y: number): boolean => x < 0 || y < 0 || x >= MW || y >= MH || grid[idx(x, y)] === 0;
  // The painted floor: concrete slabs laid in bond (no plain grid), speckle and wear, the bases tinted and striped by side, the sites ringed with giant A and B.
  floorTex = canvasTex(MW * 40, MH * 40, (g) => {
    const P = 40, tints: Record<number, number[]> = { 1: [240, 176, 122], 2: [150, 214, 204], 3: [212, 192, 150], 4: [212, 192, 150] };
    g.fillStyle = '#6f6350'; g.fillRect(0, 0, MW * P, MH * P);
    const edge = (x: number, y: number, dx: number, dy: number): boolean => { const nx = x + dx, ny = y + dy; return isWall(nx, ny) || zoneOn(idx(nx, ny)) !== zoneOn(idx(x, y)); };
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y);
      if (!grid[i]) continue;
      const base = tints[zoneOn(i)] ?? [222, 208, 172];
      for (let k = 0; k < 2; k++) { // two rows of slabs per cell, every other row shifted half a slab
        const row = y * 2 + k, sh = (row & 1) * P / 2, y0 = y * P + k * P / 2;
        for (const [a, b, sx] of sh ? [[0, sh, x - 1], [sh, P, x]] : [[0, P, x]]) {
          const v = hash3(sx, row, 1) * 22 - 11;
          g.fillStyle = rgbCss(base[0] + v, base[1] + v, base[2] + v * 1.2); g.fillRect(x * P + a, y0, b - a, P / 2);
          g.fillStyle = 'rgba(70,55,35,0.28)'; g.fillRect(x * P + a, y0, 2, P / 2);
        }
        g.fillStyle = 'rgba(70,55,35,0.28)'; g.fillRect(x * P, y0, P, 2);
      }
      for (let s = 0; s < 14; s++) { g.fillStyle = hash3(x, y, 20 + s) > 0.5 ? 'rgba(70,55,35,0.22)' : 'rgba(255,250,235,0.3)'; g.fillRect(x * P + hash3(x, y, 40 + s) * P, y * P + hash3(x, y, 60 + s) * P, 2, 2); }
      if (hash3(x, y, 7) > 0.93) { g.strokeStyle = 'rgba(70,55,35,0.4)'; g.lineWidth = 1.5; g.beginPath(); const cx = x * P + hash3(x, y, 8) * P, cy = y * P + hash3(x, y, 9) * P; g.moveTo(cx, cy); g.lineTo(cx + 9, cy + 7); g.lineTo(cx + 6, cy + 17); g.stroke(); } // a hairline crack
      const zi = zoneOn(i), side = zi === 1 ? SIDE_CSS.att : zi === 2 ? SIDE_CSS.def : zi >= 3 ? '#d2452f' : '';
      if (side) { // a painted border where the base or site ends: solid for a base, dashed red and white for a site
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (edge(x, y, dx, dy)) {
          const ex = dx === 0 ? x * P : (dx < 0 ? x * P : (x + 1) * P - 8), ey = dy === 0 ? y * P : (dy < 0 ? y * P : (y + 1) * P - 8);
          g.fillStyle = side; g.fillRect(ex, ey, dx === 0 ? P : 8, dy === 0 ? P : 8);
          if (zi >= 3) { g.fillStyle = '#ffffff'; for (let t = 0; t < P; t += 16) g.fillRect(dx === 0 ? x * P + t + 8 : ex, dy === 0 ? y * P : ey + t + 8, dx === 0 ? 8 : 8, dy === 0 ? 8 : 8); }
        }
      }
      if (isGate[i] && !worldFfa) { // the doorway of a base: stripes in the side's colour
        g.fillStyle = isGate[i] === 1 ? SIDE_CSS.att : SIDE_CSS.def; for (let k = 0; k < 5; k++) { g.globalAlpha = 0.75; g.fillRect(x * P + k * 8, y * P, 4, P); g.globalAlpha = 1; }
      }
    }
    let cells = 0; for (let i = 0; i < MW * MH; i++) if (grid[i]) cells++;
    for (let n = 0; n < cells * tune.scn_floor_wear; n++) { // soft worn patches
      const cx = hash3(n, 1, 77) * MW * P, cy = hash3(n, 2, 77) * MH * P, r = 14 + hash3(n, 3, 77) * 30, gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      if (!grid[idx(Math.min(MW - 1, cx / P | 0), Math.min(MH - 1, cy / P | 0))]) continue;
      gr.addColorStop(0, 'rgba(80,62,40,0.22)'); gr.addColorStop(1, 'rgba(80,62,40,0)'); g.fillStyle = gr; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    if (hasHeights) for (let i = 0; i < MW * MH; i++) if (grid1[i]) { g.fillStyle = 'rgba(30,22,14,0.3)'; g.fillRect((i % MW) * P, ((i / MW) | 0) * P, P, P); } // the ground under the first floor, shaded
    for (const [k, s] of Object.entries(SITE)) {
      if (s.lv === 1 || worldFfa) continue; // a first-floor site is painted on the slab (story 012); no letters in Free for All (story 021)
      g.save(); g.translate((s.cx + 0.5) * P, (s.cy + 0.5) * P);
      g.font = `bold ${P * 4.6}px Verdana, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineJoin = 'round'; g.strokeText(k, 0, 6);
      g.fillStyle = '#d2452f'; g.fillText(k, 0, 6); g.restore();
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MW * CELL, MH * CELL), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(MW * CELL / 2, 0, MH * CELL / 2); group.add(floor);
  // Static decoration (props, posts, flags): parts are gathered per material, then joined into one mesh each.
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const put = (key: string, mat: () => THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, color?: number): void => {
    const g = geo.clone(); g.rotateY(ry); g.translate(x, y, z);
    if (color !== undefined) { const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    const b = buckets.get(key); if (b) b.geos.push(g); else buckets.set(key, { mat: mat(), geos: [g] });
  };
  const propMat = (): THREE.Material => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, color: number): void => put('props', propMat, new THREE.BoxGeometry(w, h, d), x, y, z, 0, color);
  const cy = (r: number, h: number, x: number, y: number, z: number, color: number): void => put('props', propMat, new THREE.CylinderGeometry(r, r, h, 10), x, y, z, 0, color);
  const kinds = new Map<number, string>(); for (const p of MAP.props ?? []) kinds.set(idx(p.cell[0], p.cell[1]), p.kind);
  for (const [x, y] of CRATES) {
    const kind = kinds.get(idx(x, y)), cx = center(x), cz = center(y), h = hash3(x, y, 4);
    if (kind === 'barrel') { // four barrels and one on top, with dark bands and pale lids
      for (const [ox, oz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
        const col = BARREL_COL[(hash3(x + ox * 2, y + oz * 2, 5) * 4) | 0];
        cy(0.62, 1.3, cx + ox, 0.65, cz + oz, col); cy(0.65, 0.1, cx + ox, 0.35, cz + oz, 0x2a2d33); cy(0.65, 0.1, cx + ox, 0.95, cz + oz, 0x2a2d33); cy(0.52, 0.05, cx + ox, 1.32, cz + oz, 0xcfd3d8);
      }
      cy(0.62, 1.3, cx, 1.95, cz, BARREL_COL[(h * 4) | 0]); cy(0.65, 0.1, cx, 1.65, cz, 0x2a2d33); cy(0.52, 0.05, cx, 2.62, cz, 0xcfd3d8);
    } else if (kind === 'pallet') { // three pallets stacked, two wrapped cartons on top
      for (let l = 0; l < 3; l++) {
        const y0 = l * 0.3, wood = hash3(x, y, 10 + l) > 0.5 ? 0xb98a50 : 0xa57842;
        for (const z of [-1.1, 0, 1.1]) bx(2.7, 0.12, 0.28, cx, y0 + 0.06, cz + z, 0x7a5430);
        for (let i = 0; i < 7; i++) bx(0.3, 0.06, 2.7, cx - 1.2 + i * 0.4, y0 + 0.15, cz, wood);
      }
      for (const ox of [-0.68, 0.68]) { bx(1.25, 1.2, 2.3, cx + ox, 1.5, cz, 0xcaa066); bx(1.27, 0.12, 2.32, cx + ox, 1.6, cz, 0x6d8aa8); }
    } else if (kind === 'sandbag') { // a wall of sandbags, five courses laid in bond
      for (let r = 0; r < 5; r++) for (let i = 0; i < 4; i++) for (const oz of [-0.68, 0.68]) {
        const ox = -1.05 + i * 0.7 + (r % 2) * 0.17, len = r % 2 && i === 3 ? 0.55 : 0.68;
        bx(len, 0.3, 1.25, cx + ox + (r % 2 ? -0.17 : 0), 0.15 + r * 0.3, cz + oz, BAG_COL[(hash3(i + r * 5, oz > 0 ? 1 : 0, x * 31 + y) * 4) | 0]);
      }
    }
  }
  // Posts and flags at the room corners (a corner where two walls meet): low striped posts at a site and a base; tall flags on the first two.
  const corners = (match: (x: number, y: number) => boolean): number[][] => {
    const out: number[][] = [];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (grid[idx(x, y)] === 1 && match(x, y)) for (const sx of [-1, 1]) for (const sy of [-1, 1])
      if (isWall(x + sx, y) && isWall(x, y + sy)) out.push([center(x) + sx * (CELL / 2 - 0.3), center(y) + sy * (CELL / 2 - 0.3)]);
    return out;
  };
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.6), flagMat = (k: string) => (): THREE.Material => new THREE.MeshBasicMaterial({ map: FLAG_TEX[k], side: THREE.DoubleSide });
  const mark = (key: string, spots: number[][], hex: number): void => {
    spots.forEach(([px, pz], i) => {
      bx(0.3, 0.9, 0.3, px, 0.45, pz, 0xf2f2f2); bx(0.32, 0.25, 0.32, px, 0.75, pz, hex);
      if (i < 2) { // a tall flag: a pole and two crossed pennants, so it reads from any side
        const H = tune.scn_flag_height; bx(0.12, H, 0.12, px, H / 2, pz, 0x2a2d33);
        put('flag' + key, flagMat(key), flagGeo, px + 1.2, H - 0.8, pz); put('flag' + key, flagMat(key), flagGeo, px, H - 0.8, pz + 1.2, Math.PI / 2);
      }
    });
  };
  if (!worldFfa) { // story 021: no site or base posts and flags in Free for All
    mark('A', corners((x, y) => zone[idx(x, y)] === 3), 0xd2452f); mark('B', corners((x, y) => zone[idx(x, y)] === 4), 0xd2452f);
    mark('att', corners((x, y) => zone[idx(x, y)] === 1), SIDE_HEX.att); mark('def', corners((x, y) => zone[idx(x, y)] === 2), SIDE_HEX.def);
  }
  if (hasHeights) drawFirstFloor(put, bx); // story 012: the slab, its trim, rails, crates and the stairs
  for (const b of buckets.values()) { const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat); m.matrixAutoUpdate = false; group.add(m); b.geos.forEach(g => g.dispose()); }
  { // walls touching the floor, and the wooden crates (the rest of the crate cells are props), as instanced boxes
    const wallCells = [], sideNear: number[] = [];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (grid[idx(x, y)]) continue;
      let near = false, side = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && grid[idx(nx, ny)]) { near = true; const z = zoneOn(idx(nx, ny)); if (z === 1 || z === 2) side = z; }
      }
      if (near) { wallCells.push([x, y]); sideNear.push(side); }
    }
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), new THREE.MeshLambertMaterial({ map: wallTex }), wallCells.length);
    const m = new THREE.Matrix4(), col = new THREE.Color(), tint = new THREE.Color();
    wallCells.forEach(([x, y], i) => {
      m.makeTranslation(center(x), WALL_H / 2, center(y)); walls.setMatrixAt(i, m);
      const v = ((x * 7 + y * 13) % 5) * 0.035;
      col.setRGB(1 - v, 0.97 - v, 0.93 - v * 1.4);
      if (sideNear[i]) col.lerp(tint.setHex(sideNear[i] === 1 ? SIDE_HEX.att : SIDE_HEX.def), tune.scn_base_tint); // the walls round a base take its side's colour
      walls.setColorAt(i, col);
    });
    walls.matrixAutoUpdate = false; group.add(walls);
    const wood = CRATES.filter(([x, y, l]) => l !== 1 && !kinds.has(idx(x, y))); // first-floor crates are drawn with the first floor
    const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * CRATE_FILL, CRATE_H, CELL * CRATE_FILL), new THREE.MeshLambertMaterial({ map: crateTex }), wood.length * 2);
    wood.forEach(([x, y], i) => {
      m.makeTranslation(center(x), CRATE_H / 2, center(y)); crates.setMatrixAt(i * 2, m);
      m.makeRotationY(((x + y) % 3) * 0.2); m.setPosition(center(x), CRATE_H * 1.5, center(y)); crates.setMatrixAt(i * 2 + 1, m);
    });
    crates.matrixAutoUpdate = false; group.add(crates);
  }
  gates.length = 0;
  if (!worldFfa) for (let i = 0; i < MW * MH; i++) if (isGate[i]) { // story 021: no gates in Free for All
    const side = isGate[i] === 1 ? 'att' : 'def';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(CELL, 3, CELL),
      new THREE.MeshBasicMaterial({ color: SIDE_HEX[side], transparent: true, opacity: 0.33, depthWrite: false }));
    mesh.position.set(center(i % MW), 1.5, center((i / MW) | 0)); group.add(mesh); gates.push(mesh);
  }
  const fog = world.fog as THREE.Fog; fog.near = MAP.view.fog[0]; fog.far = MAP.view.fog[1];
  world.add(group); mapGroup = group; builtFor = MAP_ID + (worldFfa ? ':ffa' : '');
}
/** Loads the map with this id (data/maps/) and builds its world, unless it is already up; `ffa` (story 021) builds it without bases, sites and gates. */
export function useMap(id: string, ffa = false): void {
  if (id + (ffa ? ':ffa' : '') === builtFor) return;
  loadMap(id); worldFfa = ffa; buildWorld();
}

// ---- Figures: three bot roles, each with its own outline, coloured by side ---------------
function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m;
}
const starTex = canvasTex(64, 64, (g) => {
  g.translate(32, 32); g.fillStyle = '#fff3b0';
  g.beginPath();
  for (let i = 0; i < 16; i++) { const r = i % 2 ? 9 : 30, a = i * Math.PI / 8; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.fill(); g.fillStyle = '#ffffff'; g.fillRect(-5, -5, 10, 10);
});
function makeFlash(size: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const a = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); g.add(a);
  const b = a.clone(); b.rotation.y = Math.PI / 2; g.add(b);
  const c = a.clone(); c.rotation.x = Math.PI / 2; g.add(c);
  g.visible = false; return g;
}
/** Colours of the four guns' accents and tracers: the look, not tuning (sizes and lifetimes are `fx_*` in data/config.json). */
const GUN_FX: Record<string, { accent: number; tracer: number }> = {
  pistol: { accent: 0x2fb3a8, tracer: 0xffe08a }, smg: { accent: 0xf08a2a, tracer: 0xffb84a },
  rifle: { accent: 0x7bb83a, tracer: 0xfff3c0 }, sniper: { accent: 0xd8483c, tracer: 0xffffff },
  gold: { accent: Number(tune.gold_color), tracer: Number(tune.gold_tracer_color) }, // story 018: the Rifle dorado (colours in data/config.json)
};
/** Story 018: the Rifle dorado's materials, gold all over with darker parts (data/config.json gold_color, gold_dark_color). */
const GOLD = { body: lam(Number(tune.gold_color)), dark: lam(Number(tune.gold_dark_color)) };
// ---- The figures (story 009): polished blocks -------------------------------------------
// Boxes and their outlines are shared between all characters; a character owns only its team material (hit tint) and its pose.
const boxGeos: Record<string, THREE.BoxGeometry> = {}, edgeGeos: Record<string, THREE.EdgesGeometry> = {};
const outline = new THREE.LineBasicMaterial({ color: 0x0b0d10 });
/** A block that reuses its geometry (and, with `edge`, its dark outline) from one of the same size; the parent may be a pivot. */
function blk(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, edge = false): THREE.Mesh {
  const key = w + ',' + h + ',' + d, geo = boxGeos[key] ?? (boxGeos[key] = new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m);
  if (edge) m.add(new THREE.LineSegments(edgeGeos[key] ?? (edgeGeos[key] = new THREE.EdgesGeometry(geo)), outline));
  return m;
}
const CM = { // shared colours of the figures (the look, not tuning)
  dark: lam(0x2b3038), skin: lam(0xd9a273), pants: lam(0x3b475a), boot: lam(0x2a2420), metal: lam(0x2a2d33), olive: lam(0x66753a),
  vest: lam(0x4a573a), wood: lam(0x7a5233), cloth: lam(0xc23b2b), visor: lam(0x8fe3ff), white: lam(0xf4f4f4),
  acc: { pistol: lam(GUN_FX.pistol.accent), smg: lam(GUN_FX.smg.accent), rifle: lam(GUN_FX.rifle.accent), sniper: lam(GUN_FX.sniper.accent), gold: GOLD.body } as Record<string, THREE.MeshLambertMaterial>,
};
/** Marks every block (mesh or outline) under `root` as fixed to its parent: its matrix is made once, not every frame. */
function freeze(root: THREE.Object3D): void {
  root.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
}
const mergedGeos: Record<string, THREE.BufferGeometry> = {};
/**
 * Joins the plain blocks (no outline) that hang from the same pivot and share a material into one mesh, so a figure is
 * fewer draw calls. The joined geometry is cached under `key` (the role, or the gun), so figures of one kind share it.
 */
function mergeBlocks(root: THREE.Object3D, key: string): void {
  const pivots: THREE.Object3D[] = [];
  root.traverse(o => { if (!(o instanceof THREE.Mesh) && o.children.length) pivots.push(o); });
  pivots.forEach((pv, i) => {
    const byMat = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of pv.children) if (c instanceof THREE.Mesh && !c.children.length && !Array.isArray(c.material)) { const l = byMat.get(c.material); if (l) l.push(c); else byMat.set(c.material, [c]); }
    let j = 0;
    for (const [mat, list] of byMat) {
      const k = key + '/' + i + '/' + j++;
      if (list.length < 2) continue;
      const geo = mergedGeos[k] ?? (mergedGeos[k] = mergeGeometries(list.map(c => { c.updateMatrix(); return c.geometry.clone().applyMatrix4(c.matrix); })));
      for (const c of list) pv.remove(c);
      pv.add(new THREE.Mesh(geo, mat));
    }
  });
}
// ---- Smooth guns (story 020) --------------------------------------------------------------
// One model per gun, built in code from rounded parts (barrels and scopes from cylinders and a lathe, receivers and grips from
// bevelled extrusions) and shared by the first-person view and the hands of every character. Metal and gold shine through Phong
// specular (the scenes' sun gives the highlight, no environment map is needed); wood is a dull Phong. Look only, no tuning.
const GM = {
  steel: new THREE.MeshPhongMaterial({ color: 0x4a515c, specular: 0xc4ccda, shininess: 55 }),
  wood: new THREE.MeshPhongMaterial({ color: 0x7a5233, specular: 0x3a2818, shininess: 28 }),
  glass: new THREE.MeshPhongMaterial({ color: 0x0e1a24, specular: 0xbcd8ff, shininess: 120 }),
  skin: new THREE.MeshPhongMaterial({ color: 0xd9a273, specular: 0x221a14, shininess: 8 }),
  sleeve: new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0x181818, shininess: 8 }),
  gold: new THREE.MeshPhongMaterial({ color: Number(tune.gold_color), specular: 0xfff1b8, shininess: 120 }), // the Rifle dorado: polished gold
  goldDark: new THREE.MeshPhongMaterial({ color: Number(tune.gold_dark_color), specular: 0xffe9a0, shininess: 100 }),
  acc: {} as Record<string, THREE.MeshPhongMaterial>,
};
for (const k of ['pistol', 'smg', 'rifle', 'sniper']) GM.acc[k] = new THREE.MeshPhongMaterial({ color: GUN_FX[k].accent, specular: 0x777777, shininess: 55 });
/** A box with rounded, bevelled edges: w x h x d, edge radius b. */
function rbox(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  b = Math.min(b, Math.min(w, h) * 0.4, d * 0.4);
  const x = (w - 2 * b) / 2, y = (h - 2 * b) / 2, c = Math.min(x, y) * 0.8, s = new THREE.Shape();
  s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.quadraticCurveTo(x, -y, x, -y + c); s.lineTo(x, y - c); s.quadraticCurveTo(x, y, x - c, y);
  s.lineTo(-x + c, y); s.quadraticCurveTo(-x, y, -x, y - c); s.lineTo(-x, -y + c); s.quadraticCurveTo(-x, -y, -x + c, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3 });
  return g.translate(0, 0, -(d - 2 * b) / 2);
}
/** A side silhouette, points [z, y] in the gun's space, thickened along x with bevelled edges (grips, stocks, magazines). */
function prof(pts: [number, number][], thick: number, b: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y))), { depth: thick - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
  return g.translate(0, 0, -(thick - 2 * b) / 2).rotateY(Math.PI / 2);
}
/** The side silhouette of a curved magazine: from (zTop, yTop) down `len`, bending `bend` in z, `w` deep. */
function banana(zTop: number, yTop: number, len: number, bend: number, w: number): [number, number][] {
  const f: [number, number][] = [], r: [number, number][] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6, z = zTop + bend * t * t, y = yTop - len * t; f.push([z - w / 2, y]); r.push([z + w / 2, y]); }
  return f.concat(r.reverse());
}
/**
 * One gun built from smooth parts, muzzle toward -z. Parts of one material are joined into one mesh, so a gun is a handful
 * of draw calls; the caller builds each gun once and clones the group (geometry and materials are shared). `seg` is the radial
 * segment count of the round parts; `hand` adds the first-person hand and sleeve. `sight` is the height of the front sight's top
 * (the line the aimed view puts on the crosshair), `muzzle` the z of the barrel's end (flash and tracer).
 */
function buildGun(kind: string, seg: number, hand: boolean): { group: THREE.Group; muzzle: number; sight: number } {
  const gold = kind === 'gold', shape = gold ? 'rifle' : kind; // story 018: the Rifle dorado is the rifle's shape in gold, its metal parts the darker gold
  const mt = gold ? GM.goldDark : GM.steel, wd = gold ? GM.gold : GM.wood, ac = gold ? GM.gold : GM.acc[kind];
  const parts: { mat: THREE.Material; geo: THREE.BufferGeometry }[] = [];
  const P = (mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0): void => {
    if (rx) geo.rotateX(rx); if (rz) geo.rotateZ(rz);
    parts.push({ mat, geo: toCreasedNormals(geo.translate(x, y, z), 0.9) });
  };
  const cz = (rf: number, rb: number, len: number, s = seg) => new THREE.CylinderGeometry(rf, rb, len, s).rotateX(-Math.PI / 2); // round bar along z, radius rf at the front (-z)
  const ring = (r: number, tube: number, ry = true) => { const g = new THREE.TorusGeometry(r, tube, 6, Math.max(8, seg), Math.PI).rotateZ(Math.PI); return ry ? g.rotateY(Math.PI / 2) : g; }; // a half ring hanging below (trigger guard)
  let muzzle: number, sight: number;
  if (shape === 'pistol') {
    P(mt, rbox(0.055, 0.06, 0.22, 0.012), 0, 0.02, -0.08); // slide
    P(ac, rbox(0.032, 0.014, 0.17, 0.006), 0, 0.05, -0.08); // accent rib along the slide
    P(mt, rbox(0.012, 0.016, 0.014, 0.003), 0, 0.055, -0.175); P(mt, rbox(0.03, 0.012, 0.014, 0.003), 0, 0.056, 0.02); // front and rear sight
    P(mt, cz(0.014, 0.014, 0.03), 0, 0.02, -0.185); // barrel tip
    P(mt, rbox(0.048, 0.03, 0.17, 0.008), 0, -0.025, -0.045); // frame
    P(mt, ring(0.022, 0.004), 0, -0.04, -0.045); // trigger guard
    P(wd, prof([[0.034, -0.02], [-0.024, -0.02], [-0.02, -0.06], [-0.014, -0.1], [-0.01, -0.132], [0.048, -0.132], [0.047, -0.1], [0.043, -0.06]], 0.044, 0.007), 0, 0, 0); // grip, leaning back
    muzzle = -0.2; sight = 0.063;
  } else if (shape === 'smg') {
    P(mt, rbox(0.08, 0.1, 0.34, 0.018), 0, 0, -0.1); // receiver
    P(ac, rbox(0.084, 0.03, 0.3, 0.012), 0, 0.058, -0.1); // accent top cover, sunk into the receiver
    P(mt, cz(0.024, 0.024, 0.07), 0, 0.01, -0.305); P(mt, cz(0.015, 0.015, 0.12), 0, 0.01, -0.32); // shroud and barrel
    P(mt, cz(0.02, 0.02, 0.016), 0, 0.01, -0.372); // muzzle ring
    P(ac, prof(banana(-0.12, -0.04, 0.21, -0.03, 0.06), 0.04, 0.008), 0, 0, 0); // long curved magazine
    P(mt, prof([[0.01, -0.045], [0.07, -0.045], [0.078, -0.09], [0.088, -0.14], [0.04, -0.14], [0.03, -0.09]], 0.036, 0.007), 0, 0, 0); // grip
    P(mt, ring(0.02, 0.004), 0, -0.05, -0.012); // trigger guard
    P(mt, cz(0.009, 0.009, 0.22), 0, 0.015, 0.165); P(mt, rbox(0.03, 0.075, 0.016, 0.006), 0, 0, 0.275); // wire stock and butt plate
    P(mt, rbox(0.014, 0.034, 0.014, 0.004), 0, 0.098, -0.2); // front sight
    muzzle = -0.38; sight = 0.115;
  } else if (shape === 'rifle') {
    P(mt, rbox(0.07, 0.1, 0.4, 0.016), 0, 0, -0.1); // receiver
    P(ac, cz(0.04, 0.042, 0.24), 0, -0.005, -0.4); // round handguard
    P(mt, cz(0.011, 0.011, 0.27), 0, 0.02, -0.635); P(mt, cz(0.017, 0.015, 0.05), 0, 0.02, -0.745); // barrel and muzzle brake
    P(mt, prof(banana(-0.1, -0.04, 0.17, -0.05, 0.062), 0.042, 0.008), 0, 0, 0); // curved magazine
    P(wd, prof([[0.035, -0.045], [0.09, -0.045], [0.1, -0.1], [0.105, -0.15], [0.065, -0.15], [0.05, -0.1]], 0.04, 0.007), 0, 0, 0); // pistol grip
    P(wd, prof([[0.09, 0.04], [0.22, 0.03], [0.36, 0.035], [0.375, 0], [0.368, -0.1], [0.35, -0.115], [0.3, -0.1], [0.2, -0.06], [0.09, -0.045]], 0.05, 0.01), 0, 0, 0); // stock
    P(mt, rbox(0.012, 0.07, 0.016, 0.003), 0, 0.065, -0.6); P(mt, cz(0.02, 0.02, 0.03), 0, 0.02, -0.6); // front sight post on its base
    P(mt, rbox(0.03, 0.04, 0.04, 0.008), 0, 0.07, 0); // rear sight
    muzzle = -0.77; sight = 0.1;
  } else {
    P(mt, rbox(0.06, 0.08, 0.62, 0.014), 0, 0, -0.1); // receiver
    P(mt, cz(0.015, 0.017, 0.5), 0, 0.015, -0.66); // long barrel
    P(ac, cz(0.026, 0.026, 0.08), 0, 0.015, -0.94); P(mt, cz(0.03, 0.03, 0.012), 0, 0.015, -0.9); // muzzle brake and its collar
    P(wd, prof([[0.18, 0.04], [0.3, 0.045], [0.44, 0.04], [0.455, 0], [0.45, -0.1], [0.42, -0.105], [0.3, -0.06], [0.18, -0.04]], 0.055, 0.01), 0, 0, 0); // stock
    P(wd, prof([[0.01, -0.04], [0.07, -0.04], [0.082, -0.1], [0.088, -0.15], [0.048, -0.15], [0.032, -0.1]], 0.04, 0.007), 0, 0, 0); // grip
    // the scope: a lathe tube with bell ends, accent lens rings and dark glass; the tube's axis is the sight line (y 0.1)
    const tube = new THREE.LatheGeometry([[0.04, -0.17], [0.036, -0.15], [0.029, -0.12], [0.029, -0.02], [0.034, 0], [0.034, 0.02], [0.029, 0.04], [0.029, 0.11], [0.036, 0.15], [0.044, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), seg).rotateX(-Math.PI / 2);
    P(GM.steel, tube, 0, 0.1, -0.15);
    for (const [z, r] of [[-0.31, 0.046], [0.01, 0.042]]) { P(ac, cz(r, r, 0.024), 0, 0.1, z); P(GM.glass, cz(r - 0.008, r - 0.008, 0.004), 0, 0.1, z + (z < 0 ? -0.0125 : 0.0125)); }
    for (const z of [-0.23, -0.07]) P(mt, rbox(0.022, 0.04, 0.03, 0.006), 0, 0.058, z); // scope mounts
    P(mt, new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8).rotateZ(Math.PI / 2), 0.06, 0.015, 0.1); P(mt, new THREE.SphereGeometry(0.013, 8, 6), 0.092, 0.012, 0.1); // bolt handle
    P(mt, new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8).rotateZ(Math.PI / 2), 0, 0, -0.7); // bipod yoke
    for (const sx of [-1, 1]) P(mt, new THREE.CylinderGeometry(0.006, 0.005, 0.16, 8), sx * 0.04, -0.07, -0.7, 0, sx * 0.45); // bipod legs
    muzzle = -0.98; sight = 0.1;
  }
  if (hand) { P(GM.skin, rbox(0.07, 0.07, 0.11, 0.02), 0, -0.07, 0.04); P(GM.sleeve, rbox(0.08, 0.08, 0.16, 0.02), 0.02, -0.1, 0.16); }
  const group = new THREE.Group(), byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) { const l = byMat.get(p.mat); if (l) l.push(p.geo); else byMat.set(p.mat, [p.geo]); }
  for (const [mat, list] of byMat) group.add(new THREE.Mesh(mergeGeometries(list), mat));
  return { group, muzzle, sight };
}
/** Hands-held guns, built once (story 020: the same smooth model as the first-person gun, with fewer radial segments). Muzzle toward -z; `muzzle` is how far. */
const holdGuns: Record<string, { tpl: THREE.Group; muzzle: number }> = {};
for (const kind of ['pistol', 'smg', 'rifle', 'sniper', 'gold']) { const m = buildGun(kind, 10, false); freeze(m.group); holdGuns[kind] = { tpl: m.group, muzzle: m.muzzle }; }
const LEG = { thigh: 0.4, shin: 0.46 }; // leg segment lengths of the figure (the hip height follows the bend)
/**
 * One character built from blocks (Brief MVP feature 22, story 009): a cap and bare brow for attackers or a visored helmet for
 * defenders (both exist, `setSide` shows one); gear by role (rusher: bandana and pouch; rifleman: chest vest and shoulder pads;
 * sniper: wide brim, big pack and ghillie strips); jointed legs and arms; all four hand guns (the held one shows). `team` is the
 * one material of this character that carries the side colour (and the red hit tint). Posed each frame by `poseSoldier`.
 */
export function makeSoldier(role: string) {
  const g = new THREE.Group(), team = lam(0xf08a24), M = CM;
  const body = new THREE.Group(); g.add(body);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [];
  for (const sx of [-0.12, 0.12]) {
    const hip = new THREE.Group(); hip.position.set(sx, LEG.thigh + LEG.shin, 0); body.add(hip);
    blk(hip, 0.17, LEG.thigh, 0.2, M.pants, 0, -LEG.thigh / 2, 0);
    const knee = new THREE.Group(); knee.position.set(0, -LEG.thigh, 0); hip.add(knee);
    blk(knee, 0.15, LEG.shin - 0.1, 0.18, M.pants, 0, -(LEG.shin - 0.1) / 2, 0);
    blk(knee, 0.19, 0.12, 0.3, M.boot, 0, -LEG.shin + 0.06, -0.05);
    legs.push(hip); knees.push(knee);
  }
  const torso = new THREE.Group(); body.add(torso); // pivot at the hips
  const rf = role === 'rifleman', sn = role === 'sniper', ru = role === 'rusher', bw = rf ? 1.2 : 1;
  blk(torso, 0.42 * bw, 0.58, rf ? 0.3 : 0.24, team, 0, 0.29, 0, true);
  blk(torso, 0.46 * bw, 0.08, rf ? 0.34 : 0.28, M.dark, 0, 0.04, 0); blk(torso, 0.1, 0.08, 0.03, M.white, 0, 0.04, -0.15); // belt and buckle
  for (const sx of [-1, 1]) blk(torso, 0.1, 0.12, 0.1, M.olive, sx * 0.25 * bw, 0.1, 0.02); // pouches at the hips
  blk(torso, 0.3, 0.38, 0.12, M.olive, 0, 0.32, 0.18 * (sn ? 1.6 : 1) + 0.0, true); // backpack
  if (sn) { blk(torso, 0.4, 0.2, 0.16, M.olive, 0, 0.22, 0.34); for (let k = 0; k < 6; k++) blk(torso, 0.05, 0.3 + (k * 37 % 5) * 0.05, 0.05, M.olive, -0.2 + k * 0.08, 0.5 - 0.15, 0.1 + (k % 2) * 0.1); } // big pack and ghillie strips
  if (rf) { blk(torso, 0.5, 0.4, 0.34, M.vest, 0, 0.36, 0, true); for (const px of [-0.14, 0, 0.14]) blk(torso, 0.1, 0.13, 0.08, M.olive, px, 0.2, -0.2); for (const sx of [-1, 1]) blk(torso, 0.18, 0.12, 0.3, team, sx * 0.32, 0.56, 0); } // vest, magazines and shoulder pads
  const head = new THREE.Group(); head.position.set(0, 0.74, 0); torso.add(head);
  blk(head, 0.25, 0.27, 0.25, M.skin, 0, 0, 0, true); blk(head, 0.23, 0.04, 0.02, M.dark, 0, 0.03, -0.131); // face and eye band
  for (const sx of [-1, 1]) blk(head, 0.035, 0.035, 0.02, M.white, sx * 0.055, 0.03, -0.134);
  const cap = new THREE.Group(); head.add(cap); // attackers: a cap with a short peak
  blk(cap, 0.28, 0.12, 0.28, team, 0, 0.15, 0, true); blk(cap, 0.26, 0.04, 0.12, team, 0, 0.1, -0.2);
  const helm = new THREE.Group(); head.add(helm); // defenders: a taller helmet with a dark visor band
  blk(helm, 0.3, 0.2, 0.3, team, 0, 0.14, 0, true); blk(helm, 0.3, 0.07, 0.04, M.visor, 0, 0.07, -0.152); blk(helm, 0.32, 0.04, 0.32, M.dark, 0, 0.25, 0);
  if (ru) { blk(head, 0.27, 0.11, 0.27, M.cloth, 0, -0.08, -0.005); blk(head, 0.07, 0.1, 0.06, M.cloth, 0.13, -0.14, 0.12); } // bandana over the nose and mouth, with a knot
  const brim = new THREE.Group(); head.add(brim); // the sniper's wide brim hangs from its own pivot at the head, which poseSoldier keeps level
  if (sn) blk(brim, 0.62, 0.03, 0.62, M.olive, 0, 0.15, 0, true); // wide brim
  const aim = new THREE.Group(); aim.position.set(0, 0.55, 0); torso.add(aim); // pivot at the shoulders: the arms and the gun
  const uppers: THREE.Group[] = [], fores: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const up = new THREE.Group(); up.position.set(sx * 0.27 * bw, 0, 0); aim.add(up);
    blk(up, 0.12, 0.3, 0.12, team, 0, -0.15, 0, true);
    const fo = new THREE.Group(); fo.position.set(0, -0.3, 0); up.add(fo);
    blk(fo, 0.1, 0.3, 0.1, team, 0, -0.15, 0, true); blk(fo, 0.11, 0.1, 0.11, M.skin, 0, -0.33, 0);
    uppers.push(up); fores.push(fo);
  }
  const hold = new THREE.Group(); hold.position.set(0.05, -0.2, -0.3); hold.scale.setScalar(1.2); aim.add(hold);
  const guns: Record<string, THREE.Object3D> = {};
  const flash = makeFlash(0.45); aim.add(flash);
  const own = role === 'rusher' ? 'smg' : role === 'sniper' ? 'sniper' : 'rifle';
  const m = { group: g, legs, knees, body, torso, head, aim, uppers, fores, hold, guns, cap, helm, team, flash, gun: '', ph: 0, amp: 0, lx: 0, lz: 0, cr: 0, pr: 0, dn: 0, wk: 0, ready: false, back: 0, front: 0, brim };
  mergeBlocks(g, role); freeze(g);
  // How far the blocks reach behind (back) and in front (front, head left out: it is raised when prone) of the body line,
  // so a fall on the back or a prone lies on the floor and not under it. The arms and the gun are not counted (held up).
  torso.remove(aim); g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body); m.back = box.max.z;
  torso.remove(head); g.updateMatrixWorld(true); box.setFromObject(body); m.front = -box.min.z;
  torso.add(head, aim);
  setHeld(m, own); setSide(m, 'att');
  return m;
}
type Soldier = ReturnType<typeof makeSoldier>;
/** Shows the hand gun `kind` (and puts the muzzle flash at its muzzle); the same kind again does nothing. */
export function setHeld(m: Soldier, kind: string): void {
  if (m.gun === kind || !holdGuns[kind]) return;
  if (!m.guns[kind]) { m.guns[kind] = holdGuns[kind].tpl.clone(); m.hold.add(m.guns[kind]); } // a gun is built the first time this character holds it
  if (m.gun) m.guns[m.gun].visible = false;
  m.gun = kind; m.guns[kind].visible = true; m.flash.position.set(m.hold.position.x, m.hold.position.y, m.hold.position.z + holdGuns[kind].muzzle * 1.2 - 0.1);
}
/** Shows the attackers' cap or the defenders' helmet. */
export function setSide(m: Soldier, side: string): void { m.cap.visible = side === 'att'; m.helm.visible = side !== 'att'; }
/**
 * Poses one character for a frame from what the client already knows (no new network field). `dist` is how far it moved since
 * the last frame (the walk phase follows distance, so the swing speed follows the speed), `dt` the frame time in s, `clock`
 * seconds for the idle breath, `p` the player (alive, deadT, stance, jump, moving, planting, defusing).
 */
export function poseSoldier(m: Soldier, p: Loose, dist: number, dt: number, clock: number): void {
  const bl = 1 - Math.exp(-tune.chr_blend * dt), st = p.st?.stance;
  const planting = p.alive && (p.plantT > 0 || (state.plantT > 0 && state.bomb.carrier === p)), work = planting || (p.alive && p.defusing);
  const air = p.alive && p.st?.jumpY > 0.02 ? 1 : 0;
  if (dist < 3) m.ph += dist * tune.chr_stride;
  m.amp += ((p.alive && (p.moving || dist > 0.01) ? 1 : 0) * (st === 'prone' ? 0.25 : 1) - m.amp) * bl;
  m.cr += (((p.alive && st === 'crouch') || work ? 1 : 0) - m.cr) * bl;
  m.pr += ((p.alive && st === 'prone' ? 1 : 0) - m.pr) * bl;
  m.wk += ((work ? 1 : 0) - m.wk) * bl;
  const fall = p.alive ? 0 : Math.min(1, p.deadT / tune.chr_death_time); // 0 standing .. 1 on the floor
  m.dn = fall;
  const kneel = Math.max(m.cr, Math.sin(Math.min(1, fall * 2.5) * Math.PI) * 0.9), sw = Math.sin(m.ph) * m.amp * (1 - m.pr);
  const th = (1.0 * kneel + 0.55 * air) , kn = (1.7 * kneel + 0.9 * air); // thigh and knee bend
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1, ph = m.ph + (i === 0 ? 0 : Math.PI);
    m.legs[i].rotation.x = th + s * sw * tune.chr_leg_swing * (1 - kneel);
    m.knees[i].rotation.x = -kn - Math.max(0, -Math.sin(ph - 0.6)) * 0.9 * m.amp * (1 - kneel);
  }
  const hip = LEG.thigh * Math.cos(th) + LEG.shin * Math.cos(th - kn);
  const prone = m.pr, lean = -0.45 * m.wk - 0.06 * m.amp + 0.3 * Math.sin(fall * Math.PI); // + leans back: forward to work on the bomb and a little to walk, back in a fall
  m.torso.position.y = hip + Math.abs(Math.sin(m.ph)) * tune.chr_bob * m.amp * (1 - kneel);
  m.torso.rotation.x = lean + 0.12 * prone; // prone: the chest a little off the floor
  m.head.rotation.x = 1.0 * prone; // prone: the head raised to look ahead
  m.brim.rotation.x = -(m.body.rotation.x + m.torso.rotation.x + m.head.rotation.x); // the brim stays level whatever the head does: a hat on a lying head lies flat above it, not upright like a board
  for (let i = 0; i < 2; i++) { m.legs[i].position.y = hip; m.legs[i].rotation.z = (i === 0 ? -0.12 : 0.12) * prone; } // prone: legs a little apart
  const fe = fall * fall * (3 - 2 * fall); // the fall, eased
  m.body.rotation.x = -prone * Math.PI / 2 + fe * Math.PI / 2; // face down when prone, backward in a fall
  m.body.position.set(0, m.front * Math.sin(prone * Math.PI / 2) + m.back * Math.sin(fe * Math.PI / 2) + (air ? p.st.jumpY : 0), prone * 0.85); // lifted by the blocks that turn toward the floor
  m.aim.rotation.x = prone * (Math.PI / 2 - 0.12) - lean + (fall > 0 ? -0.2 * fall : 0) + Math.sin(clock * 2 + p.id) * 0.015 * (1 - m.amp) + Math.sin(m.ph * 2) * 0.04 * m.amp;
  const hide = m.wk > 0.5 || fall > 0.6; // the gun is put away to plant or defuse, and dropped in a fall
  m.hold.visible = !hide;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1, spread = air * 0.9 + fall * 0.6, arm = tune.chr_arm_swing * sw * s;
    m.uppers[i].rotation.set(0.5 + arm - m.wk * 0.15 + air * 0.7 - fall * 0.4, 0, -s * (0.3 - spread * 0.7), 'XYZ'); // working: both hands down and forward, at the bomb
    m.fores[i].rotation.x = 1.25 - m.wk * 1.15 - fall * 1.0 + (i === 0 ? 0.0 : 0.15);
  }
}
export function makeBomb() {
  const g = new THREE.Group();
  box(0.5, 0.2, 0.32, lam(0x3a3f47), 0, 0.1, 0, g);
  for (const z of [-0.09, 0, 0.09]) cyl(0.045, 0.045, 0.44, 6, lam(0xc94f3c), 0, 0.25, z, g).rotation.z = Math.PI / 2;
  box(0.2, 0.1, 0.02, lam(0x111111), 0, 0.12, -0.17, g);
  const wireMat = lam(0xf0c040);
  for (const x of [-0.12, 0.12]) box(0.03, 0.03, 0.34, wireMat, x, 0.38, 0, g);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x44ff66 });
  const light = box(0.1, 0.1, 0.1, lightMat, 0.18, 0.43, -0.1, g);
  box(0.03, 0.34, 0.03, lam(0x222222), -0.2, 0.45, 0.1, g); // antenna
  box(0.07, 0.07, 0.07, lightMat, -0.2, 0.64, 0.1, g);
  return { group: g, lightMat, light };
}
/** A glowing column over a planted or dropped bomb, seen from across the site. */
function makeBeacon() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 7, 8, 1, true), mat); col.position.y = 3.5; g.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 16), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.visible = false;
  return { group: g, mat, ring };
}

// ---- First-person guns (drawn in their own pass, so they never sink into walls) ----------
export const gunScene = new THREE.Scene();
export const gunCam = new THREE.PerspectiveCamera(60, W / H, 0.01, 10);
gunScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6d5c40, 2.3));
const gunSun = new THREE.DirectionalLight(0xffffff, 1.8); gunSun.position.set(1, 2, 1); gunScene.add(gunSun);
/**
 * One first-person gun (stories 008 and 020): the smooth model of `buildGun` with its hand and sleeve, no outlines. The muzzle
 * is toward -z; `sight` is the height of the front sight's top and the flash sits at the muzzle (sized each frame).
 */
function makeViewGun(kind: string) {
  const { group: g, muzzle, sight } = buildGun(kind, 16, true);
  const flash = makeFlash(1); flash.position.set(0, 0.02, muzzle); g.add(flash);
  g.visible = false; gunScene.add(g);
  return { group: g, flash, sight };
}
export const viewGuns: Record<string, ReturnType<typeof makeViewGun>> = { pistol: makeViewGun('pistol'), smg: makeViewGun('smg'), rifle: makeViewGun('rifle'), sniper: makeViewGun('sniper'), gold: makeViewGun('gold') };

// Tracers, impact bursts and the explosion, from pools made once (story 008). Sizes and lifetimes: `fx_*` in data/config.json.
const tracerGeo = new THREE.BoxGeometry(1, 1, 1); tracerGeo.translate(0, 0, 0.5); // a unit bar from its origin toward +z
const tracerMats: Record<string, THREE.MeshBasicMaterial> = {};
for (const k of Object.keys(GUN_FX)) tracerMats[k] = new THREE.MeshBasicMaterial({ color: GUN_FX[k].tracer });
export const tracers: { m: THREE.Mesh; t: number; life: number; w: number }[] = [];
for (let i = 0; i < 32; i++) { const m = new THREE.Mesh(tracerGeo, tracerMats.pistol); m.visible = false; m.frustumCulled = false; world.add(m); tracers.push({ m, t: 0, life: 1, w: 0 }); }
export let tracerI = 0;
/** A bar of light from the gun (x0..z0) to where the shot lands (x1..z1); its thickness and life depend on the gun `w`. */
export function tracer(w: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const tr = tracers[tracerI++ % tracers.length];
  tr.w = tune['fx_' + w + '_tracer_w']; tr.m.material = tracerMats[w]; tr.m.position.set(x0, y0, z0); tr.m.lookAt(x1, y1, z1);
  tr.m.scale.set(tr.w, tr.w, Math.hypot(x1 - x0, y1 - y0, z1 - z0));
  tr.life = tr.t = tune['fx_' + w + '_tracer_life']; tr.m.visible = true;
}
export const sparks: { m: THREE.Mesh; t: number; life: number; vx: number; vy: number; vz: number; size: number }[] = [];
const sparkMats = [new THREE.MeshBasicMaterial({ color: 0xfff1b8 }), new THREE.MeshBasicMaterial({ color: 0xd8281c }), new THREE.MeshBasicMaterial({ color: 0xff9a2a })]; // wall, player, explosion debris
const sparkGeo = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 96; i++) { const m = new THREE.Mesh(sparkGeo, sparkMats[0]); m.visible = false; world.add(m); sparks.push({ m, t: 0, life: 1, vx: 0, vy: 0, vz: 0, size: 0 }); }
let sparkI = 0, burstN = 0;
/**
 * A burst of `count` small cubes thrown from a point: kind 0 a pale spark (wall, floor, crate), 1 a red burst (a player
 * was hit), 2 orange debris (the bomb). The directions come from a fixed hash, so no random call and no allocation.
 */
export function burst(x: number, y: number, z: number, kind: number, count: number, speed: number, size: number, life: number): void {
  burstN++;
  for (let j = 0; j < count; j++) {
    const s = sparks[sparkI++ % sparks.length], a = Math.sin(burstN * 12.9898 + j * 78.233) * 43758.5453, b = Math.sin(burstN * 4.1414 + j * 37.719) * 12543.7;
    const ang = (a - Math.floor(a)) * Math.PI * 2, up = (b - Math.floor(b)) * 0.8 + 0.2, sp = speed * (0.5 + ((a * 7) % 1 + 1) % 1 * 0.5);
    s.m.material = sparkMats[kind]; s.m.position.set(x, y, z); s.vx = Math.cos(ang) * sp * (1 - up * 0.4); s.vz = Math.sin(ang) * sp * (1 - up * 0.4); s.vy = up * sp;
    s.size = size; s.life = s.t = life; s.m.scale.setScalar(size); s.m.visible = true;
  }
}
// A bright puff where a shot lands (pale on a surface, red on a player) and a dark mark left on the surface, both pooled.
const puffMats = [new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, depthWrite: false })]; // templates: each puff fades its own clones
const puffGeo = new THREE.IcosahedronGeometry(1, 0);
export const puffs: { m: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>; mats: THREE.MeshBasicMaterial[]; t: number; life: number; size: number }[] = [];
for (let i = 0; i < 12; i++) {
  const mats = puffMats.map(pm => pm.clone()), m = new THREE.Mesh(puffGeo, mats[0]);
  m.visible = false; m.renderOrder = 2; world.add(m); puffs.push({ m, mats, t: 0, life: 1, size: 0 });
}
let puffI = 0;
/** The next puff of the pool, taken in turn (the oldest is reused). */
export function nextPuff() { return puffs[puffI++ % puffs.length]; }
const decalGeo = new THREE.PlaneGeometry(1, 1);
export const decals: { m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; t: number }[] = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.visible = false; world.add(m); decals.push({ m, t: 0 });
}
let decalI = 0;
/** The next bullet hole of the pool, taken in turn (the oldest is reused). */
export function nextDecal() { return decals[decalI++ % decals.length]; }
/** Story 016: seconds left of each player's melee swing (by player id), set by a 'melee' event and run down in placeModels. */
export const swing: number[] = ROSTER.map(() => 0);
/** Story 016: the dropped medkits and ammo boxes, pooled (a pickup in match.pickups shows the next free one of its kind). */
export const pickupMeshes: Record<string, THREE.Group[]> = { medkit: [], ammo: [] };
for (let i = 0; i < 16; i++) {
  const kit = new THREE.Group(), box = (g: THREE.Group, w: number, h: number, d: number, c: number, y: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); m.position.y = y; g.add(m);
  };
  box(kit, 0.46, 0.22, 0.34, 0xf2f2ee, 0.11); box(kit, 0.26, 0.012, 0.08, 0xd02020, 0.226); box(kit, 0.08, 0.012, 0.26, 0xd02020, 0.226);
  const ammo = new THREE.Group();
  box(ammo, 0.4, 0.2, 0.26, 0x4c5a2e, 0.1); box(ammo, 0.42, 0.04, 0.28, 0xd8a838, 0.17);
  for (const g of [kit, ammo]) { g.visible = false; world.add(g); }
  pickupMeshes.medkit.push(kit); pickupMeshes.ammo.push(ammo);
}
export const hitTint: Record<number, number> = {}; // player id -> the match time its red hit flash ends (set on the hit, cleared at a round's start)
// The explosion: a white flash ball, a fireball, a flat shockwave ring and a tall column that clears the walls.
const boomMat = (c: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
export const boomFlash = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), boomMat(0xffffff));
export const boomMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), boomMat(0xffa040));
export const boomRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), boomMat(0xffd9a0)); boomRing.rotation.x = -Math.PI / 2;
export const boomColumn = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.5, 1, 12, 1, true), boomMat(0xff7a20)); boomColumn.geometry.translate(0, 0.5, 0);
for (const m of [boomFlash, boomMesh, boomRing, boomColumn]) { m.visible = false; m.frustumCulled = false; world.add(m); }


// ---- The roster's figures ----------------------------------------------------------------
export const models = ROSTER.map(r => { const s = makeSoldier(r.role); world.add(s.group); if (r.human) s.group.visible = false; return s; });
export const bombModel = makeBomb(); bombModel.group.visible = false; bombModel.group.scale.setScalar(1.7); world.add(bombModel.group);
export const beacon = makeBeacon(); world.add(beacon.group);
// The carried bomb rides on the carrier's back, so you can see who has it.
export const backBombs = models.map(m => {
  const bb = makeBomb(); bb.group.scale.setScalar(0.9); bb.group.position.set(0, 0.78, 0.3); bb.group.rotation.set(Math.PI / 2, 0, 0);
  bb.group.visible = false; m.body.add(bb.group); return bb;
});
// In first person the bomb is in your hands while you plant it.
export const viewBomb = makeBomb(); viewBomb.group.visible = false; viewBomb.group.scale.setScalar(0.55); viewBomb.group.position.set(0.02, -0.3, -0.55);
viewBomb.group.rotation.set(0.5, 0.3, 0); gunScene.add(viewBomb.group);
