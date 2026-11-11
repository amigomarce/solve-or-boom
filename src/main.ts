// Solve or Boom: a first-person 4 v 4 bomb shooter where buying and defusing take a right answer.
// Design record: design/game-brief.md (and design/gdd/question-bank.md for the questions).
// The scenes, the 3D world, the bots and the loop live here; the pure rules, the map, sound,
// input, drawing and the questions are modules beside it.
import * as THREE from 'three';
import { CONFIG, tune } from './config';
import * as QUESTIONS from './questions';
import { parseCSV, decodeCSV, type ParsedQuestion } from './game/csv';
import { LEVELS, type Level } from './game/types';
import type { Loose } from './game/types';
import { params, manual, clock, seedFrom, install } from './hook';
import {
  CELL, MW, MH, WALL_H, EYE, grid, zone, isGate, idx, CRATES, SITE, siteCells, mapState,
  center, cellOf, walkable, solidSight, hitsWall, moveBody, losClear, walkClear, bfs,
  MAP, MAP_ID, MAPS, MAP_IDS, loadMap, type Cell,
} from './game/map';
import { yawTo, angDiff, lerp, levelFor, roundPay, hitChance, armourHit, fmtTime } from './game/rules';
import { startAudio, setMuted, isMuted, SFX } from './audio';
import { down, hit, pressed, clicks, mouse, buttons } from './input';
import { ACTIONS, bind, keyName, setKey, resetKeys } from './keys';
import { W, H, FONT, canvas, glCanvas, ctx, setRenderer, fit, clear, text, rr, wrapText, clip, button } from './screen';

// ---- Built to be checked ----------------------------------------------------------------
const STEP = 1 / 60;            // simulation step in seconds; motion is per second, never per frame
const TITLE = 'Solve or Boom';
const CHEAP = params.get('render') === 'cheap'; // a headless shot or check: 3D draws cheap; players never see it
let seed: number;
/** mulberry32; every gameplay random call reads this, never Math.random. */
function rng(): number {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const events: Loose[] = []; // window.game.events: anything the game wants a run to see
/** The human's stance, jump and eye height (data/config.json: crouch_*, prone_*, jump_velocity, gravity).
 *  Kept off the player and off `state` so a run that never uses them plays exactly as before. */
const me = { stance: 'stand', prone: false, proneT: 0, jumpY: 0, vy: 0, eye: EYE, sprint: false };

// ---- Input listeners ------------------------------------------------------------------
let locked = false, lockedBefore = false;
addEventListener('keydown', e => {
  startAudio();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'KeyU' && scene === 'title') csvInput.click();
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => down.clear());
function toLogical(e: PointerEvent | MouseEvent): { x: number; y: number } {
  const b = canvas.getBoundingClientRect();
  return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height };
}
function requestLock() {
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* no lock here */ }
}
canvas.addEventListener('pointermove', e => { const m = toLogical(e); mouse.x = m.x; mouse.y = m.y; });
canvas.addEventListener('pointerdown', e => {
  startAudio();
  const m = toLogical(e); mouse.x = m.x; mouse.y = m.y;
  if (!locked) {
    const b = buttons.find(b => m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h);
    if (b) { if (b.act === 'upload') csvInput.click(); else clicks.push(b.act); return; }
  }
  if (scene === 'pause') { clicks.push('resume'); requestLock(); return; }
  if (scene === 'play' && state.human && !state.human.alive) { clicks.push('spec'); return; }
  if (scene === 'play' && !locked && !uiOpen()) { requestLock(); return; }
  const code = e.button === 2 ? 'Mouse2' : 'Mouse0';
  down.add(code); hit.add(code);
});
addEventListener('pointerup', e => down.delete(e.button === 2 ? 'Mouse2' : 'Mouse0'));
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) lockedBefore = true;
  else if (lockedBefore && scene === 'play' && !uiOpen() && state.human && state.human.alive) scene = 'pause';
});
addEventListener('mousemove', e => { // the aim answers the hand at once: no smoothing
  if (!locked || scene !== 'play' || !state.human || !state.human.alive || uiOpen()) return;
  const p = state.human, k = 0.0022 * tune.mouse_sens * (p.scoped ? 0.3 : 1);
  p.yaw -= e.movementX * k;
  p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch - e.movementY * k));
});

// ---- Custom questions: CSV upload or drop ----------------------------------------------
const csvInput = document.getElementById('csv') as HTMLInputElement;
function loadCSV(file: File | undefined): void {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    const res = parseCSV(decodeCSV(fr.result as ArrayBuffer));
    session.skipped = res.skipped;
    if (res.questions.length >= 1) {
      session.custom = res.questions; session.customName = file.name; session.subject = QUESTIONS.CUSTOM;
      session.status = `${res.questions.length === 1 ? 'Cargada 1 pregunta' : `Cargadas ${res.questions.length} preguntas`} de ${file.name}`;
    } else session.status = `No hay preguntas válidas en ${file.name}`;
  };
  fr.readAsArrayBuffer(file);
}
csvInput.addEventListener('change', () => { loadCSV(csvInput.files?.[0]); csvInput.value = ''; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); if (scene === 'title') loadCSV(e.dataTransfer?.files[0]); });

/** How loud a sound at (x, z) is where the camera stands. */
function heard(x: number, z: number): number {
  const d = Math.hypot(x - camera.position.x, z - camera.position.z);
  return Math.max(0, 1 - d / 70);
}
/** Where a sound at (x, z) sits for the camera: pan -1 (left) to 1 (right), and its distance. Reads only. */
function heardFrom(x: number, z: number): { pan: number; dist: number } {
  const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz), y = camera.rotation.y;
  return { pan: d < 0.01 ? 0 : (dx * Math.cos(y) - dz * Math.sin(y)) / d, dist: d }; // camera right = (cos y, -sin y)
}

// ---- Three.js world -----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !CHEAP });
renderer.setPixelRatio(CHEAP ? 0.5 : Math.min(devicePixelRatio || 1, 2));
renderer.autoClear = false;
setRenderer(renderer);
fit();
const world = new THREE.Scene();
const SKY = 0xa8daf2;
world.background = new THREE.Color(SKY);
world.fog = new THREE.Fog(SKY, 70, 170);
const camera = new THREE.PerspectiveCamera(72, W / H, 0.05, 400);
world.add(new THREE.HemisphereLight(0xfff4e0, 0x8d7c60, 2.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(30, 60, 18); world.add(sun);
const lam = (c: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const SIDE_HEX: Record<string, number> = { att: 0xf08a24, def: 0x1fb3a6 };
const SIDE_CSS: Record<string, string> = { att: '#f39436', def: '#2cc4b6' };

const wallTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f2e7d2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e4d5ba'; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillStyle = '#5b4a3a'; g.fillRect(0, h * 0.6, w, 5);
  g.strokeStyle = '#4f3f31'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
});
const crateTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#cf8f48'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8a5524'; g.lineWidth = 4;
  for (let y = 21; y < h; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.lineWidth = 12; g.strokeStyle = '#9c6230'; g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.moveTo(w - 10, 10); g.lineTo(10, h - 10); g.stroke();
  g.lineWidth = 14; g.strokeStyle = '#6e421b'; g.strokeRect(0, 0, w, h);
});
// The map's meshes: built for the loaded map (src/game/map.ts, from data/maps/), thrown away for the next.
let mapGroup: THREE.Group | null = null, floorTex: THREE.CanvasTexture | null = null, builtFor = '';
const gates: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
/** Builds the 3D world of the loaded map (floor, walls, crates, gates), disposing the previous map's. */
function buildWorld(): void {
  if (mapGroup) {
    mapGroup.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) m.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    world.remove(mapGroup);
    floorTex?.dispose();
  }
  const group = new THREE.Group();
  // The painted floor: bases tinted by side, the sites with giant A and B.
  floorTex = canvasTex(MW * 32, MH * 32, (g) => {
    const P = 32;
    g.fillStyle = '#7d705c'; g.fillRect(0, 0, MW * P, MH * P);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y);
      if (!grid[i]) continue;
      g.fillStyle = zone[i] === 1 ? '#efb57c' : zone[i] === 2 ? '#93d6cc' : zone[i] >= 3 ? '#cdb68a' : ((x + y) % 2 ? '#dccba4' : '#d6c49c');
      g.fillRect(x * P, y * P, P, P);
      g.strokeStyle = 'rgba(80,60,30,0.18)'; g.lineWidth = 2; g.strokeRect(x * P + 1, y * P + 1, P - 2, P - 2);
      if (isGate[i]) { g.fillStyle = 'rgba(40,40,40,0.35)'; for (let k = 0; k < 4; k++) g.fillRect(x * P + k * 8, y * P, 4, P); }
    }
    for (const [k, s] of Object.entries(SITE)) {
      g.save(); g.translate((s.cx + 0.5) * P, (s.cy + 0.5) * P);
      g.font = `bold ${P * 4.6}px Verdana, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText(k, 0, 6);
      g.fillStyle = '#d2452f'; g.fillText(k, 0, 6); g.restore();
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MW * CELL, MH * CELL), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(MW * CELL / 2, 0, MH * CELL / 2); group.add(floor);
  { // walls touching the floor, and the crates, as instanced boxes
    const wallCells = [];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (grid[idx(x, y)]) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && grid[idx(nx, ny)]) near = true;
      }
      if (near) wallCells.push([x, y]);
    }
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), new THREE.MeshLambertMaterial({ map: wallTex }), wallCells.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    wallCells.forEach(([x, y], i) => {
      m.makeTranslation(center(x), WALL_H / 2, center(y)); walls.setMatrixAt(i, m);
      const v = ((x * 7 + y * 13) % 5) * 0.035;
      col.setRGB(1 - v, 0.97 - v, 0.93 - v * 1.4); walls.setColorAt(i, col);
    });
    group.add(walls);
    const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.92, 1.1, CELL * 0.92), new THREE.MeshLambertMaterial({ map: crateTex }), CRATES.length * 2);
    CRATES.forEach(([x, y], i) => {
      m.makeTranslation(center(x), 0.55, center(y)); crates.setMatrixAt(i * 2, m);
      m.makeRotationY(((x + y) % 3) * 0.2); m.setPosition(center(x), 1.65, center(y)); crates.setMatrixAt(i * 2 + 1, m);
    });
    group.add(crates);
  }
  gates.length = 0;
  for (let i = 0; i < MW * MH; i++) if (isGate[i]) {
    const side = isGate[i] === 1 ? 'att' : 'def';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(CELL, 3, CELL),
      new THREE.MeshBasicMaterial({ color: SIDE_HEX[side], transparent: true, opacity: 0.33, depthWrite: false }));
    mesh.position.set(center(i % MW), 1.5, center((i / MW) | 0)); group.add(mesh); gates.push(mesh);
  }
  const fog = world.fog as THREE.Fog; fog.near = MAP.view.fog[0]; fog.far = MAP.view.fog[1];
  world.add(group); mapGroup = group; builtFor = MAP_ID;
}
/** Loads the map with this id (data/maps/) and builds its world, unless it is already up. */
function useMap(id: string): void {
  if (id === builtFor) return;
  loadMap(id); buildWorld();
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
function makeSoldier(role: string) {
  const g = new THREE.Group();
  const team = lam(0xf08a24), dark = lam(0x2b3038), skin = lam(0xd9a273), pants = lam(0x3b475a);
  const boot = lam(0x2a2420), metal = lam(0x24272c), olive = lam(0x66753a), vest = lam(0x4a573a);
  const legs: THREE.Group[] = [];
  for (const sx of [-0.12, 0.12]) {
    const leg = new THREE.Group(); leg.position.set(sx, 0.86, 0);
    box(0.17, 0.78, 0.2, pants, 0, -0.4, 0, leg); box(0.19, 0.12, 0.3, boot, 0, -0.8, -0.04, leg);
    g.add(leg); legs.push(leg);
  }
  const gun = new THREE.Group(); gun.position.set(0.14, 1.24, -0.18); g.add(gun);
  let muzzleZ = 0;
  const arms = (bulk: number): void => {
    for (const sx of [-1, 1]) {
      const a = box(0.12 * bulk, 0.48, 0.12 * bulk, team, sx * 0.25 * bulk, 1.25, -0.2, g);
      a.rotation.x = -1.25; a.rotation.z = sx * -0.25;
      box(0.11, 0.1, 0.11, skin, sx * 0.13, 1.2, -0.42, g);
    }
  };
  if (role === 'rusher') { // slim, hooded, masked, short SMG
    box(0.42, 0.58, 0.24, team, 0, 1.15, 0, g);
    box(0.3, 0.14, 0.03, dark, 0, 1.0, -0.13, g);
    box(0.25, 0.27, 0.25, skin, 0, 1.58, 0, g);
    box(0.27, 0.11, 0.27, dark, 0, 1.53, 0, g);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.48, 4), team); hood.position.set(0, 1.78, 0.04); hood.rotation.y = Math.PI / 4; g.add(hood);
    box(0.3, 0.32, 0.12, team, 0, 1.6, 0.13, g);
    arms(1);
    box(0.08, 0.13, 0.36, metal, 0, 0, -0.2, gun); box(0.06, 0.2, 0.07, metal, 0, -0.14, -0.16, gun);
    muzzleZ = -0.4;
  } else if (role === 'rifleman') { // broad, helmet, armoured vest, long rifle
    box(0.52, 0.62, 0.3, team, 0, 1.16, 0, g);
    box(0.56, 0.42, 0.36, vest, 0, 1.18, 0, g);
    for (const px of [-0.15, 0, 0.15]) box(0.11, 0.13, 0.08, olive, px, 1.08, -0.21, g);
    for (const sx of [-1, 1]) box(0.18, 0.13, 0.32, team, sx * 0.34, 1.43, 0, g);
    box(0.24, 0.26, 0.24, skin, 0, 1.6, 0, g);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), team);
    helm.position.set(0, 1.69, 0); helm.scale.set(1.05, 0.9, 1.15); g.add(helm);
    box(0.25, 0.06, 0.05, dark, 0, 1.63, -0.13, g);
    arms(1.2);
    box(0.07, 0.11, 0.86, metal, 0, 0, -0.38, gun); box(0.06, 0.18, 0.07, metal, 0, -0.13, -0.3, gun);
    box(0.06, 0.14, 0.2, metal, 0, -0.03, 0.12, gun);
    muzzleZ = -0.82;
  } else { // sniper: wide-brim hat, backpack, ghillie strips, very long scoped rifle
    box(0.44, 0.58, 0.26, team, 0, 1.14, 0, g);
    box(0.36, 0.46, 0.2, olive, 0, 1.2, 0.23, g);
    for (let k = 0; k < 7; k++) {
      const sx = -0.24 + k * 0.08, len = 0.32 + ((k * 37) % 5) * 0.05;
      box(0.05, len, 0.05, olive, sx, 1.42 - len / 2, 0.16 + (k % 2) * 0.12, g);
    }
    box(0.24, 0.26, 0.24, skin, 0, 1.58, 0, g);
    cyl(0.38, 0.38, 0.03, 8, olive, 0, 1.73, 0, g);
    cyl(0.17, 0.2, 0.17, 8, olive, 0, 1.81, 0, g);
    cyl(0.205, 0.205, 0.05, 8, team, 0, 1.76, 0, g);
    arms(1);
    box(0.06, 0.09, 1.25, metal, 0, 0, -0.5, gun);
    const sc = cyl(0.045, 0.045, 0.34, 6, dark, 0, 0.1, -0.25, gun); sc.rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) { const b = box(0.02, 0.32, 0.02, metal, sx * 0.05, -0.14, -0.95, gun); b.rotation.z = sx * 0.4; }
    muzzleZ = -1.14;
  }
  const flash = makeFlash(0.45); flash.position.set(0, 0, muzzleZ - 0.1); gun.add(flash);
  return { group: g, legs, team, flash, muzzleZ };
}
function makeBomb() {
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
const gunScene = new THREE.Scene();
const gunCam = new THREE.PerspectiveCamera(60, W / H, 0.01, 10);
gunScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6d5c40, 2.3));
const gunSun = new THREE.DirectionalLight(0xffffff, 1.8); gunSun.position.set(1, 2, 1); gunScene.add(gunSun);
function makeViewGun(kind: string) {
  const g = new THREE.Group(), metal = lam(0x2a2d33), accent = lam(0x4a505a), skin = lam(0xd9a273), sleeve = lam(0x555555);
  let muzzle = 0;
  if (kind === 'pistol') {
    box(0.05, 0.06, 0.22, metal, 0, 0.02, -0.08, g); box(0.045, 0.13, 0.06, accent, 0, -0.07, 0.0, g).rotation.x = 0.25;
    muzzle = -0.2;
  } else if (kind === 'smg') {
    box(0.07, 0.09, 0.34, metal, 0, 0.0, -0.1, g); box(0.05, 0.16, 0.05, accent, 0, -0.11, -0.12, g);
    box(0.03, 0.03, 0.12, metal, 0, 0.01, -0.32, g); box(0.05, 0.06, 0.14, accent, 0, -0.01, 0.12, g);
    muzzle = -0.38;
  } else if (kind === 'rifle') {
    box(0.07, 0.1, 0.5, metal, 0, 0, -0.14, g); box(0.05, 0.16, 0.06, accent, 0, -0.12, -0.12, g).rotation.x = -0.25;
    box(0.025, 0.025, 0.2, metal, 0, 0.02, -0.48, g); box(0.06, 0.1, 0.2, accent, 0, -0.02, 0.18, g);
    box(0.02, 0.04, 0.05, metal, 0, 0.07, -0.05, g);
    muzzle = -0.58;
  } else {
    box(0.06, 0.08, 0.6, accent, 0, 0, -0.12, g); box(0.025, 0.025, 0.36, metal, 0, 0.02, -0.58, g);
    const sc = cyl(0.03, 0.03, 0.24, 8, metal, 0, 0.08, -0.12, g); sc.rotation.x = Math.PI / 2;
    box(0.06, 0.12, 0.22, accent, 0, -0.04, 0.24, g);
    muzzle = -0.76;
  }
  box(0.07, 0.07, 0.11, skin, 0, -0.07, 0.04, g);
  box(0.08, 0.08, 0.16, sleeve, 0.02, -0.1, 0.16, g);
  const flash = makeFlash(0.18); flash.position.set(0, 0.02, muzzle); g.add(flash);
  g.visible = false; gunScene.add(g);
  return { group: g, flash };
}
const viewGuns: Record<string, ReturnType<typeof makeViewGun>> = { pistol: makeViewGun('pistol'), smg: makeViewGun('smg'), rifle: makeViewGun('rifle'), sniper: makeViewGun('sniper') };

// Tracers, sparks and the explosion, from small pools.
const tracers: { line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; t: number }[] = [];
for (let i = 0; i < 32; i++) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
  line.frustumCulled = false; world.add(line); tracers.push({ line, t: 0 });
}
let tracerI = 0;
function tracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const tr = tracers[tracerI++ % tracers.length], a = tr.line.geometry.attributes.position.array;
  a[0] = x0; a[1] = y0; a[2] = z0; a[3] = x1; a[4] = y1; a[5] = z1;
  tr.line.geometry.attributes.position.needsUpdate = true; tr.t = 0.09;
}
const sparks: { m: THREE.Mesh; t: number }[] = [];
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });
for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), sparkMat); m.visible = false; world.add(m); sparks.push({ m, t: 0 }); }
let sparkI = 0;
function spark(x: number, y: number, z: number): void { const s = sparks[sparkI++ % sparks.length]; s.m.position.set(x, y, z); s.t = 0.25; s.m.visible = true; }
const boomMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8 }));
boomMesh.visible = false; world.add(boomMesh);

// ---- The roster: you plus 3 bot teammates against 4 bots ---------------------------------
const ROSTER = [
  { name: 'You', role: 'rifleman', squad: 0, human: true },
  { name: 'Kira', role: 'rusher', squad: 0 }, { name: 'Tomas', role: 'rifleman', squad: 0 }, { name: 'Ana', role: 'sniper', squad: 0 },
  { name: 'Rex', role: 'rusher', squad: 1 }, { name: 'Mila', role: 'rifleman', squad: 1 }, { name: 'Iker', role: 'rifleman', squad: 1 }, { name: 'Sol', role: 'sniper', squad: 1 },
];
const ROLE_NAME: Record<string, string> = { rusher: 'Asaltante', rifleman: 'Fusilero', sniper: 'Francotirador' };
const models = ROSTER.map(r => { const s = makeSoldier(r.role); world.add(s.group); if (r.human) s.group.visible = false; return s; });
const bombModel = makeBomb(); bombModel.group.visible = false; bombModel.group.scale.setScalar(1.7); world.add(bombModel.group);
const beacon = makeBeacon(); world.add(beacon.group);
// The carried bomb rides on the carrier's back, so you can see who has it.
const backBombs = models.map(m => {
  const bb = makeBomb(); bb.group.scale.setScalar(0.9); bb.group.position.set(0, 0.78, 0.3); bb.group.rotation.set(Math.PI / 2, 0, 0);
  bb.group.visible = false; m.group.add(bb.group); return bb;
});
// In first person the bomb is in your hands while you plant it.
const viewBomb = makeBomb(); viewBomb.group.visible = false; viewBomb.group.scale.setScalar(0.55); viewBomb.group.position.set(0.02, -0.3, -0.55);
viewBomb.group.rotation.set(0.5, 0.3, 0); gunScene.add(viewBomb.group);
const WEAPON: Record<string, { name: string; auto: boolean; range: number; botAcc: number }> = {
  pistol: { name: 'Pistola', auto: false, range: 35, botAcc: 0.8 },
  smg: { name: 'Subfusil', auto: true, range: 30, botAcc: 0.85 },
  rifle: { name: 'Rifle', auto: true, range: 60, botAcc: 1 },
  sniper: { name: 'Francotirador', auto: false, range: 120, botAcc: 1.5 },
};
const SHOP: { id: string; name: string; price: string; desc: string }[] = [
  { id: 'smg', name: 'Subfusil', price: 'price_smg', desc: 'Dispara rápido, mejor de cerca' },
  { id: 'rifle', name: 'Rifle', price: 'price_rifle', desc: 'Fuerte a cualquier distancia' },
  { id: 'sniper', name: 'Francotirador', price: 'price_sniper', desc: 'Mata de un tiro, lento. Clic derecho: mira' },
  { id: 'armor', name: 'Blindaje', price: 'price_armor', desc: 'Absorbe la mitad de cada impacto' },
  { id: 'ammo', name: 'Munición', price: 'price_ammo', desc: 'Rellena tu munición de reserva' },
];

// ---- Session: what the person creating the match picked (kept between matches) ------------
const session = {
  subject: 'matematicas',
  /** The map id (data/maps/): the match is played there and the title flyover shows it. */
  map: String(tune.default_map),
  /** facil | medio | dificil: the level of the whole match (a custom CSV ignores it). */
  level: 'medio' as Level,
  topics: Object.fromEntries(Object.entries(QUESTIONS.SUBJECTS).map(([k, s]) => [k, Object.keys(s.topics)])),
  custom: [] as ParsedQuestion[], customName: '', status: '',
  /** Rows the last CSV upload skipped. */
  skipped: 0,
  /** Questions available for the current subject, topics and level (after the level fallback); null = generated. */
  get available(): number | null {
    const topics = this.subject === QUESTIONS.CUSTOM ? [] : this.topics[this.subject];
    return QUESTIONS.availableCount(this.subject, topics, this.level, this.custom);
  },
};
const SUBJECT_LIST = ['matematicas', 'ciencias', 'geografia', 'lengua', QUESTIONS.CUSTOM];

// ---- State ----------------------------------------------------------------------------
/** The match state: built field by field in reset(); typing still to do. */
interface MatchState { players: Loose[]; feed: Loose[]; hurt: Loose[]; [k: string]: Loose }
let scene: string, state: MatchState;
/** The bot-only AI fields, fresh for a round (never on the human): cover and peeking, the staging wait,
 *  the pack rotation, a heard noise, the corner check and the stuck re-path. */
function botFresh(): Loose {
  return {
    coverT: 0, cover: null, peek: null, peekT: 0, peekOut: false, plan: [], threatX: 0, threatZ: 0, wantCover: false, coverTry: -99,
    after: [], waitT: 0, rotating: false, rotT: 0, noiseX: 0, noiseZ: 0, noiseNew: false, investigating: false,
    cleared: false, looks: [], lookT: 0, strictT: -99,
  };
}
function newPlayer(r: Loose, i: number): Loose {
  return {
    id: i, name: r.human ? 'Tú' : 'Bot ' + r.name, role: r.role, squad: r.squad, human: !!r.human,
    x: 0, z: 0, px: 0, pz: 0, yaw: 0, pitch: 0, recoil: 0, hp: 100, armor: 0, alive: true,
    money: tune.start_money, primary: null, cur: 'pistol', ammo: {}, cool: 0, reloadT: 0, scoped: false,
    kills: 0, deaths: 0, right: 0, wrong: 0, moving: false, spotT: -99,
    target: null, reactT: 0, scanT: 0, path: [], pathI: 0, wps: [], arrived: false, holdYaw: 0, holdT: 0,
    routeKind: '', anchor: '', strafe: 1, strafeT: 0, alertT: 0, alertYaw: 0, lastX: 0, lastZ: 0, lastSeenT: -99,
    defusing: false, thinkT: 0, defuseRight: 0, plantT: 0, deadT: 0, walkPh: 0, flashT: 0, stuckT: 0, rotated: false,
    ...(r.human ? {} : botFresh()),
  };
}
function resetGuns(p: Loose): void {
  p.primary = null; p.cur = 'pistol'; p.armor = 0; p.scoped = false;
  p.ammo = { pistol: { mag: tune.pistol_mag, res: tune.pistol_reserve } };
}
function reset() {
  seed = seedFrom(CONFIG.seed);
  state = {
    t: 0, score: [0, 0], gained: '', round: 0, attSquad: 0, phase: 'buy', phaseT: 0, roundT: 0,
    players: ROSTER.map(newPlayer), human: null, lossStreak: [0, 0],
    bomb: { state: 'carried', carrier: null, x: 0, z: 0, timer: 0, defuser: null, panicT: 0, beepT: 0 },
    attackSite: 'A', alert: null, menu: false, card: null, deck: null, feed: [], msg: '', msgT: 0, banner: null,
    wrongStreak: 0, hurt: [], flashT: 0, hitT: 0, killT: 0, spec: 0, plantT: 0, boomT: 0, gateT: 0, rtrT: 0, bombSeen: false,
  };
  state.human = state.players[0];
  state.players.forEach(resetGuns);
}
const sideOf = (p: Loose): string => (p.squad === state.attSquad ? 'att' : 'def');
const squadName = (s: number): string => (s === 0 ? 'Tu equipo' : 'Rivales');
const uiOpen = () => !!(state && (state.menu || state.card));
const level = (): number => levelFor(state.round, tune.ramp_rounds);
function say(m: string, t = 3.5): void { state.msg = m; state.msgT = t; }
function feed(s: string, mine: boolean): void { state.feed.unshift({ s, t: 6, mine }); state.feed.length = Math.min(state.feed.length, 5); }
/** The loaded map's spawn cells for a side (data/maps/). */
function spawnSpots(side: string): Cell[] {
  return side === 'att' ? MAP.spawns.att : MAP.spawns.def;
}

function startMatch() {
  useMap(session.map);
  reset();
  const topics = session.subject === QUESTIONS.CUSTOM ? [] : session.topics[session.subject];
  state.deck = QUESTIONS.deck(session.subject, topics, session.level, session.custom, rng);
  state.subjectLabel = session.subject === QUESTIONS.CUSTOM ? `${QUESTIONS.CUSTOM_NAME} (${session.customName})`
    : `${QUESTIONS.SUBJECTS[session.subject].name}: ${topics.map(t => QUESTIONS.SUBJECTS[session.subject].topics[t]).join(', ')}`;
  startRound();
  events.push({ type: 'match', subject: session.subject });
}
function startRound() {
  state.round++;
  state.phase = 'buy'; state.phaseT = tune.buy_time; state.roundT = MAP.round_time;
  state.menu = false; closeCard(true); state.alert = null; state.banner = null; state.plantT = 0;
  mapState.gatesClosed = true; state.gateT = 0;
  Object.assign(me, { stance: 'stand', prone: false, proneT: 0, jumpY: 0, vy: 0, eye: EYE, sprint: false });
  const sides: Record<string, number> = { att: 0, def: 0 };
  for (const p of state.players) {
    if (!p.alive) resetGuns(p);
    const side = sideOf(p), spot = spawnSpots(side)[sides[side]++];
    p.alive = true; p.hp = tune.max_hp; p.x = p.px = center(spot[0]); p.z = p.pz = center(spot[1]);
    p.yaw = side === 'att' ? -Math.PI / 2 : Math.PI / 2; p.pitch = 0; p.recoil = 0; p.scoped = false;
    p.target = null; p.path = []; p.wps = []; p.arrived = false; p.defusing = false; p.plantT = 0;
    p.deadT = 0; p.alertT = 0; p.rotated = false; p.guarding = false; p.fetching = false; p.chasing = false; p.reloadT = 0; p.cool = 0; p.lastSeenT = -99;
    if (!p.human && !p.cur) p.cur = 'pistol';
    if (!p.human) Object.assign(p, botFresh());
    models[p.id].team.color.setHex(SIDE_HEX[side]);
    models[p.id].group.rotation.set(0, p.yaw, 0);
  }
  for (const gm of gates) { gm.position.y = 1.5; gm.visible = true; }
  // The bomb: you carry it when you attack; otherwise a bot does.
  const attackers = state.players.filter(p => sideOf(p) === 'att');
  const human = state.human;
  let carrier = sideOf(human) === 'att' ? human : null;
  if (!carrier) { const c = attackers.filter(p => p.role !== 'sniper'); carrier = c[Math.floor(rng() * c.length)]; }
  Object.assign(state.bomb, { state: 'carried', carrier, timer: tune.bomb_time, defuser: null, panicT: 0, beepT: 0 });
  bombModel.group.visible = false;
  for (const p of state.players) if (!p.human) botBuy(p);
  planRound();
  const side = sideOf(human);
  say(side === 'att' ? `Ronda ${state.round}: ATAQUE. Compra y planta la bomba en A o B` :
    `Ronda ${state.round}: DEFENSA. Evita que planten o responde para desactivar`, 5);
  events.push({ type: 'round', round: state.round, side });
}
function botBuy(b: Loose): void {
  const firstOfHalf = state.round === 1 || state.round === tune.halftime_after + 1;
  if (firstOfHalf) return; // pistol rounds for the bots: round 1 is fair
  const ask = () => { // a bot answers like a student: sometimes wrong, then a new question
    for (let k = 0; k < 6; k++) { if (rng() < tune.bot_answer_right) { b.right++; return true; } b.wrong++; }
    return false;
  };
  const want = b.role === 'sniper' ? ['sniper', 'rifle', 'smg'] : b.role === 'rusher' ? ['smg'] : ['rifle', 'smg'];
  if (!b.primary) for (const w of want) {
    if (b.money >= tune['price_' + w] + (w === 'smg' ? 0 : 300) && ask()) {
      b.money -= tune['price_' + w]; b.primary = w; b.cur = w;
      b.ammo[w] = { mag: tune[w + '_mag'], res: tune[w + '_reserve'] }; break;
    }
  }
  if (b.primary) b.cur = b.primary;
  if (b.armor < 50 && b.money >= tune.price_armor && ask()) { b.money -= tune.price_armor; b.armor = 100; }
}

// ---- Bot plans ------------------------------------------------------------------------
function siteSpot(S: string): number[] { const c = siteCells[S]; return c[Math.floor(rng() * c.length)]; }
function routeTo(b: Loose, kind: string): void {
  const S = state.attackSite;
  const copy = (c: Cell): Cell => [c[0], c[1]];
  const r = S === 'A' ? MAP.routes.A : MAP.routes.B, lane = r.lane.map(copy), mid = r.mid.map(copy);
  b.routeKind = kind; b.arrived = false; b.path = []; b.after = []; b.coverT = 0; b.plan = [];
  if (kind === 'lane') b.wps = [...lane, siteSpot(S)];
  else if (kind === 'mid') b.wps = [...mid, siteSpot(S)];
  else if (kind === 'hold') { b.wps = [[MAP.attack_hold[0], MAP.attack_hold[1]]]; b.holdT = tune.sniper_hold_time; b.holdYaw = -Math.PI / 2; }
  else b.wps = [siteSpot(S)];
  if (kind !== 'hold') b.holdYaw = -Math.PI / 2;
  if (state.bomb.carrier === b) b.wps[b.wps.length - 1] = [SITE[S].cx + (rng() < 0.5 ? -1 : 1), SITE[S].cy];
}
function anchorTo(b: Loose, a: string): void {
  b.anchor = a; b.arrived = false; b.path = []; b.holdYaw = Math.PI / 2;
  if (a === 'mid') b.wps = [[MAP.anchors.mid[0], MAP.anchors.mid[1]]];
  else if (a === 'conn') { const conn = MAP.anchors.conn[Math.floor(rng() * MAP.anchors.conn.length)]; b.wps = [[conn[0], conn[1]]]; }
  else b.wps = [siteSpot(a)];
}
/** A copy of the list in an order drawn with the seeded rng (Fisher-Yates). */
function shuffled<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
/** Each round's bot plans, drawn with the seeded rng. Attackers: the sniper holds first; the others split into
 *  two groups, lane and mid, and each stops at its route's last waypoint before the site (its staging point,
 *  the site spot kept in `after`) until the group is there. Defenders: the sniper holds mid; the others draw
 *  the anchors A, B and the connector (a site anchor is a random cell of the site). */
function planRound() {
  state.attackSite = rng() < 0.5 ? 'A' : 'B';
  const bots = state.players.filter(p => !p.human);
  const first = rng() < 0.5 ? 'lane' : 'mid', second = first === 'lane' ? 'mid' : 'lane';
  shuffled(bots.filter(b => sideOf(b) === 'att' && b.role !== 'sniper')).forEach((b, i) => {
    routeTo(b, i % 2 === 0 ? first : second);
    b.after = [b.wps.pop()];
  });
  const anchors = shuffled(['A', 'B', 'conn']);
  bots.filter(b => sideOf(b) === 'def' && b.role !== 'sniper').forEach((b, i) => anchorTo(b, anchors[i % anchors.length]));
  for (const b of bots) {
    if (b.role !== 'sniper') continue;
    if (sideOf(b) === 'att') routeTo(b, 'hold'); else anchorTo(b, 'mid');
  }
}

// ---- Shooting and damage ----------------------------------------------------------------
function applyDamage(t: Loose, dmg: number, from: Loose): void {
  if (!t.alive) return;
  { const r = armourHit(dmg, t.armor, tune.armor_absorb); t.armor = r.armor; dmg = r.dmg; }
  t.hp -= dmg;
  if (t.human) {
    state.flashT = 0.35; SFX.hurt();
    state.hurt.push({ yaw: yawTo(from.x - t.x, from.z - t.z), t: 1.0 });
    if (state.card && state.card.kind === 'defuse') { /* you keep answering: the clock does not stop */ }
  } else {
    t.alertT = 1.5; t.alertYaw = yawTo(from.x - t.x, from.z - t.z); if (t.defusing) t.defusing = false;
    t.wantCover = true; t.threatX = from.x; t.threatZ = from.z;
  }
  if (t.hp <= 0) kill(t, from);
}
function kill(t: Loose, from: Loose): void {
  t.alive = false; t.hp = 0; t.deaths++; t.deadT = 0; t.defusing = false;
  if (from && from !== t) { from.kills++; from.money = Math.min(tune.max_money, from.money + tune.kill_money); }
  feed(`${from ? from.name : 'La bomba'} ${from && from.human ? 'eliminaste a' : 'eliminó a'} ${t.human ? 'ti' : t.name}${from && from !== t ? ' (' + WEAPON[from.cur].name + ')' : ''}`,
    (from && from.human) || t.human);
  if (from && from.human && from !== t) { state.killT = 0.4; SFX.kill(); }
  if (state.bomb.state === 'carried' && state.bomb.carrier === t) {
    state.bomb.state = 'dropped'; state.bomb.x = t.x; state.bomb.z = t.z; state.bomb.carrier = null;
    if (sideOf(state.human) === 'att') say(t.human ? '¡Soltaste la bomba!' : '¡La bomba quedó en el suelo!');
  }
  if (state.bomb.defuser === t) state.bomb.defuser = null;
  if (t.human) { state.menu = false; closeCard(true); state.spec = 0; t.scoped = false; nextSpec(); }
  events.push({ type: 'kill', who: t.name, by: from ? from.name : '' });
}
function nextSpec() {
  const pool = state.players.filter(p => p.alive && p.squad === state.human.squad && !p.human);
  const any = pool.length ? pool : state.players.filter(p => p.alive);
  if (!any.length) return;
  state.spec = (state.spec + 1) % any.length; state.specP = any[state.spec];
}
function humanShoot(p: Loose): void {
  const w = p.cur, a = p.ammo[w];
  if (p.reloadT > 0 || p.cool > 0) return;
  if (a.mag <= 0) { SFX.empty(); p.cool = 0.25; if (a.res > 0) startReload(p); return; }
  a.mag--; p.cool = tune[w + '_rate'];
  if (a.mag > 0 && a.mag <= Math.ceil(tune[w + '_mag'] * 0.2)) SFX.lowAmmo();
  const spread = humanSpread(p), eye = me.eye + me.jumpY;
  const yaw = p.yaw + (rng() - 0.5) * 2 * spread, pitch = p.pitch + p.recoil + (rng() - 0.5) * 2 * spread;
  p.recoil += w === 'sniper' ? 0.06 : w === 'rifle' ? 0.022 : w === 'smg' ? 0.014 : 0.03;
  if (w === 'sniper') p.scoped = false;
  const hx = -Math.sin(yaw), hz = -Math.cos(yaw), cp = Math.cos(pitch), tp = Math.tan(pitch);
  // walls and crates along the flat ray, or the floor when aimed down
  let wallT = 200;
  for (let s = 0.2; s < 200; s += 0.2) if (solidSight(p.x + hx * s, p.z + hz * s)) { wallT = s; break; }
  if (pitch < -0.01) wallT = Math.min(wallT, eye / -tp);
  let best = null, bestT = wallT, head = false;
  for (const e of state.players) {
    if (!e.alive || e.squad === p.squad) continue;
    const ox = e.x - p.x, oz = e.z - p.z, along = ox * hx + oz * hz;
    if (along <= 0) continue;
    const perp2 = ox * ox + oz * oz - along * along, r = 0.42;
    if (perp2 > r * r) continue;
    const t = along - Math.sqrt(r * r - perp2);
    const y = eye + tp * t;
    if (y < 0 || y > 1.88 || t >= bestT) continue;
    best = e; bestT = t; head = y > 1.46;
  }
  const ex = p.x + hx * bestT, ez = p.z + hz * bestT, ey = eye + tp * bestT;
  const gx = p.x + hx * 0.6 - hz * 0.18, gz = p.z + hz * 0.6 + hx * 0.18;
  tracer(gx, eye - 0.18, gz, ex, ey, ez);
  SFX.shot(w);
  viewGuns[w].flash.visible = true; p.flashT = 0.05;
  makeNoise(p.x, p.z, tune.bot_hear_shot, p.squad);
  if (best) {
    state.hitT = 0.15; SFX.hit();
    applyDamage(best, tune[w + '_dmg'] * (head ? tune.headshot_mult : 1), p);
  } else spark(ex, ey, ez);
  void cp;
}
/** The human's shot spread now, in radians: the gun, moving, the scope, then the stance and the air multipliers. */
function humanSpread(p: Loose): number {
  const s = p.cur === 'sniper' && p.scoped ? 0.002 : tune[p.cur + '_spread'] + (p.moving ? tune.move_spread : 0);
  const stance = me.stance === 'prone' ? tune.prone_spread_mult : me.stance === 'crouch' ? tune.crouch_spread_mult : 1;
  return s * stance * (me.jumpY > 0 || me.vy !== 0 ? tune.air_spread_mult : 1);
}
function startReload(p: Loose): void {
  const a = p.ammo[p.cur];
  if (p.reloadT > 0 || a.res <= 0 || a.mag >= tune[p.cur + '_mag']) return;
  p.reloadT = tune.reload_time; p.scoped = false; if (p.human) SFX.reload(p.cur);
}
function finishReload(p: Loose): void {
  const a = p.ammo[p.cur], need = tune[p.cur + '_mag'] - a.mag;
  if (p.human) { const n = Math.min(need, a.res); a.mag += n; a.res -= n; } else a.mag = tune[p.cur + '_mag'];
}
/** A noise at (x, z) made by a body of `squad`: every living enemy bot within r metres hears it (walls do not stop
 *  sound). A defender who hears it near a site raises the site alert; a bot not already fighting turns toward it
 *  and remembers where it was, to go and look when it has nothing better to do. With sight, the only way a bot
 *  learns where an enemy is. */
function makeNoise(x: number, z: number, r: number, squad: number): void {
  for (const b of state.players) {
    if (b.human || !b.alive || b.squad === squad || Math.hypot(b.x - x, b.z - z) >= r) continue;
    siteAlert(b, x, z);
    if (b.target) continue;
    b.alertT = 1.2; b.alertYaw = yawTo(x - b.x, z - b.z); b.noiseX = x; b.noiseZ = z; b.noiseNew = true;
  }
}
/** A defender bot that saw or heard an enemy at (x, z) within bot_site_alert metres of a site calls that site:
 *  the squad's other defenders (not the sniper) rotate there together. */
function siteAlert(b: Loose, x: number, z: number): void {
  if (sideOf(b) !== 'def') return;
  const toA = Math.hypot(x - center(SITE.A.cx), z - center(SITE.A.cy)), toB = Math.hypot(x - center(SITE.B.cx), z - center(SITE.B.cy));
  if (Math.min(toA, toB) < tune.bot_site_alert) state.alert = { squad: b.squad, site: toA < toB ? 'A' : 'B', t: state.t };
}
function botShoot(b: Loose, t: Loose): void {
  const w = b.cur;
  if (!b.ammo[w]) b.ammo[w] = { mag: tune[w + '_mag'], res: 999 };
  const a = b.ammo[w];
  if (b.reloadT > 0 || b.cool > 0) return;
  if (a.mag <= 0) { b.reloadT = tune.reload_time; return; }
  a.mag--; b.cool = tune[w + '_rate'] * tune.bot_fire_slow * (0.85 + rng() * 0.3);
  const d = Math.hypot(t.x - b.x, t.z - b.z);
  const stanceHit = !t.human ? 1 : me.stance === 'prone' ? tune.prone_hit_mult : me.stance === 'crouch' ? tune.crouch_hit_mult : 1;
  const chance = hitChance(level(), tune.bot_acc_start, tune.bot_acc_end, WEAPON[w].botAcc, d, WEAPON[w].range, t.moving) * stanceHit;
  const hitIt = rng() < chance;
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  const gx = b.x + fx * 0.8 + fz * 0.14, gz = b.z + fz * 0.8 - fx * 0.14;
  const miss = hitIt ? 0 : (rng() - 0.5) * 2.2;
  const body = t.human ? me.eye / EYE : 1, lift = t.human ? me.jumpY : 0; // the human's body: lower when down, higher in a jump
  tracer(gx, 1.3, gz, t.x - fz * miss, (hitIt ? 1.2 : 1.0 + rng() * 1.2) * body + lift, t.z + fx * miss);
  b.flashT = 0.06;
  const v = heard(b.x, b.z), at = heardFrom(b.x, b.z); SFX.shot(w, v * 0.8, at.pan, at.dist);
  makeNoise(b.x, b.z, tune.bot_hear_shot, b.squad);
  if (hitIt) applyDamage(t, tune[w + '_dmg'], b);
}

// ---- Bots -----------------------------------------------------------------------------
function botSpeed(b: Loose): number { return tune['bot_speed_' + b.role] * (b.cur === 'sniper' ? tune.sniper_speed_mult : 1); }
function turnTo(b: Loose, yaw: number, rate: number, dt: number): void {
  const d = angDiff(yaw, b.yaw), m = rate * dt;
  b.yaw += Math.abs(d) < m ? d : Math.sign(d) * m;
}
/** Walks a bot along its waypoints (bfs between them, cutting corners where the straight line is clear), turning
 *  it to face the way it walks unless `look` is false. Stuck: it re-paths from its own cell, cell centre by cell
 *  centre, for bot_repath_strict s; stuck again in that time, it snaps to its cell centre. False once arrived. */
function followPath(b: Loose, dt: number, speed: number, look = true): boolean {
  if (b.pathI >= b.path.length) {
    if (!b.wps.length) { b.arrived = true; return false; }
    const w = b.wps[0];
    b.path = bfs(cellOf(b.x), cellOf(b.z), w[0], w[1]); b.pathI = 0;
    if (!b.path.length) {
      const tx = center(w[0]), tz = center(w[1]), dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { moveBody(b, dx / d * speed * dt, dz / d * speed * dt); if (look) b.yaw = yawTo(dx, dz); return true; }
      b.wps.shift(); return true;
    }
  }
  if (b.pathI < b.path.length - 1 && state.t >= b.strictT) {
    const n = b.path[b.pathI + 1];
    if (walkClear(b.x, b.z, center(n[0]), center(n[1]))) b.pathI++;
  }
  const c = b.path[b.pathI], tx = center(c[0]), tz = center(c[1]);
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  if (d < 0.5) {
    b.pathI++;
    if (b.pathI >= b.path.length) { b.wps.shift(); b.path = []; b.pathI = 0; }
    return true;
  }
  const ox = b.x, oz = b.z;
  moveBody(b, dx / d * speed * dt, dz / d * speed * dt);
  if (look) turnTo(b, yawTo(dx, dz), 8, dt);
  if (Math.hypot(b.x - ox, b.z - oz) < speed * dt * 0.2) {
    b.stuckT += dt;
    if (b.stuckT > 0.8) {
      b.stuckT = 0;
      if (state.t < b.strictT) { b.path = []; b.pathI = 0; b.x = center(cellOf(b.x)); b.z = center(cellOf(b.z)); }
      else { const cx = cellOf(b.x), cy = cellOf(b.z), w = b.wps[0]; b.path = [[cx, cy], ...bfs(cx, cy, w[0], w[1])]; b.pathI = 0; }
      b.strictT = state.t + tune.bot_repath_strict;
    }
  } else b.stuckT = 0;
  return true;
}
function canSee(b: Loose, e: Loose): boolean {
  const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
  if (d > tune.bot_view_range) return false;
  const fov = (b.alertT > 0 || b.target === e) ? Math.PI * 2 : tune.bot_fov_deg * Math.PI / 180;
  if (Math.abs(angDiff(yawTo(dx, dz), b.yaw)) > fov / 2) return false;
  return losClear(b.x, b.z, e.x, e.z);
}
/** One step of a bot in cover: it walks to its cover cell, then hides there for bot_peek_hide s and steps out to its
 *  peek cell (where it can shoot) for bot_peek_show s, in turn, never peeking while it reloads. When bot_cover_time
 *  is up and the gun is loaded it takes up the plan it left. `look`: false so walking never turns it from the threat. */
function coverStep(b: Loose, dt: number, speed: number, look: boolean): void {
  b.coverT -= dt;
  if (b.coverT <= 0 && b.reloadT <= 0) { b.coverT = 0; b.wps = b.plan; b.plan = []; b.path = []; b.pathI = 0; b.arrived = false; return; }
  if (b.wps.length) { if (followPath(b, dt, speed, look)) b.moving = true; return; }
  b.peekT -= dt;
  if (b.peekT <= 0) { b.peekOut = !b.peekOut; b.peekT = b.peekOut ? tune.bot_peek_show : tune.bot_peek_hide; }
  const c = b.peekOut && b.peek && b.reloadT <= 0 ? b.peek : b.cover;
  const dx = center(c[0]) - b.x, dz = center(c[1]) - b.z, d = Math.hypot(dx, dz);
  if (d > 0.2) { const k = Math.min(d, speed * dt) / d; moveBody(b, dx * k, dz * k); b.moving = true; }
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** One bot's step: look, take cover, fight, then the plan (staging, rotation, noises, corner checks, the route). */
function botUpdate(b: Loose, dt: number): void {
  b.cool = Math.max(0, b.cool - dt); b.alertT = Math.max(0, b.alertT - dt); b.flashT = Math.max(0, b.flashT - dt);
  if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) finishReload(b); }
  const side = sideOf(b), live = state.phase === 'live', bomb = state.bomb;
  b.moving = false;
  // Look for enemies a few times a second.
  b.scanT -= dt;
  if (live && b.scanT <= 0) {
    b.scanT = 0.15 + rng() * 0.06;
    let best = null, bestD = 1e9;
    for (const e of state.players) {
      if (!e.alive || e.squad === b.squad || !canSee(b, e)) continue;
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (best) {
      if (best !== b.target) { b.reactT = lerp(tune.bot_react_start, tune.bot_react_end, level()) * (0.8 + rng() * 0.4); }
      b.target = best; b.lastX = best.x; b.lastZ = best.z; b.lastSeenT = state.t;
      if (best.squad !== state.human.squad || true) best.spotT = state.t;
      siteAlert(b, best.x, best.z);
      if (b.defusing) { b.defusing = false; state.bomb.defuser = null; }
    } else {
      // Lost sight of a living target: go to where it was last seen (and back), with the nearest free teammate.
      const lost = b.target && b.target.alive && b.coverT <= 0;
      b.target = null;
      const free = (q: Loose): boolean => q.role !== 'sniper' && bomb.carrier !== q && !q.defusing && !q.chasing && q.coverT <= 0
        && !(sideOf(q) === 'def' && bomb.state === 'planted');
      const go = (q: Loose): void => {
        q.chasing = true; q.wps = [[cellOf(b.lastX), cellOf(b.lastZ)], ...(q.wps.length ? q.wps : [[cellOf(q.x), cellOf(q.z)]])];
        q.path = []; q.arrived = false;
      };
      if (lost && free(b)) {
        go(b);
        let buddy = null, bd = tune.bot_buddy_range;
        for (const q of state.players) {
          const d = Math.hypot(q.x - b.x, q.z - b.z);
          if (q !== b && !q.human && q.alive && q.squad === b.squad && !q.target && free(q) && d < bd) { buddy = q; bd = d; }
        }
        if (buddy) go(buddy);
      }
    }
  }
  const t = b.target && b.target.alive ? b.target : null;
  if (!t) b.target = null;
  const speed = botSpeed(b);
  // Cover: when hit, reloading with an enemy about, or low on health facing one, find the nearest cell (within
  // bot_cover_search steps) beside a wall or crate with no line of sight to the threat, best one with a peek cell
  // beside it that has the line of sight back; not while planting or defusing, nor defending a planted bomb.
  if (t) { b.threatX = t.x; b.threatZ = t.z; }
  const about = !!t || state.t - b.lastSeenT < tune.bot_threat_memory;
  if (live && (b.wantCover || (b.coverT <= 0 && about && (b.reloadT > 0 || (!!t && b.hp < tune.bot_cover_hp))))
    && state.t >= b.coverTry && !b.defusing && !b.plantT && !(side === 'def' && bomb.state === 'planted')) {
    const sx = cellOf(b.x), sy = cellOf(b.z), steps = new Map<number, number>([[idx(sx, sy), 0]]), q: Cell[] = [[sx, sy]];
    let hide: Cell | null = null, best: Cell | null = null, peek: Cell | null = null;
    for (let h = 0; h < q.length && !best; h++) {
      const [x, y] = q[h], n = steps.get(idx(x, y))!;
      if (N4.some(([dx, dy]) => grid[idx(x + dx, y + dy)] !== 1) && !losClear(center(x), center(y), b.threatX, b.threatZ)) {
        hide ??= [x, y];
        const pk = N4.find(([dx, dy]) => walkable(x + dx, y + dy) && losClear(center(x + dx), center(y + dy), b.threatX, b.threatZ));
        if (pk) { best = [x, y]; peek = [x + pk[0], y + pk[1]]; }
      }
      if (n < tune.bot_cover_search) for (const [dx, dy] of N4) {
        if (walkable(x + dx, y + dy) && !steps.has(idx(x + dx, y + dy))) { steps.set(idx(x + dx, y + dy), n + 1); q.push([x + dx, y + dy]); }
      }
    }
    const c = best ?? hide;
    if (c) {
      if (b.coverT <= 0) b.plan = b.wps;
      Object.assign(b, { coverT: tune.bot_cover_time, cover: c, peek, wps: [c], path: [], pathI: 0, arrived: false, peekOut: false, peekT: tune.bot_peek_hide });
    } else b.coverTry = state.t + tune.bot_cover_retry;
  }
  b.wantCover = false;
  // Keep apart: every body closer than bot_sep_dist pushes the bot away, harder the closer it is.
  if (live && !b.defusing && !b.plantT) {
    let px = 0, pz = 0;
    for (const o of state.players) {
      if (o === b || !o.alive) continue;
      const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz);
      if (d >= tune.bot_sep_dist) continue;
      const k = (tune.bot_sep_dist - d) / tune.bot_sep_dist;
      if (d > 1e-3) { px += dx / d * k; pz += dz / d * k; } else { px += Math.cos(b.id) * k; pz += Math.sin(b.id) * k; }
    }
    const m = Math.hypot(px, pz);
    if (m > 0) { const k = Math.min(1, m) / m * speed * dt; moveBody(b, px * k, pz * k); }
  }
  if (t && live) { // fight
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
    turnTo(b, yawTo(dx, dz), 7, dt);
    b.reactT -= dt;
    if (b.reactT <= 0 && Math.abs(angDiff(yawTo(dx, dz), b.yaw)) < 0.2) botShoot(b, t);
    if (b.coverT > 0) { coverStep(b, dt, speed, false); return; }
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = 0.5 + rng() * 0.8; b.strafe = rng() < 0.5 ? -1 : 1; }
    const sk = b.role === 'rusher' ? 0.65 : b.role === 'rifleman' ? 0.3 : 0;
    if (sk > 0) {
      const px = -dz / d, pz = dx / d;
      let mx = px * b.strafe * sk, mz = pz * b.strafe * sk;
      if (b.role === 'rusher' && d > 9) { mx += dx / d * 0.7; mz += dz / d * 0.7; }
      moveBody(b, mx * speed * dt, mz * speed * dt); b.moving = true;
    }
    return;
  }
  if (b.alertT > 0) turnTo(b, b.alertYaw, 6, dt);
  if (!live) return;
  if (b.coverT > 0) { turnTo(b, yawTo(b.threatX - b.x, b.threatZ - b.z), 5, dt); coverStep(b, dt, speed, false); return; }
  // No enemy in sight: follow the plan.
  if (side === 'att') {
    if (bomb.state === 'dropped' && !b.fetching && !state.players.some(p => p.fetching && p.alive && sideOf(p) === 'att')) {
      b.fetching = true; b.wps = [[cellOf(bomb.x), cellOf(bomb.z)]]; b.path = []; b.arrived = false; b.after = [];
    }
    if (bomb.state === 'planted' && !b.guarding) {
      b.guarding = true; const c = nearCell(bomb.x, bomb.z, 2); b.wps = [c]; b.path = []; b.arrived = false; b.after = [];
    }
    // Staging: wait facing the site until every attacker bot still to go in is at its staging point (and out of
    // cover), or bot_group_wait passes; then all of them that are there go in together.
    if (b.after.length && b.arrived && !b.wps.length) {
      const mates = state.players.filter(q => !q.human && q.alive && q.squad === b.squad && q.after.length);
      const ready = (q: Loose): boolean => q.arrived && !q.wps.length && q.coverT <= 0;
      b.waitT += dt; turnTo(b, yawTo(center(b.after[0][0]) - b.x, center(b.after[0][1]) - b.z), 4, dt);
      if (b.waitT >= tune.bot_group_wait || mates.every(ready)) {
        for (const q of mates) if (ready(q)) { q.wps = q.after; q.after = []; q.arrived = false; q.path = []; q.waitT = 0; }
      }
      return;
    }
    if (bomb.carrier === b && b.arrived) {
      const z = zone[idx(cellOf(b.x), cellOf(b.z))];
      if (z === 3 || z === 4) {
        b.plantT += dt;
        if (b.plantT >= tune.plant_time) plantBomb(b);
        return;
      }
      routeTo(b, 'site');
    }
    if (b.routeKind === 'hold' && b.arrived) {
      b.holdT -= dt; turnTo(b, b.holdYaw, 4, dt);
      if (b.holdT <= 0) routeTo(b, rng() < 0.5 ? 'mid' : 'lane');
      return;
    }
  } else {
    if (bomb.state === 'planted') {
      const d = Math.hypot(bomb.x - b.x, bomb.z - b.z);
      if (!b.guarding) { b.guarding = true; b.rotating = false; b.wps = [[cellOf(bomb.x), cellOf(bomb.z)]]; b.path = []; b.arrived = false; }
      if (d < 1.7 && (!bomb.defuser || bomb.defuser === b)) {
        if (!b.defusing) { b.defusing = true; bomb.defuser = b; b.thinkT = lerp(tune.bot_think_min, tune.bot_think_max, rng()); b.defuseRight = 0; }
        b.thinkT -= dt;
        if (b.thinkT <= 0) {
          if (rng() < tune.bot_defuse_right) { b.right++; b.defuseRight++; } else { b.wrong++; bomb.panicT = 1.0; }
          if (b.defuseRight >= tune.defuse_answers) { defuseBomb(b); return; }
          b.thinkT = lerp(tune.bot_think_min, tune.bot_think_max, rng());
        }
        return;
      }
    } else if (state.alert && state.alert.squad === b.squad && !b.rotated && b.role !== 'sniper' && b.anchor !== state.alert.site
      && state.t - state.alert.t < 8) {
      b.rotated = true; anchorTo(b, state.alert.site); b.rotating = true; b.rotT = 0;
    }
  }
  // Rotating defenders go as a pack: one more than bot_group_gap m ahead of a rotating teammate waits for them
  // (at most bot_group_wait s in all), facing the site.
  if (b.rotating) {
    if (!b.wps.length) b.rotating = false;
    else {
      const gx = center(SITE[b.anchor].cx), gz = center(SITE[b.anchor].cy), mine = Math.hypot(gx - b.x, gz - b.z);
      if (b.rotT < tune.bot_group_wait && state.players.some(q => q !== b && q.alive && q.rotating && q.squad === b.squad
        && Math.hypot(gx - q.x, gz - q.z) - mine > tune.bot_group_gap)) {
        b.rotT += dt; turnTo(b, yawTo(gx - b.x, gz - b.z), 4, dt); return;
      }
    }
  }
  // A noise heard with nothing better to do (holding its spot, not the sniper, the carrier or a guard): go and look, then come back.
  if (b.noiseNew) {
    b.noiseNew = false;
    if (b.arrived && !b.wps.length && !b.after.length && !b.looks.length && !b.investigating && !b.rotating && !b.guarding
      && b.role !== 'sniper' && bomb.carrier !== b) {
      b.investigating = true; b.wps = [[cellOf(b.noiseX), cellOf(b.noiseZ)], [cellOf(b.x), cellOf(b.z)]]; b.path = []; b.arrived = false;
    }
  }
  // Corner check: an attacker that arrives in a site (not the carrier) looks at each way into it, bot_corner_look s
  // apiece (entries closer than bot_corner_merge_deg count as one), before it settles.
  const here = zone[idx(cellOf(b.x), cellOf(b.z))];
  if (side === 'att' && b.arrived && !b.cleared && bomb.carrier !== b && (here === 3 || here === 4)) {
    b.cleared = true; b.lookT = 0; b.looks = [];
    for (const [x, y] of here === SITE.A.z ? siteCells.A : siteCells.B) {
      if (!N4.some(([dx, dy]) => grid[idx(x + dx, y + dy)] === 1 && zone[idx(x + dx, y + dy)] !== here)) continue;
      const yw = yawTo(center(x) - b.x, center(y) - b.z);
      if (b.looks.every((l: number) => Math.abs(angDiff(l, yw)) > tune.bot_corner_merge_deg * Math.PI / 180)) b.looks.push(yw);
    }
  }
  if (b.looks.length) {
    turnTo(b, b.looks[0], 6, dt); b.lookT += dt;
    if (b.lookT >= tune.bot_corner_look) { b.looks.shift(); b.lookT = 0; }
    return;
  }
  if (followPath(b, dt, speed)) b.moving = true;
  else { b.chasing = false; b.investigating = false; turnTo(b, b.holdYaw, 3, dt); }
  if (b.arrived && b.fetching) b.fetching = false;
}
function nearCell(x: number, z: number, r: number): number[] {
  for (let k = 0; k < 12; k++) {
    const cx = cellOf(x) + Math.round((rng() - 0.5) * 2 * r), cy = cellOf(z) + Math.round((rng() - 0.5) * 2 * r);
    if (walkable(cx, cy)) return [cx, cy];
  }
  return [cellOf(x), cellOf(z)];
}

// ---- The bomb -------------------------------------------------------------------------
function plantBomb(p: Loose): void {
  const b = state.bomb;
  b.state = 'planted'; b.x = p.x; b.z = p.z; b.carrier = null; b.timer = tune.bomb_time;
  b.site = zone[idx(cellOf(p.x), cellOf(p.z))] === 3 ? 'A' : 'B';
  p.money = Math.min(tune.max_money, p.money + tune.plant_money);
  p.plantT = 0; state.plantT = 0;
  bombModel.group.position.set(p.x, 0, p.z); bombModel.group.rotation.y = p.yaw; bombModel.group.visible = true;
  SFX.plant();
  say(`¡Bomba plantada en ${b.site}! ${tune.bomb_time} segundos`, 4);
  for (const q of state.players) { q.guarding = false; q.fetching = false; }
  events.push({ type: 'plant', site: b.site });
}
function defuseBomb(p: Loose): void {
  state.bomb.state = 'defused'; state.bomb.defuser = null; SFX.defused();
  feed(p.human ? 'Desactivaste la bomba' : `${p.name} desactivó la bomba`, p.human);
  endRound('def', 'La bomba fue desactivada');
}
function updateBomb(dt: number): void {
  const b = state.bomb;
  b.panicT = Math.max(0, b.panicT - dt);
  if (b.state === 'carried' && b.carrier) { b.x = b.carrier.x; b.z = b.carrier.z; }
  if (b.state === 'dropped') {
    bombModel.group.position.set(b.x, 0, b.z); bombModel.group.visible = true;
    for (const p of state.players) {
      if (p.alive && sideOf(p) === 'att' && Math.hypot(p.x - b.x, p.z - b.z) < 1.3) {
        b.state = 'carried'; b.carrier = p; bombModel.group.visible = false; p.fetching = false;
        if (!p.human) routeTo(p, 'site');
        if (p.human) say('Recogiste la bomba'); break;
      }
    }
  }
  if (b.state === 'planted' && state.phase === 'live') {
    b.timer -= dt; b.beepT -= dt;
    if (b.beepT <= 0) {
      b.beepT = Math.max(0.12, (b.timer / tune.bomb_time) * 1.0);
      SFX.beep(Math.max(0.25, heard(b.x, b.z)), b.panicT > 0);
    }
    if (b.timer <= 0) {
      b.state = 'exploded'; state.boomT = 1.2; SFX.boom();
      boomMesh.position.set(b.x, 1, b.z); boomMesh.visible = true; bombModel.group.visible = false;
      for (const p of state.players) if (p.alive && Math.hypot(p.x - b.x, p.z - b.z) < 14) kill(p, null);
      endRound('att', 'La bomba explotó');
    }
  }
}

// ---- Rounds ---------------------------------------------------------------------------
function endRound(winSide: string, reason: string): void {
  if (state.phase !== 'live') return;
  const win = winSide === 'att' ? state.attSquad : 1 - state.attSquad, lose = 1 - win;
  state.score[win]++;
  state.lossStreak[win] = 0; state.lossStreak[lose]++;
  for (const p of state.players) {
    const pay = roundPay(p.squad === win, state.lossStreak[lose], tune.win_money, tune.loss_money, tune.loss_bonus);
    p.money = Math.min(tune.max_money, p.money + pay);
  }
  state.phase = 'post'; state.phaseT = tune.round_end_delay;
  state.banner = { text: `${win === 0 ? 'Tu equipo gana' : 'Los rivales ganan'} la ronda`, reason, mine: win === state.human.squad };
  state.menu = false; closeCard(true);
  (win === state.human.squad ? SFX.win : SFX.lose)();
  events.push({ type: 'roundEnd', win, reason, score: state.score.slice() });
}
function checkRound() {
  if (state.phase !== 'live') return;
  const alive = (side: string): number => state.players.filter(p => p.alive && sideOf(p) === side).length;
  const b = state.bomb;
  if (b.state === 'planted') { if (!alive('def')) endRound('att', 'Todos los defensores han caído'); return; }
  if (!alive('att')) endRound('def', 'Todos los atacantes han caído');
  else if (!alive('def')) endRound('att', 'Todos los defensores han caído');
  else if (state.roundT <= 0) endRound('def', 'Se acabó el tiempo sin plantar la bomba');
}
function afterRound() {
  if (state.score[0] >= tune.rounds_to_win || state.score[1] >= tune.rounds_to_win) {
    const p = state.human, total = p.right + p.wrong;
    const won = state.score[0] > state.score[1];
    state.gained = `${won ? 'Tu equipo gana' : 'Los rivales ganan'} ${state.score[0]} - ${state.score[1]}`;
    state.answered = total ? `Respondiste bien ${p.right} de ${total} preguntas (${Math.round(100 * p.right / total)} %)` : 'No respondiste ninguna pregunta en esta partida';
    scene = 'results'; events.push({ type: 'matchEnd', won });
    if (locked) document.exitPointerLock();
    return;
  }
  if (state.round === tune.halftime_after) {
    state.attSquad = 1 - state.attSquad; state.lossStreak = [0, 0];
    for (const p of state.players) { resetGuns(p); p.money = tune.start_money; p.alive = false; }
    say('¡Descanso: se cambian los lados!', 4);
  }
  startRound();
}

// ---- You -------------------------------------------------------------------------------
function inOwnBase(p: Loose): boolean { const z = zone[idx(cellOf(p.x), cellOf(p.z))]; return z === (sideOf(p) === 'att' ? 1 : 2); }
function shopBlock(p: Loose, it: typeof SHOP[number]): string {
  if (it.id === 'armor' && p.armor >= 100) return 'Lleno';
  if (it.id === 'ammo' && Object.entries(p.ammo as Record<string, Loose>).every(([w, a]) => a.res >= tune[w + '_reserve'])) return 'Lleno';
  if (p.primary === it.id) return 'Comprada';
  if (p.money < tune[it.price]) return 'Falta $' + (tune[it.price] - p.money);
  return '';
}
function grant(p: Loose, id: string): void {
  const it = SHOP.find(s => s.id === id)!;
  p.money -= tune[it.price];
  if (id === 'armor') p.armor = 100;
  else if (id === 'ammo') for (const [w, a] of Object.entries(p.ammo as Record<string, Loose>)) a.res = tune[w + '_reserve'];
  else { p.primary = id; p.cur = id; p.ammo[id] = { mag: tune[id + '_mag'], res: tune[id + '_reserve'] }; p.reloadT = 0; }
  SFX.buy(); feed(`Compraste: ${it.name}`, true);
  events.push({ type: 'buy', item: id });
}
/**
 * The level of the question an item asks: the session level stepped up by `question_step_<item>`, at most Difícil.
 * No item (the defuse) uses the session level. A custom CSV ignores levels, so it returns undefined.
 */
function questionLevel(item?: string): Level | undefined {
  if (session.subject === QUESTIONS.CUSTOM) return undefined;
  const step = item ? tune['question_step_' + item] : 0;
  return LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(session.level) + step)];
}
function openCard(kind: string, item?: string): void {
  const level = questionLevel(item);
  state.card = { kind, item, level, q: state.deck.next(level), picked: -1, wrongT: 0, wrongTotal: 0, okT: 0, anim: 0, got: 0 };
  if (locked) document.exitPointerLock();
}
/**
 * Closes the open card. A question not yet answered goes back as the next draw (GDD Edge Cases); one in its
 * wrong-answer lockout was already missed, and one already answered right is spent. While a right answer is
 * being confirmed the card stays open unless `force` (death, the round ending, the bomb gone).
 */
function closeCard(force = false): void {
  const c = state.card;
  if (!c || (c.okT > 0 && !force)) return;
  if (c.okT <= 0 && c.wrongT <= 0) state.deck.putBack(c.q);
  state.card = null;
}
function answer(i: number): void {
  const c = state.card, p = state.human;
  if (!c || c.wrongT > 0 || c.okT > 0 || i >= c.q.choices.length) return;
  c.picked = i;
  if (i === c.q.answer) { p.right++; state.wrongStreak = 0; c.okT = 0.35; SFX.right(); events.push({ type: 'answer', right: true }); }
  else {
    p.wrong++; state.wrongStreak++;
    // The lockout grows by wrong_delay_growth for each wrong answer in a row, up to wrong_delay_max.
    c.wrongT = c.wrongTotal = Math.min(tune.wrong_delay_max, tune.wrong_delay * tune.wrong_delay_growth ** (state.wrongStreak - 1));
    state.deck.miss(c.q); SFX.wrong(); events.push({ type: 'answer', right: false });
    if (c.kind === 'defuse') state.bomb.panicT = 1.6;
  }
}
function updateCard(dt: number): void {
  const c = state.card;
  c.anim = Math.min(1, c.anim + dt * 5);
  for (let k = 0; k < 4; k++) if (pressed('Digit' + (k + 1)) || pressed('Numpad' + (k + 1))) answer(k);
  if (c.okT > 0) {
    c.okT -= dt;
    if (c.okT <= 0) {
      if (c.kind === 'buy') { grant(state.human, c.item); state.card = null; }
      else {
        c.got++;
        if (c.got >= tune.defuse_answers) { state.card = null; defuseBomb(state.human); }
        else { c.q = state.deck.next(c.level); c.picked = -1; }
      }
    }
  } else if (c.wrongT > 0) {
    c.wrongT -= dt;
    if (c.wrongT <= 0) { c.q = state.deck.next(c.level); c.picked = -1; } // a wrong answer always brings a new question
  }
}
function humanUpdate(p: Loose, dt: number): void {
  p.cool = Math.max(0, p.cool - dt); p.flashT = Math.max(0, p.flashT - dt);
  p.recoil *= Math.exp(-dt * 7);
  if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) finishReload(p); }
  const live = state.phase === 'live', buy = state.phase === 'buy';
  // Stance: the prone change and the jump run even with a card open, so nothing stops mid-air.
  const f = (down.has(bind.forward) ? 1 : 0) - (down.has(bind.back) ? 1 : 0), s = (down.has(bind.right) ? 1 : 0) - (down.has(bind.left) ? 1 : 0);
  const planting = live && state.bomb.carrier === p && down.has(bind.use);
  const walk = down.has(bind.walk), sprintKey = down.has(bind.sprint) && !walk && (f !== 0 || s !== 0);
  if (me.proneT > 0) { me.proneT -= dt; if (me.proneT <= 0) { me.proneT = 0; me.prone = !me.prone; } }
  if (me.jumpY > 0 || me.vy !== 0) {
    me.vy -= tune.gravity * dt; me.jumpY += me.vy * dt;
    if (me.jumpY <= 0) { me.jumpY = 0; me.vy = 0; if (live) makeNoise(p.x, p.z, tune.bot_hear_land, p.squad); } // the landing is heard
  }
  me.sprint = sprintKey && !uiOpen() && !planting && !me.prone && me.proneT === 0;
  const crouch = !me.prone && !me.sprint && down.has(bind.crouch);
  me.stance = me.prone ? 'prone' : crouch ? 'crouch' : 'stand';
  const eyeTo = (me.proneT > 0 ? !me.prone : me.prone) ? tune.prone_eye : crouch ? tune.crouch_eye : EYE;
  me.eye += (eyeTo - me.eye) * Math.min(1, tune.eye_rate * dt);
  if (Math.abs(eyeTo - me.eye) < 0.002) me.eye = eyeTo;
  // Menus and cards first.
  if (pressed(bind.buy)) {
    if (state.card && state.card.kind === 'buy') closeCard();
    else if (state.menu) state.menu = false;
    else if (buy && inOwnBase(p)) { state.menu = true; if (locked) document.exitPointerLock(); }
    else say(buy ? 'Compra en tu propia base' : 'Solo se compra durante el tiempo de compra');
  }
  if (state.card && state.card.kind === 'defuse') {
    if (state.bomb.state !== 'planted') closeCard(true);
    else if (pressed(bind.use)) closeCard();
  }
  if (state.card) { updateCard(dt); p.moving = false; return; }
  if (state.menu) {
    if (!buy) { state.menu = false; say('Se acabó el tiempo de compra'); }
    for (let k = 0; k < SHOP.length; k++) if (pressed('Digit' + (k + 1)) || pressed('Numpad' + (k + 1))) tryBuy(SHOP[k].id);
    p.moving = false; return;
  }
  // Look with the arrow keys too.
  if (down.has('ArrowLeft')) p.yaw += tune.key_turn_speed * dt;
  if (down.has('ArrowRight')) p.yaw -= tune.key_turn_speed * dt;
  if (down.has('ArrowUp')) p.pitch = Math.min(1.4, p.pitch + tune.key_turn_speed * 0.6 * dt);
  if (down.has('ArrowDown')) p.pitch = Math.max(-1.4, p.pitch - tune.key_turn_speed * 0.6 * dt);
  // Stance keys: prone toggles (and takes prone_time), sprinting stands you up, a jump needs standing on the ground.
  const ground = me.jumpY === 0 && me.vy === 0, changing = me.proneT > 0;
  if (!changing && ground && (pressed(bind.prone) || (me.prone && sprintKey))) me.proneT = tune.prone_time;
  if (pressed(bind.jump) && ground && !changing && me.stance === 'stand') me.vy = tune.jump_velocity;
  // Move.
  let sp = walk ? tune.walk_speed : me.sprint ? tune.sprint_speed : tune.run_speed;
  if (p.cur === 'sniper') sp *= tune.sniper_speed_mult;
  if (p.scoped) sp *= 0.5;
  if (me.stance === 'prone') sp *= tune.prone_speed_mult; else if (me.stance === 'crouch') sp *= tune.crouch_speed_mult;
  if ((f || s) && !planting && me.proneT === 0) {
    const n = Math.hypot(f, s), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const mx = (fx * f + -fz * s) / n, mz = (fz * f + fx * s) / n;
    moveBody(p, mx * sp * dt, mz * sp * dt); p.moving = sp > tune.walk_speed + 0.1;
  } else p.moving = false;
  // Footsteps the enemy bots hear: sprinting carries far, running less; walking, crouched or prone is silent.
  const stepR = !live || !p.moving || me.jumpY > 0 ? 0 : me.sprint ? tune.bot_hear_sprint : me.stance === 'stand' ? tune.bot_hear_run : 0;
  if (stepR > 0 && Math.floor(state.t / tune.bot_step_interval) !== Math.floor((state.t - dt) / tune.bot_step_interval)) makeNoise(p.x, p.z, stepR, p.squad);
  // Weapons.
  if (pressed(bind.primary) && p.primary && p.cur !== p.primary) { p.cur = p.primary; p.reloadT = 0; p.scoped = false; p.cool = 0.3; }
  if (pressed(bind.pistol) && p.cur !== 'pistol') { p.cur = 'pistol'; p.reloadT = 0; p.scoped = false; p.cool = 0.25; }
  if (pressed(bind.swap) && p.primary) { p.cur = p.cur === 'pistol' ? p.primary : 'pistol'; p.reloadT = 0; p.scoped = false; p.cool = 0.25; }
  if (pressed(bind.reload)) startReload(p);
  if (pressed('Mouse2') && p.cur === 'sniper' && p.reloadT <= 0) p.scoped = !p.scoped;
  if (live) {
    const auto = WEAPON[p.cur].auto;
    const trig = auto ? (down.has('Mouse0') || down.has(bind.shoot)) : (pressed('Mouse0') || pressed(bind.shoot));
    if (trig && !me.sprint && me.proneT === 0) humanShoot(p);
  } else if (pressed('Mouse0') || pressed(bind.shoot)) say('Se puede disparar cuando se abran las puertas');
  // The bomb.
  const b = state.bomb;
  if (live && b.carrier === p) {
    const z = zone[idx(cellOf(p.x), cellOf(p.z))];
    if ((z === 3 || z === 4) && down.has(bind.use)) {
      state.plantT += dt;
      if (state.plantT >= tune.plant_time) plantBomb(p);
    } else state.plantT = 0;
    // Your bot teammates follow you to the site you head for.
    for (const k of ['A', 'B']) {
      if (state.attackSite !== k && Math.hypot(p.x - center(SITE[k].cx), p.z - center(SITE[k].cy)) < 20) {
        state.attackSite = k;
        for (const q of state.players) if (!q.human && q.squad === p.squad && q.alive && q.routeKind !== 'hold') routeTo(q, 'site');
      }
    }
  }
  if (live && b.state === 'planted' && sideOf(p) === 'def' && Math.hypot(p.x - b.x, p.z - b.z) < 2 && pressed(bind.use)) {
    if (b.defuser && !b.defuser.human) { b.defuser.defusing = false; }
    b.defuser = p; openCard('defuse');
  }
}
function tryBuy(id: string): void {
  const p = state.human, it = SHOP.find(s => s.id === id)!, why = shopBlock(p, it);
  if (why) { say(`${it.name}: ${why}`); SFX.click(); return; }
  openCard('buy', id);
}

// ---- Scenes ---------------------------------------------------------------------------
let titleT = 0;
const scenes: Record<string, { update(dt: number): void; draw(): void }> = {
  figures: {
    update(dt) { titleT += dt; },
    draw() { drawFigures(); },
  },
  title: {
    update(dt) {
      titleT += dt;
      const act = clicks.shift();
      const i = SUBJECT_LIST.indexOf(session.subject);
      if (pressed('ArrowDown')) session.subject = SUBJECT_LIST[(i + 1) % SUBJECT_LIST.length];
      if (pressed('ArrowUp')) session.subject = SUBJECT_LIST[(i + SUBJECT_LIST.length - 1) % SUBJECT_LIST.length];
      if (session.subject !== QUESTIONS.CUSTOM) {
        const all = Object.keys(QUESTIONS.SUBJECTS[session.subject].topics);
        for (let k = 0; k < all.length; k++) if (pressed('Digit' + (k + 1))) toggleTopic(all[k]);
        // The level: Left / Right step through Fácil, Medio, Difícil (a custom CSV ignores it, so it is locked there).
        const l = LEVELS.indexOf(session.level);
        if (pressed('ArrowLeft')) session.level = LEVELS[Math.max(0, l - 1)];
        if (pressed('ArrowRight')) session.level = LEVELS[Math.min(LEVELS.length - 1, l + 1)];
      }
      if (act && act.startsWith('subj:')) session.subject = act.slice(5);
      if (act && act.startsWith('topic:')) toggleTopic(act.slice(6));
      if (act && act.startsWith('level:')) session.level = act.slice(6) as Level;
      // The map: C steps through them, a click picks one; the flyover behind shows it.
      if (pressed('KeyC')) pickMap(MAP_IDS[(MAP_IDS.indexOf(session.map) + 1) % MAP_IDS.length]);
      if (act && act.startsWith('map:')) pickMap(act.slice(4));
      if (act === 'controls') { Object.assign(ctl, { from: 'title', sel: 0, capture: false, note: '' }); scene = 'controls'; return; }
      if (pressed('Enter') || pressed('Space') || act === 'start') {
        if (session.subject === QUESTIONS.CUSTOM && !session.custom.length) { session.status = 'Primero sube un CSV (tecla U) o elige una asignatura'; return; }
        if (session.available === 0) { session.status = 'Todavía no hay preguntas para esta elección'; return; }
        startMatch(); scene = 'play';
      }
    },
    draw() { drawTitle(); },
  },
  play: {
    update(dt) {
      if (pressed(bind.pause) || pressed('Escape')) { scene = 'pause'; if (locked) document.exitPointerLock(); return; }
      const act = clicks.shift();
      if (act && act.startsWith('buy:')) tryBuy(act.slice(4));
      if (act && act.startsWith('ans:')) answer(Number(act.slice(4)));
      if (act === 'closebuy') state.menu = false;
      if (act === 'closecard') closeCard();
      if (act === 'spec' || (!state.human.alive && pressed('Space'))) nextSpec();
      state.t += dt;
      for (const p of state.players) { p.px = p.x; p.pz = p.z; }
      if (state.phase === 'buy') {
        state.phaseT -= dt;
        if (state.phaseT <= 0) {
          // A right answer already given completes the purchase; any other open buy card closes (GDD Edge Cases).
          if (state.card && state.card.kind === 'buy') {
            if (state.card.okT > 0) grant(state.human, state.card.item);
            closeCard(true);
          }
          state.phase = 'live'; mapState.gatesClosed = false; state.gateT = 0.01; SFX.gate();
          say(sideOf(state.human) === 'att' ? '¡Puertas abiertas: adelante!' : '¡Puertas abiertas: defiende los sitios!', 2.5);
        }
      } else if (state.phase === 'live') {
        if (state.bomb.state !== 'planted') state.roundT -= dt;
      } else if (state.phase === 'post') {
        state.phaseT -= dt;
        if (state.phaseT <= 0) { afterRound(); return; }
      }
      if (state.human.alive) humanUpdate(state.human, dt);
      else { state.human.moving = false; if (!state.specP || !state.specP.alive) nextSpec(); }
      for (const p of state.players) if (!p.human && p.alive) botUpdate(p, dt);
      for (const p of state.players) if (!p.alive) p.deadT += dt;
      updateBomb(dt);
      checkRound();
      // timers
      state.msgT -= dt; state.flashT = Math.max(0, state.flashT - dt); state.hitT = Math.max(0, state.hitT - dt);
      state.killT = Math.max(0, state.killT - dt); state.boomT = Math.max(0, state.boomT - dt);
      for (const h of state.hurt) h.t -= dt;
      state.hurt = state.hurt.filter(h => h.t > 0);
      for (const f of state.feed) f.t -= dt;
      state.feed = state.feed.filter(f => f.t > 0);
      if (state.gateT > 0) state.gateT += dt;
    },
    draw() { drawWorld(); drawHUD(); },
  },
  pause: {
    update() {
      const act = clicks.shift();
      if (pressed(bind.pause) || pressed('Escape') || act === 'resume') scene = 'play';
      if (act === 'controls') { Object.assign(ctl, { from: 'pause', sel: 0, capture: false, note: '' }); scene = 'controls'; }
      if (pressed('BracketLeft') || act === 'sens:-') CONFIG.mouse_sens.value = Math.max(CONFIG.mouse_sens.min, +(tune.mouse_sens - 0.1).toFixed(2));
      if (pressed('BracketRight') || act === 'sens:+') CONFIG.mouse_sens.value = Math.min(CONFIG.mouse_sens.max, +(tune.mouse_sens + 0.1).toFixed(2));
      if (pressed('Backspace') || act === 'quit') scene = 'title';
    },
    draw() {
      drawWorld(); drawHUD(true);
      ctx.fillStyle = 'rgba(10,14,24,0.72)'; ctx.fillRect(0, 0, W, H);
      text('Pausa', W / 2, 200, 56, '#fff');
      text(`Sensibilidad del ratón: ${tune.mouse_sens.toFixed(1)}`, W / 2, 290, 28, '#fff');
      button(W / 2 - 275, 270, 60, 44, '-', 'sens:-', { size: 30 });
      button(W / 2 + 215, 270, 60, 44, '+', 'sens:+', { size: 30 });
      text('También con [ y ]', W / 2, 336, 18, '#c8d2e6', 'center', 'normal');
      button(W / 2 - 160, 380, 320, 52, `Continuar (${keyName(bind.pause)} o clic)`, 'resume', { size: 22 });
      button(W / 2 - 160, 444, 320, 52, 'Controles', 'controls', { size: 22 });
      button(W / 2 - 160, 508, 320, 52, 'Salir a la pantalla de sesión', 'quit', { size: 20 });
      text(`Asignatura: ${state.subjectLabel || ''}`, W / 2, 620, 18, '#c8d2e6', 'center', 'normal');
    },
  },
  controls: {
    update() {
      const act = clicks.shift(), n = ACTIONS.length; // rows 0..n-1 are the actions, n is Restablecer, n + 1 is Volver
      if (act && act.startsWith('key:')) Object.assign(ctl, { sel: Number(act.slice(4)), capture: true, note: '' });
      else if (act === 'keysreset') { resetKeys(); Object.assign(ctl, { capture: false, note: 'Teclas por defecto restablecidas' }); }
      else if (act === 'back') { scene = ctl.from; return; }
      else if (ctl.capture) {
        const code = [...hit].find(c => !c.startsWith('Mouse'));
        if (code === 'Escape') Object.assign(ctl, { capture: false, note: 'Cambio cancelado' });
        else if (code && code.startsWith('Arrow')) ctl.note = 'Las flechas giran la vista: elige otra tecla';
        else if (code) {
          const a = ACTIONS[ctl.sel], other = setKey(a.id, code);
          ctl.capture = false;
          ctl.note = other ? `${other.label} pasa a ${keyName(bind[other.id])}` : `${a.label}: ${keyName(code)}`;
        }
      } else {
        const half = Math.ceil(n / 2);
        if (pressed('Escape')) { scene = ctl.from; return; }
        if (pressed('ArrowDown')) ctl.sel = Math.min(n + 1, ctl.sel + 1);
        if (pressed('ArrowUp')) ctl.sel = Math.max(0, ctl.sel - 1);
        if (pressed('ArrowRight') && ctl.sel < half) ctl.sel = Math.min(n - 1, ctl.sel + half);
        if (pressed('ArrowLeft') && ctl.sel >= half && ctl.sel < n) ctl.sel -= half;
        if (pressed('Enter')) {
          if (ctl.sel === n) { resetKeys(); ctl.note = 'Teclas por defecto restablecidas'; }
          else if (ctl.sel === n + 1) { scene = ctl.from; return; }
          else Object.assign(ctl, { capture: true, note: '' });
        }
      }
    },
    draw() {
      if (ctl.from === 'pause') { drawWorld(); drawHUD(true); } else flyover();
      buttons.length = 0;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(10,14,24,0.88)'; ctx.fillRect(0, 0, W, H);
      text('Controles', W / 2, 50, 40, '#ffd06a');
      text('Clic en una acción (o flechas y Intro) y pulsa la tecla nueva. Esc cancela.', W / 2, 94, 17, '#e4e9f4', 'center', 'normal');
      const n = ACTIONS.length, half = Math.ceil(n / 2);
      ACTIONS.forEach((a, i) => {
        const x = i < half ? 80 : 660, y = 120 + (i % half) * 54, on = ctl.sel === i, cap = on && ctl.capture;
        button(x, y, 540, 46, '', 'key:' + i, { fill: cap ? '#ffd06a' : on ? '#33415c' : undefined, stroke: on ? '#fff3c4' : undefined });
        text(a.label, x + 20, y + 23, 19, cap ? '#1b2232' : '#fff', 'left');
        const k = cap ? 'Pulsa una tecla…' : keyName(bind[a.id]);
        ctx.font = `bold 18px ${FONT}`; const kw = Math.max(64, ctx.measureText(k).width + 28);
        rr(x + 520 - kw, y + 7, kw, 32, 8, cap ? '#1b2232' : '#0d1220', '#ffd06a', 2);
        text(k, x + 520 - kw / 2, y + 23, 18, '#ffe7a8');
      });
      if (ctl.note) text(ctl.note, W / 2, 618, 18, '#9ff08a');
      const sel = (i: number) => ctl.sel === i ? { stroke: '#fff3c4', fill: '#33415c' } : {};
      button(W / 2 - 340, 644, 320, 52, 'Restablecer', 'keysreset', { size: 22, ...sel(n) });
      button(W / 2 + 20, 644, 320, 52, 'Volver', 'back', { size: 22, ...sel(n + 1) });
    },
  },
  results: {
    update() {
      const act = clicks.shift();
      if (pressed('Enter') || act === 'menu') { scene = 'title'; }
    },
    draw() { drawWorld(); drawResults(); },
  },
};
/** The Controles screen: the selected row, whether it waits for a key, the last change, and the scene to go back to. */
const ctl = { sel: 0, capture: false, note: '', from: 'title' };
/** Picks the session's map and shows it behind the session screen. */
function pickMap(id: string): void {
  session.map = id; useMap(id);
}
function toggleTopic(t: string): void {
  const list = session.topics[session.subject];
  const i = list.indexOf(t);
  if (i >= 0) { if (list.length > 1) list.splice(i, 1); } else list.push(t);
}

// ---- Drawing: the 3D view ----------------------------------------------------------------
function placeModels() {
  for (const p of state.players) {
    const m = models[p.id];
    if (p.human) continue;
    const x = lerp(p.px, p.x, ALPHA), z = lerp(p.pz, p.z, ALPHA);
    m.group.position.set(x, 0, z);
    if (p.alive) {
      m.group.rotation.set(0, p.yaw, 0);
      if (p.moving) p.walkPh += 0.18; else p.walkPh *= 0.9;
      const sw = Math.sin(p.walkPh) * (p.moving ? 0.6 : 0);
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      m.group.position.y = p.defusing ? -0.35 : 0;
    } else {
      const k = Math.min(1, p.deadT / 0.4);
      m.group.rotation.set(k * Math.PI / 2, p.yaw, 0, 'YXZ');
    }
    m.flash.visible = p.flashT > 0;
    m.flash.rotation.z = state.t * 40;
    backBombs[p.id].group.visible = p.alive && state.bomb.state === 'carried' && state.bomb.carrier === p;
  }
}
function drawWorld() {
  const p = state.human, view = p.alive ? p : (state.specP || p);
  placeModels();
  if (view === p) {
    camera.position.set(p.x, me.eye + me.jumpY, p.z);
    camera.rotation.set(p.pitch + p.recoil, p.yaw, 0, 'YXZ');
  } else {
    camera.position.set(lerp(view.px, view.x, ALPHA), EYE, lerp(view.pz, view.z, ALPHA));
    camera.rotation.set(0, view.yaw, 0, 'YXZ');
    models[view.id].group.visible = false;
  }
  const fov = p.alive && p.scoped ? 22 : 72;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // gates sink into the floor when the round goes live
  if (state.gateT > 0) for (const g of gates) { g.position.y = 1.5 - Math.min(1, state.gateT / 0.7) * 3.2; g.visible = g.position.y > -1.5; }
  // the bomb's light blinks, red and fast on a wrong defuse answer
  const b = state.bomb;
  if (b.state === 'planted') {
    const fast = b.panicT > 0, on = Math.floor(state.t * (fast ? 14 : 3)) % 2 === 0;
    bombModel.lightMat.color.setHex(fast ? (on ? 0xff2020 : 0x400000) : (on ? 0xff5040 : 0x301010));
  } else bombModel.lightMat.color.setHex(0x44ff66);
  const showBeacon = b.state === 'planted' || b.state === 'dropped';
  beacon.group.visible = showBeacon;
  if (showBeacon) {
    beacon.group.position.set(b.x, 0, b.z);
    beacon.mat.color.setHex(b.state === 'planted' ? (b.panicT > 0 ? 0xff1a1a : 0xff4a2a) : 0xffb030);
    beacon.mat.opacity = 0.22 + 0.12 * Math.sin(state.t * (b.panicT > 0 ? 18 : 5));
    beacon.ring.scale.setScalar(1 + 0.15 * Math.sin(state.t * 4));
  }
  for (const tr of tracers) { tr.t -= 1 / 60; tr.line.material.opacity = Math.max(0, tr.t / 0.09); }
  for (const s of sparks) { s.t -= 1 / 60; s.m.visible = s.t > 0; s.m.position.y += 0.01; }
  if (state.boomT > 0) {
    const k = 1 - state.boomT / 1.2; boomMesh.scale.setScalar(2 + k * 14); boomMesh.material.opacity = 0.85 * (1 - k); boomMesh.visible = true;
  } else boomMesh.visible = false;
  renderer.clear(); renderer.render(world, camera);
  if (view !== p) models[view.id].group.visible = true;
  // first-person gun
  const planting = p.alive && state.plantT > 0;
  viewBomb.group.visible = planting;
  for (const [k, g] of Object.entries(viewGuns)) g.group.visible = p.alive && !p.scoped && !planting && k === p.cur;
  if (planting) { // the bomb in your hands, lowered toward the floor as the plant fills
    const k = state.plantT / tune.plant_time;
    viewBomb.group.position.set(0.02, -0.28 - k * 0.12, -0.55);
    viewBomb.lightMat.color.setHex(Math.floor(state.t * 8) % 2 ? 0xff5040 : 0x44ff66);
    renderer.clearDepth(); renderer.render(gunScene, gunCam);
  } else if (p.alive && !p.scoped) {
    const g = viewGuns[p.cur].group, bob = p.moving ? Math.sin(state.t * 11) : 0;
    const rl = p.reloadT > 0 ? Math.sin(Math.min(1, 1 - p.reloadT / tune.reload_time) * Math.PI) : 0;
    g.position.set(0.22 + bob * 0.012, -0.21 + Math.abs(bob) * 0.01 - rl * 0.22 + p.recoil * 0.6, -0.5 + p.recoil * 1.6);
    g.scale.setScalar(0.75);
    g.rotation.set(p.recoil * 2 - rl * 0.6, 0.05, 0);
    viewGuns[p.cur].flash.visible = p.flashT > 0;
    viewGuns[p.cur].flash.rotation.z = state.t * 50;
    renderer.clearDepth(); renderer.render(gunScene, gunCam);
  }
}
const _v = new THREE.Vector3();
function project(x: number, y: number, z: number): { x: number; y: number } | null {
  _v.set(x, y, z).project(camera);
  if (_v.z > 1) return null;
  return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H };
}

// ---- Drawing: the HUD --------------------------------------------------------------------
function drawCross(x: number, y: number, s: number, c: string): void { ctx.fillStyle = c; ctx.fillRect(x - s * 0.18, y - s / 2, s * 0.36, s); ctx.fillRect(x - s / 2, y - s * 0.18, s, s * 0.36); }
function drawShield(x: number, y: number, s: number, c: string): void {
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s / 2); ctx.lineTo(x + s / 2, y - s / 3); ctx.lineTo(x + s * 0.4, y + s / 6);
  ctx.lineTo(x, y + s / 2); ctx.lineTo(x - s * 0.4, y + s / 6); ctx.lineTo(x - s / 2, y - s / 3); ctx.closePath(); ctx.fill();
}
function drawBombIcon(x: number, y: number, s: number): void {
  rr(x - s / 2, y - s / 4, s, s / 2, 4, '#3a3f47', '#111', 2);
  ctx.fillStyle = '#c94f3c'; for (let k = 0; k < 3; k++) ctx.fillRect(x - s / 2 + 3 + k * s / 3.2, y - s / 4 + 3, s / 4, s / 2 - 6);
  ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + s / 3, y - s / 4); ctx.quadraticCurveTo(x + s / 2, y - s / 2, x + s * 0.65, y - s * 0.45); ctx.stroke();
}
function drawArrow(x: number, y: number, yaw: number, s: number, c: string): void { // a pointed marker for the minimap: the nose shows where they face
  const fx = -Math.sin(yaw), fy = -Math.cos(yaw);
  ctx.fillStyle = c; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + fx * s, y + fy * s);
  ctx.lineTo(x - fx * s * 0.6 - fy * s * 0.7, y - fy * s * 0.6 + fx * s * 0.7);
  ctx.lineTo(x - fx * s * 0.25, y - fy * s * 0.25);
  ctx.lineTo(x - fx * s * 0.6 + fy * s * 0.7, y - fy * s * 0.6 - fx * s * 0.7);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
/** An on-screen marker for the planted bomb (both sides) or the dropped bomb (attackers), held at the screen edge when out of view. */
function drawBombMarker(b: Loose, mySide: string): void {
  if (!(b.state === 'planted' || (b.state === 'dropped' && mySide === 'att'))) return;
  if (state.phase === 'post') return;
  _v.set(b.x, 1.8, b.z).project(camera);
  let x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
  const behind = _v.z > 1;
  if (behind) { x = W - x; y = H - y; }
  const edge = behind || x < 60 || x > W - 60 || y < 110 || y > H - 120;
  x = Math.max(60, Math.min(W - 60, x)); y = Math.max(110, Math.min(H - 120, behind ? H - 120 : y));
  const d = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
  const col = b.state === 'planted' ? (b.panicT > 0 ? '#ff3a2a' : '#ff6a4a') : '#ffb030';
  ctx.globalAlpha = edge ? 0.85 : 1;
  rr(x - 44, y - 40, 88, 64, 10, 'rgba(15,20,32,0.82)', col, 3);
  drawBombIcon(x, y - 20, 30);
  text(`${b.state === 'planted' ? 'BOMB ' + (b.site || '') : 'BOMB'}`, x, y + 2, 15, col);
  text(`${Math.round(d)} m`, x, y + 16, 14, '#fff', 'center', 'normal');
  ctx.globalAlpha = 1;
}
const MINIMAP_W = 180, MINIMAP_H = 120; // the minimap's box in pixels; any map is scaled to fit it
function drawMinimap(x0: number, y0: number): void {
  const k = Math.min(MINIMAP_W / MW, MINIMAP_H / MH), px = (c: number): number => Math.floor(c * k); // whole pixels: no seams
  rr(x0 - 6, y0 - 6, MW * k + 12, MH * k + 12, 8, 'rgba(15,20,32,0.72)', null);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y);
    if (!grid[i]) continue;
    ctx.fillStyle = grid[i] === 2 ? '#8a6a44' : zone[i] === 1 ? '#c98a50' : zone[i] === 2 ? '#5ea79e' : zone[i] >= 3 ? '#b49a6c' : '#cbbd9c';
    ctx.fillRect(x0 + px(x), y0 + px(y), px(x + 1) - px(x), px(y + 1) - px(y));
  }
  text('A', x0 + (SITE.A.cx + 0.5) * k, y0 + (SITE.A.cy + 0.5) * k, 16, '#a3241a');
  text('B', x0 + (SITE.B.cx + 0.5) * k, y0 + (SITE.B.cy + 0.5) * k, 16, '#a3241a');
  const me = state.human, b = state.bomb;
  if (b.state === 'planted' || b.state === 'dropped' || (b.state === 'carried' && sideOf(me) === 'att' && b.carrier && !b.carrier.human)) {
    if (b.state !== 'carried' || sideOf(me) === 'att') drawBombIcon(x0 + b.x / CELL * k, y0 + b.z / CELL * k, 12);
  }
  for (const p of state.players) {
    if (!p.alive) continue;
    const mine = p.squad === me.squad;
    if (!mine && state.t - p.spotT > 1.5) continue;
    drawArrow(x0 + p.x / CELL * k, y0 + p.z / CELL * k, p.yaw, p.human ? 6 : 5, p.human ? '#ffffff' : SIDE_CSS[sideOf(p)]);
  }
}
function drawHUD(paused?: boolean): void {
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  const p = state.human, b = state.bomb, mySide = sideOf(p);
  if (p.alive && p.scoped) { // scope: dark all around a clear round lens
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, 300, 0, Math.PI * 2, true); ctx.fill();
    ctx.strokeStyle = '#05070a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 300, H / 2); ctx.lineTo(W / 2 + 300, H / 2);
    ctx.moveTo(W / 2, H / 2 - 300); ctx.lineTo(W / 2, H / 2 + 300); ctx.stroke();
  }
  if (state.flashT > 0) { ctx.fillStyle = `rgba(200,30,20,${state.flashT * 0.6})`; ctx.fillRect(0, 0, W, H); }
  if (state.boomT > 0) { ctx.fillStyle = `rgba(255,220,160,${state.boomT * 0.6})`; ctx.fillRect(0, 0, W, H); }
  // teammates' names over their heads
  for (const q of state.players) {
    if (q.human || !q.alive || q.squad !== p.squad || q === state.specP && !p.alive) continue;
    if (!losClear(camera.position.x, camera.position.z, q.x, q.z)) continue;
    const s = project(q.x, 2.25, q.z);
    if (!s || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
    const tag = `${q.name} (${ROLE_NAME[q.role]})`; ctx.font = `bold 14px ${FONT}`;
    const tw = ctx.measureText(tag).width + 14; rr(s.x - tw / 2, s.y - 11, tw, 22, 6, "rgba(15,20,32,0.75)", null);
    text(tag, s.x, s.y, 14, SIDE_CSS[sideOf(q)]);
  }
  // a bot defusing: its bar stalls while it thinks
  if (b.state === 'planted' && b.defuser && !b.defuser.human) {
    const s = project(b.x, 1.4, b.z), d = b.defuser;
    if (s && losClear(camera.position.x, camera.position.z, b.x, b.z)) {
      const k = d.defuseRight / tune.defuse_answers;
      rr(s.x - 70, s.y - 12, 140, 22, 6, 'rgba(10,14,24,0.8)', null);
      rr(s.x - 66, s.y - 8, 132 * k, 14, 4, SIDE_CSS.def, null);
      text(`${d.name}: pensando…`, s.x, s.y - 26, 15, '#fff');
    }
  }
  drawBombMarker(b, mySide);
  drawMinimap(22, 22);
  // score and timer, top centre
  const theirSide = mySide === 'att' ? 'def' : 'att';
  rr(W / 2 - 230, 12, 460, 64, 12, 'rgba(15,20,32,0.78)', null);
  text(`${state.score[p.squad]}`, W / 2 - 90, 44, 38, SIDE_CSS[mySide]);
  text(`${state.score[1 - p.squad]}`, W / 2 + 90, 44, 38, SIDE_CSS[theirSide]);
  text(mySide === 'att' ? 'Tú: ATAQUE' : 'Tú: DEFENSA', W / 2 - 175, 44, 16, SIDE_CSS[mySide]);
  text('Rivales', W / 2 + 175, 44, 16, SIDE_CSS[theirSide]);
  if (b.state === 'planted') { drawBombIcon(W / 2 - 34, 36, 24); text(fmtTime(b.timer), W / 2 + 14, 36, 28, b.panicT > 0 ? '#ff5a4a' : '#ff9a7a'); }
  else text(state.phase === 'buy' ? fmtTime(state.phaseT) : fmtTime(state.roundT), W / 2, 36, 28, state.phase === 'buy' ? '#ffe28a' : '#ffffff');
  text(state.phase === 'buy' ? 'TIEMPO DE COMPRA' : `Ronda ${state.round}  |  Primero a ${tune.rounds_to_win}`, W / 2, 62, 14, '#c8d2e6');
  // kill feed
  state.feed.forEach((f, i) => {
    ctx.font = `bold 16px ${FONT}`; const w = ctx.measureText(f.s).width + 24;
    rr(W - 18 - w, 18 + i * 32, w, 26, 6, f.mine ? 'rgba(120,30,20,0.8)' : 'rgba(15,20,32,0.72)', null);
    text(f.s, W - 18 - w / 2, 31 + i * 32, 16, '#fff');
  });
  // hurt direction
  for (const h of state.hurt) {
    const a = -angDiff(h.yaw, p.yaw) - Math.PI / 2;
    ctx.strokeStyle = `rgba(230,40,30,${Math.min(1, h.t) * 0.9})`; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 170, a - 0.32, a + 0.32); ctx.stroke();
  }
  if (p.alive) {
    // crosshair and hit marker
    if (!p.scoped && !uiOpen()) {
      const gap = 6 + humanSpread(p) * 300;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      for (const [dx, dy, w, h] of [[-gap - 12, -1.5, 12, 3], [gap, -1.5, 12, 3], [-1.5, -gap - 12, 3, 12], [-1.5, gap, 3, 12]]) {
        ctx.fillRect(W / 2 + dx, H / 2 + dy, w, h); ctx.strokeRect(W / 2 + dx, H / 2 + dy, w, h);
      }
    }
    if (state.hitT > 0 || state.killT > 0) {
      const big = state.killT > 0, r = big ? 18 : 12;
      ctx.strokeStyle = big ? '#ff4a3a' : '#ffffff'; ctx.lineWidth = big ? 4 : 3; ctx.beginPath();
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ctx.moveTo(W / 2 + sx * 6, H / 2 + sy * 6); ctx.lineTo(W / 2 + sx * r, H / 2 + sy * r); }
      ctx.stroke();
    }
    // health, armour, money, ammo
    rr(18, H - 82, 300, 64, 12, 'rgba(15,20,32,0.78)', null);
    drawCross(48, H - 50, 28, '#ff6a5a'); text(`${Math.ceil(p.hp)}`, 98, H - 50, 32, '#fff');
    drawShield(160, H - 50, 28, p.armor > 0 ? '#7fb8ff' : '#55606e'); text(`${Math.ceil(p.armor)}`, 210, H - 50, 32, p.armor > 0 ? '#fff' : '#8893a3');
    text(`$${p.money}`, 280, H - 50, 22, '#9ff08a', 'center');
    const a = p.ammo[p.cur];
    rr(W - 290, H - 82, 272, 64, 12, 'rgba(15,20,32,0.78)', null);
    text(WEAPON[p.cur].name, W - 270, H - 50, 20, '#c8d2e6', 'left');
    text(p.reloadT > 0 ? 'Recargando' : `${a.mag} / ${a.res}`, W - 34, H - 50, 30, a.mag === 0 ? '#ff6a5a' : '#fff', 'right');
    // stance: a drawn figure and its word, above the health box, only when not just standing
    const word = me.proneT > 0 || me.stance === 'prone' ? 'tumbado' : me.stance === 'crouch' ? 'agachado' : me.sprint ? 'corriendo' : '';
    if (word) {
      rr(18, H - 136, 176, 44, 10, 'rgba(15,20,32,0.78)', null);
      const fx = 46, fy = H - 114;
      ctx.strokeStyle = '#ffe7a8'; ctx.fillStyle = '#ffe7a8'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
      if (word === 'tumbado') { ctx.arc(fx - 16, fy + 6, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx - 11, fy + 7); ctx.lineTo(fx + 18, fy + 9); ctx.moveTo(fx - 4, fy + 8); ctx.lineTo(fx + 4, fy + 2); }
      else if (word === 'agachado') { ctx.arc(fx, fy - 10, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx, fy - 5); ctx.lineTo(fx - 3, fy + 4); ctx.lineTo(fx + 6, fy + 8); ctx.lineTo(fx + 2, fy + 14); ctx.moveTo(fx - 3, fy + 4); ctx.lineTo(fx - 8, fy + 14); }
      else { ctx.arc(fx + 4, fy - 14, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx + 2, fy - 9); ctx.lineTo(fx - 2, fy + 3); ctx.lineTo(fx - 10, fy + 14); ctx.moveTo(fx - 2, fy + 3); ctx.lineTo(fx + 8, fy + 8); ctx.lineTo(fx + 6, fy + 14); ctx.moveTo(fx, fy - 4); ctx.lineTo(fx + 10, fy - 2); }
      ctx.stroke(); ctx.lineCap = 'butt';
      text(word, 74, H - 114, 18, '#ffe7a8', 'left');
      if (me.proneT > 0) rr(74, H - 101, 104 * (1 - me.proneT / tune.prone_time), 4, 2, '#ffd06a', null);
    }
    if (b.carrier === p) { rr(W - 290, H - 142, 160, 48, 10, 'rgba(15,20,32,0.78)', null); drawBombIcon(W - 256, H - 118, 30); text('Bomba', W - 182, H - 118, 18, '#ffd06a'); }
  } else {
    const sp = state.specP;
    rr(W / 2 - 280, H - 92, 560, 64, 12, 'rgba(15,20,32,0.78)', null);
    text('Has caído', W / 2, H - 74, 20, '#ff8a7a');
    text(sp ? `Viendo a ${sp.name} (${ROLE_NAME[sp.role]}). Clic o Espacio para el siguiente` : 'Espera a la siguiente ronda', W / 2, H - 46, 16, '#fff');
  }
  // the one hint that matters now
  let hint = '';
  if (p.alive && !uiOpen()) {
    const z = zone[idx(cellOf(p.x), cellOf(p.z))];
    if (state.phase === 'buy') hint = inOwnBase(p) ? `Pulsa ${keyName(bind.buy)} para comprar. Las puertas se abren en ${Math.ceil(state.phaseT)} s` : '';
    else if (b.carrier === p && (z === 3 || z === 4)) hint = `Mantén ${keyName(bind.use)} para plantar la bomba`;
    else if (b.carrier === p) hint = 'Llevas la bomba: plántala en la A o la B grandes';
    else if (b.state === 'planted' && mySide === 'def' && Math.hypot(p.x - b.x, p.z - b.z) < 2) hint = `Pulsa ${keyName(bind.use)} para desactivar: ¡responde la pregunta!`;
    else if (b.state === 'planted' && mySide === 'def') hint = `¡Desactiva la bomba en ${b.site}!`;
    else if (b.state === 'dropped' && mySide === 'att') hint = 'Recoge la bomba del suelo (mira el mapa)';
    if (!locked && !CHEAP && state.phase !== 'post') hint = hint ? hint + '   |   Clic para apuntar' : 'Haz clic para apuntar con el ratón';
  }
  if (hint) {
    const pulse = state.round === 1 && state.phase === 'buy' ? 0.75 + 0.25 * Math.sin(state.t * 6) : 1;
    ctx.globalAlpha = pulse; ctx.font = `bold 22px ${FONT}`;
    const w = ctx.measureText(hint).width + 40;
    rr(W / 2 - w / 2, H - 160, w, 44, 10, 'rgba(15,20,32,0.8)', '#ffd06a', 2);
    text(hint, W / 2, H - 138, 22, '#ffe7a8'); ctx.globalAlpha = 1;
  }
  if (state.plantT > 0) {
    const k = state.plantT / tune.plant_time;
    rr(W / 2 - 160, H / 2 + 60, 320, 26, 8, 'rgba(15,20,32,0.85)', null);
    rr(W / 2 - 156, H / 2 + 64, 312 * k, 18, 6, SIDE_CSS.att, null);
    text('Plantando…', W / 2, H / 2 + 104, 18, '#fff');
  }
  if (state.msgT > 0 && !state.banner) {
    ctx.globalAlpha = Math.min(1, state.msgT);
    ctx.font = `bold 26px ${FONT}`; const w = ctx.measureText(state.msg).width + 48;
    rr(W / 2 - w / 2, 96, w, 46, 10, 'rgba(15,20,32,0.8)', null);
    text(state.msg, W / 2, 119, 26, '#fff'); ctx.globalAlpha = 1;
  }
  if (state.banner) {
    rr(W / 2 - 330, 150, 660, 120, 16, 'rgba(15,20,32,0.88)', state.banner.mine ? '#7fe07a' : '#ff7a6a', 4);
    text(state.banner.text, W / 2, 192, 36, state.banner.mine ? '#9ff08a' : '#ff9a8a');
    text(state.banner.reason, W / 2, 238, 20, '#e8eef8');
  }
  if (!paused) { if (state.menu && !state.card) drawShop(); if (state.card) drawCard(); }
}
function drawShop() {
  const p = state.human, x = W / 2 - 330, y = 120, w = 660;
  rr(x, y, w, 440, 16, 'rgba(14,19,30,0.94)', '#ffd06a', 3);
  text('MENÚ DE COMPRA', x + 28, y + 36, 28, '#ffd06a', 'left');
  text(`$${p.money}`, x + w - 28, y + 36, 28, '#9ff08a', 'right');
  text('Cada objeto hace una pregunta. Responde bien para conseguirlo.', x + 28, y + 72, 17, '#c8d2e6', 'left', 'normal');
  SHOP.forEach((it, i) => {
    const by = y + 96 + i * 62, why = shopBlock(p, it);
    button(x + 24, by, w - 48, 54, '', why ? null : 'buy:' + it.id, { fill: why ? '#1b2232' : undefined });
    rr(x + 36, by + 11, 32, 32, 8, '#ffd06a', null); text(String(i + 1), x + 52, by + 27, 20, '#1b2232');
    text(it.name, x + 84, by + 18, 21, why ? '#7d8799' : '#fff', 'left');
    text(it.desc, x + 84, by + 40, 15, why ? '#6a7383' : '#c8d2e6', 'left', 'normal');
    text(why || `$${tune[it.price]}`, x + w - 44, by + 20, 20, why ? '#ff9a8a' : '#9ff08a', 'right');
    const ql = questionLevel(it.id); // the level of the item's question (none for a custom CSV)
    if (ql) text(`pregunta ${QUESTIONS.LEVEL_NAMES[ql]}`, x + w - 44, by + 42, 14, why ? '#aab4c8' : '#c8d2e6', 'right', 'normal');
  });
  text(`1-5 o clic para elegir  |  ${keyName(bind.buy)} para cerrar`, x + w / 2, y + 418, 16, '#c8d2e6', 'center', 'normal');
}
/** Draws a right/wrong mark with canvas paths (never a font symbol): a check when ok, else a cross, centred on (x, y), s wide. */
function drawVerdict(ok: boolean, x: number, y: number, s: number, c: string): void {
  ctx.strokeStyle = c; ctx.lineWidth = Math.max(3, s * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (ok) { ctx.moveTo(x - s * 0.4, y); ctx.lineTo(x - s * 0.12, y + s * 0.3); ctx.lineTo(x + s * 0.42, y - s * 0.32); }
  else { ctx.moveTo(x - s * 0.32, y - s * 0.32); ctx.lineTo(x + s * 0.32, y + s * 0.32); ctx.moveTo(x + s * 0.32, y - s * 0.32); ctx.lineTo(x - s * 0.32, y + s * 0.32); }
  ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}
function drawCard() {
  const c = state.card, q = c.q;
  const shake = c.wrongT > 0 ? Math.sin(c.wrongT * 60) * 10 * (c.wrongT / c.wrongTotal) : 0;
  const w = 820, h = 352, x = W / 2 - w / 2 + shake, y = H - h - 100 + (1 - c.anim) * 300;
  const defuse = c.kind === 'defuse', it = SHOP.find(s => s.id === c.item);
  const edge = c.okT > 0 ? '#7fe07a' : c.wrongT > 0 ? '#ff5a4a' : defuse ? '#ff7a5a' : '#ffd06a';
  rr(x, y, w, h, 18, 'rgba(250,248,240,0.97)', edge, 6);
  // The header: what the card is for; on a defuse it carries the bomb timer, so the card never hides it.
  const head = defuse || !it ? `DESACTIVAR LA BOMBA  |  ${fmtTime(state.bomb.timer)}` : `COMPRAR ${it.name.toUpperCase()}  |  $${tune[it.price]}`;
  rr(x + 18, y + 16, w - 36, 42, 10, defuse ? '#b8321f' : '#26324a', null);
  text(head, x + 36, y + 37, 22, '#fff', 'left');
  ctx.font = `bold 22px ${FONT}`;
  const tag = c.level ? `${q.topic}  ·  ${QUESTIONS.LEVEL_NAMES[c.level as Level]}` : q.topic;
  text(clip(tag, w - 96 - ctx.measureText(head).width, 16, 'normal'), x + w - 36, y + 37, 16, '#e4e9f4', 'right', 'normal');
  // The question: up to 3 lines, shrinking to 18 px; anything longer is cut with "…" (GDD Edge Cases).
  let size = 30, lines = wrapText(q.q, w - 80, size);
  while (lines.length > 3 && size > 18) { size -= 2; lines = wrapText(q.q, w - 80, size); }
  if (lines.length > 3) lines = [lines[0], lines[1], clip(lines.slice(2).join(' '), w - 80, size)];
  lines.forEach((l, i) => text(l, W / 2 + shake, y + 92 + i * (size + 6) + (3 - lines.length) * 10, size, '#141a28'));
  const bw = (w - 60) / 2, bh = 62;
  q.choices.forEach((ch: string, i: number) => {
    const bx = x + 20 + (i % 2) * (bw + 20), by = y + 176 + Math.floor(i / 2) * (bh + 12);
    const right = c.picked === i && c.okT > 0, wrong = c.picked === i && c.wrongT > 0;
    let fill = '#e9edf5', col = '#141a28';
    if (right) fill = '#5cc85a'; // dark text on the green: white on it is under 3:1
    if (wrong) { fill = '#e04a3a'; col = '#fff'; }
    const hover = mouse.x >= bx && mouse.x <= bx + bw && mouse.y >= by && mouse.y <= by + bh;
    rr(bx, by, bw, bh, 12, hover && c.picked < 0 ? '#dbe3f2' : fill, '#26324a', 2);
    rr(bx + 12, by + 13, 36, 36, 8, '#26324a', null);
    if (right || wrong) drawVerdict(right, bx + 30, by + 31, 22, '#fff'); // the badge's number becomes the mark
    else text(String(i + 1), bx + 30, by + 31, 22, '#fff');
    let fs = 22; ctx.font = `bold ${fs}px ${FONT}`;
    while (ctx.measureText(ch).width > bw - 80 && fs > 14) { fs--; ctx.font = `bold ${fs}px ${FONT}`; }
    text(clip(ch, bw - 80, fs), bx + 62, by + 31, fs, col, 'left');
    if (c.picked < 0) buttons.push({ x: bx, y: by, w: bw, h: bh, act: 'ans:' + i });
  });
  const fy = y + h - 20;
  if (c.wrongT > 0 || c.okT > 0) { // the verdict in words and a drawn mark, never colour alone
    const ok = c.okT > 0, msg = ok ? '¡Correcto!' : 'Incorrecto: ahora viene otra pregunta…', col = ok ? '#24702a' : '#b8321f';
    ctx.font = `bold 18px ${FONT}`;
    const sx = W / 2 + shake - (ctx.measureText(msg).width + 30) / 2;
    drawVerdict(ok, sx + 10, fy, 20, col);
    text(msg, sx + 30, fy, 18, col, 'left');
  } else {
    const hint = defuse ? `1-4 o clic para responder  |  ${keyName(bind.use)} para alejarte${tune.defuse_answers > 1 ? `  |  ${c.got}/${tune.defuse_answers} correctas` : ''}`
      : `1-4 o clic para responder  |  ${keyName(bind.buy)} para cancelar`;
    text(hint, W / 2 + shake, fy, 16, '#3a465e', 'center', 'normal');
  }
  // The lockout bar under the card: it empties over the lockout, so the player sees why presses are ignored.
  if (c.wrongT > 0) {
    rr(x + 20, y + h + 8, w - 40, 8, 4, 'rgba(14,19,30,0.85)', null);
    rr(x + 20, y + h + 8, (w - 40) * Math.max(0, c.wrongT / c.wrongTotal), 8, 4, '#ff5a4a', null);
  }
}

// ---- Drawing: the session screen, results and figures -------------------------------------
function flyover() {
  const a = titleT * 0.06, [rx, rz, fy] = MAP.view.flyover;
  camera.position.set(MW * CELL / 2 + Math.cos(a) * rx, fy, MH * CELL / 2 + Math.sin(a) * rz);
  camera.lookAt(MW * CELL / 2, 0, MH * CELL / 2);
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  for (const g of Object.values(viewGuns)) g.group.visible = false;
  renderer.clear(); renderer.render(world, camera);
}
function drawTitle() {
  flyover();
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.font = `bold 76px ${FONT}`;
  const tw1 = ctx.measureText('SOLVE ').width, tw2 = ctx.measureText('OR ').width, tw3 = ctx.measureText('BOOM').width;
  let tx = W / 2 - (tw1 + tw2 + tw3) / 2;
  text('SOLVE', tx, 74, 76, SIDE_CSS.def, 'left'); tx += tw1;
  text('OR', tx, 74, 76, '#ffffff', 'left'); tx += tw2;
  text('BOOM', tx, 74, 76, SIDE_CSS.att, 'left');
  text('Responde bien para comprar tus armas. Responde bien para desactivar la bomba.', W / 2, 132, 22, '#f2f5fb');
  button(1060, 24, 180, 48, 'Controles', 'controls', { size: 22 });
  const custom = session.subject === QUESTIONS.CUSTOM;
  // 1. subject
  rr(40, 170, 330, 400, 16, 'rgba(14,19,30,0.9)', null);
  text('1. Asignatura', 64, 200, 24, '#ffd06a', 'left');
  SUBJECT_LIST.forEach((s, i) => {
    const on = session.subject === s;
    const label = s === QUESTIONS.CUSTOM ? QUESTIONS.CUSTOM_NAME + ' (CSV)' : QUESTIONS.SUBJECTS[s].name;
    button(60, 222 + i * 58, 290, 48, label, 'subj:' + s, { align: 'left', fill: on ? '#ffd06a' : undefined, color: on ? '#1b2232' : '#fff' });
  });
  text('Arriba / Abajo: asignatura', 205, 530, 15, '#aab4c8', 'center', 'normal');
  text('Izquierda / Derecha: nivel', 205, 552, 15, '#aab4c8', 'center', 'normal');
  // 2. contents: the level, then the topics (or the custom file), then what that choice gives
  rr(390, 170, 450, 400, 16, 'rgba(14,19,30,0.9)', null);
  text('2. Contenido', 414, 200, 24, '#ffd06a', 'left');
  text('Nivel', 414, 242, 18, custom ? '#8a93a3' : '#fff', 'left');
  LEVELS.forEach((l, k) => {
    const on = !custom && session.level === l;
    button(482 + k * 112, 222, 104, 40, QUESTIONS.LEVEL_NAMES[l], custom ? null : 'level:' + l,
      { size: 18, fill: custom ? '#1b2232' : on ? '#ffd06a' : undefined, color: custom ? '#8a93a3' : on ? '#1b2232' : '#fff', stroke: on ? '#fff3c4' : undefined });
  });
  if (custom) {
    text('Un CSV propio no usa el nivel.', 414, 282, 15, '#aab4c8', 'left', 'normal');
    if (session.custom.length) {
      text(clip(session.customName, 400, 18), 414, 316, 18, '#9ff08a', 'left');
      session.custom.slice(0, 4).forEach((c, i) => text(clip(`${i + 1}. ${c.q}`, 400, 16, 'normal'), 414, 348 + i * 28, 16, '#c8d2e6', 'left', 'normal'));
    } else {
      wrapText('Todavía no hay archivo. Sube un CSV con el botón de la derecha o suelta el archivo en esta ventana.', 400, 18)
        .forEach((l, i) => text(l, 414, 318 + i * 26, 18, '#fff', 'left', 'normal'));
    }
    if (session.custom.length > 0 && session.custom.length < 4) text('Pocas preguntas: se repetirán', 615, 556, 16, '#ffb366');
  } else {
    const subj = QUESTIONS.SUBJECTS[session.subject];
    Object.entries(subj.topics).forEach(([id, name], i) => {
      const on = session.topics[session.subject].includes(id), by = 274 + i * 50;
      button(410, by, 410, 44, '', 'topic:' + id, {});
      rr(424, by + 8, 28, 28, 6, on ? '#ffd06a' : '#0d1220', '#ffd06a', 2);
      if (on) { ctx.strokeStyle = '#1b2232'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(430, by + 22); ctx.lineTo(436, by + 29); ctx.lineTo(447, by + 14); ctx.stroke(); }
      text(name, 466, by + 22, 19, on ? '#fff' : '#8893a3', 'left');
      text(String(i + 1), 800, by + 22, 15, '#aab4c8', 'right', 'normal');
    });
  }
  const n = session.available;
  text(n === null ? 'Las preguntas de matemáticas se generan sin límite' : n === 1 ? '1 pregunta disponible' : `${n} preguntas disponibles`,
    615, 532, 16, '#e4e9f4');
  // 3. your own questions
  rr(860, 170, 380, 400, 16, 'rgba(14,19,30,0.9)', null);
  text('Tus preguntas', 884, 200, 24, '#ffd06a', 'left');
  button(880, 222, 340, 50, 'Subir CSV (U)', 'upload', { size: 22 });
  // The accepted shapes: a format line is bold blue and never wraps (it has no spaces), so the long one is split by hand.
  const help: [string, boolean][] = [['Una pregunta por fila, en una de estas formas:', false], ['pregunta,respuesta', true],
    ['pregunta,correcta,incorrecta,', true], ['   incorrecta,incorrecta[,nivel]', true], ['pregunta,a,b,c,d,N  (N = la correcta)', true],
    ['Separador: coma, punto y coma o tabulador.', false], ['Con 2 columnas, las incorrectas salen de las respuestas de otras filas.', false],
    ['También puedes soltar el archivo en la ventana.', false]];
  let hy = 292;
  for (const [s, fmt] of help) for (const l of fmt ? [s] : wrapText(s, 336, 15)) {
    text(l, 884, hy, 15, fmt ? '#9fd8ff' : '#e4e9f4', 'left', fmt ? 'bold' : 'normal'); hy += 20;
  }
  if (session.status) wrapText(session.status, 336, 16).slice(0, 2).forEach((l, i) => text(clip(l, 336, 16), 884, 506 + i * 22, 16, '#ffe28a', 'left'));
  if (session.skipped > 0) text(session.skipped === 1 ? '1 fila omitida' : `${session.skipped} filas omitidas`, 884, 552, 16, '#ffb38a', 'left');
  // 4. the map: a button each, with its size; the chosen one lit
  rr(40, 584, 760, 80, 16, 'rgba(14,19,30,0.9)', null);
  text('Mapa', 60, 612, 24, '#ffd06a', 'left');
  text('Tecla C', 60, 642, 15, '#aab4c8', 'left', 'normal');
  MAP_IDS.forEach((id, i) => {
    const on = session.map === id, m = MAPS[id], bx = 160 + i * 158;
    button(bx, 592, 150, 64, '', 'map:' + id, { fill: on ? '#ffd06a' : undefined, stroke: on ? '#fff3c4' : undefined });
    text(m.name, bx + 75, 614, 20, on ? '#1b2232' : '#fff');
    text(`${m.width * CELL} x ${m.height * CELL} m`, bx + 75, 640, 15, on ? '#1b2232' : '#c8d2e6', 'center', 'normal');
  });
  // start
  button(820, 592, 420, 64, 'Empezar partida (Enter)', 'start', { size: 26, fill: '#e07a1c', stroke: '#7a3a08' });
  const move = [bind.forward, bind.left, bind.back, bind.right].map(keyName), k = (id: string): string => keyName(bind[id]);
  const line = `${move.every(m => m.length === 1) ? move.join('') : move.join('/')} mover  |  Ratón apuntar  |  Clic disparar  |  ${k('reload')} recargar  |  ${k('buy')} comprar  |  1-4 responder  |  ${k('use')} plantar o desactivar  |  ${k('pause')} pausa  |  ${k('mute')} silencio`;
  let ls = 16; ctx.font = `normal ${ls}px ${FONT}`;
  while (ctx.measureText(line).width > W - 40 && ls > 14) { ls--; ctx.font = `normal ${ls}px ${FONT}`; }
  text(clip(line, W - 40, ls, 'normal'), W / 2, 684, ls, '#e4e9f4', 'center', 'normal');
  text(`Tú y 3 compañeros bot contra 4 bots rivales. Gana quien llegue a ${tune.rounds_to_win} rondas; en el descanso se cambia de lado.`, W / 2, 708, 15, '#aab4c8', 'center', 'normal');
}
function drawResults() {
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.75)'; ctx.fillRect(0, 0, W, H);
  const won = state.score[0] > state.score[1];
  text(state.gained, W / 2, 80, 48, won ? '#9ff08a' : '#ff9a8a');
  text(state.answered || '', W / 2, 132, 22, '#fff');
  text(state.subjectLabel || '', W / 2, 164, 17, '#c8d2e6', 'center', 'normal');
  const cols: [string, number, CanvasTextAlign][] = [['Jugador', 300, 'left'], ['Equipo', 560, 'center'], ['Bajas', 680, 'center'], ['Muertes', 780, 'center'], ['Bien', 880, 'center'], ['Mal', 980, 'center']];
  rr(260, 196, 760, 380, 14, 'rgba(14,19,30,0.92)', null);
  cols.forEach(([n, x, a]) => text(n, x, 224, 18, '#ffd06a', a));
  [...state.players].sort((a, b) => a.squad - b.squad || b.kills - a.kills).forEach((p, i) => {
    const y = 262 + i * 38;
    if (p.human) rr(276, y - 16, 728, 32, 8, 'rgba(255,208,106,0.18)', null);
    const vals = [`${p.name}${p.human ? '' : ' (' + ROLE_NAME[p.role] + ')'}`, squadName(p.squad), p.kills, p.deaths, p.right, p.wrong];
    vals.forEach((v, k) => text(String(v), cols[k][1], y, 18, k === 4 ? '#9ff08a' : k === 5 ? '#ff9a8a' : '#fff', cols[k][2], k === 0 && p.human ? 'bold' : 'normal'));
  });
  button(W / 2 - 220, 600, 440, 62, 'Volver a la pantalla de sesión (Enter)', 'menu', { size: 22 });
}
let figScene: THREE.Scene | null = null, figCam: THREE.PerspectiveCamera | null = null;
const FIG_LINE = [['rusher', 'att'], ['rifleman', 'att'], ['sniper', 'att'], ['rusher', 'def'], ['rifleman', 'def'], ['sniper', 'def'], ['bomb', '']];
function drawFigures() {
  if (!figScene) {
    figScene = new THREE.Scene(); figScene.background = new THREE.Color(0x2a3550);
    figScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6d5c40, 2.2));
    const l = new THREE.DirectionalLight(0xffffff, 2); l.position.set(3, 6, 8); figScene.add(l);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), lam(0xd6c49c)); fl.rotation.x = -Math.PI / 2; figScene.add(fl);
    FIG_LINE.forEach(([role, side], i) => {
      const x = -5.4 + i * 1.8;
      if (role === 'bomb') { const bm = makeBomb(); bm.group.position.set(x, 0, 0); bm.group.scale.setScalar(2.2); bm.group.rotation.y = 0.6; figScene!.add(bm.group); return; }
      const s = makeSoldier(role); s.team.color.setHex(SIDE_HEX[side]); s.group.position.set(x, 0, 0); s.group.rotation.y = -Math.PI / 2 + 0.25; figScene!.add(s.group);
    });
    figCam = new THREE.PerspectiveCamera(42, W / H, 0.1, 100); figCam.position.set(0, 2.2, 10.5); figCam.lookAt(0, 0.95, 0);
  }
  renderer.clear(); renderer.render(figScene, figCam!);
  ctx.clearRect(0, 0, W, H);
  text('Figuras', W / 2, 50, 36, '#fff');
  FIG_LINE.forEach(([role, side], i) => {
    _v.set(-5.4 + i * 1.8, -0.25, 0).project(figCam!);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
    text(role === 'bomb' ? 'Bomba' : ROLE_NAME[role], x, y + 6, 18, '#fff');
    if (side) text(side === 'att' ? 'Ataque' : 'Defensa', x, y + 30, 15, SIDE_CSS[side]);
  });
}

// ---- Loop: fixed step, frame time clamped ---------------------------------------------
function step() {
  if (scene !== 'controls' && pressed(bind.mute)) { setMuted(!isMuted()); hit.delete(bind.mute); }
  scenes[scene].update(STEP); hit.clear();
  if (clicks.length > 4) clicks.length = 0;
}
let last = 0, acc = 0, ALPHA = 1; // ALPHA: how far the frame is between the last two steps
function tick() {
  const now = clock.now();
  acc += Math.min(now - last, 0.25); last = now; // a stall never fast-forwards the game
  while (acc >= STEP) { step(); acc -= STEP; }
  ALPHA = acc / STEP;
  drawFrame();
}
function drawFrame() { scenes[scene].draw(); }
function frame() { tick(); requestAnimationFrame(frame); }
function timer() { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

// ---- What a check can read and drive (?manual=1 stops the loop; players never see it) ----
install({
  get scene() { return scene; },
  get state() { return state; },
  press(code) { hit.add(code); },
  hold(code, on) { on ? down.add(code) : down.delete(code); },
  get events() { return events; },
  step(n = 1, draw = true, alpha = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
});

// A value the panel (dev server) changes is read again: the default map, on the session screen.
addEventListener('tune', e => {
  if ((e as CustomEvent).detail?.key === 'default_map' && scene === 'title') pickMap(String(tune.default_map));
});
useMap(session.map);
reset();
scene = params.get('scene') || 'title';
if (scene === 'play' || scene === 'pause' || scene === 'results') startMatch();
last = clock.now();
if (manual) drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
