// The play screen's 2D layer: the HUD, the minimap, the score table, the buy menu and question card, the pause and
// teacher-pause panels, drawn on the canvas over the 3D view. Moved out of src/main.ts (TD-016, docs/tech-debt-register.md);
// it reads the game's state from main.ts when it draws, never while the modules load.
import * as QUESTIONS from './questions';
import { tune } from './config';
import { type Level, type Loose } from './game/types';
import { CELL, MAP_ID, MH, MW, SITE, cellOf, grid, grid1, hasHeights, idx, levelOfY, losClear, rampAt, zone, zone1 } from './game/map';
import { angDiff, fmtTime } from './game/rules';
import { ROLE_NAME, SHOP, WEAPON, humanSpread, inOwnBase, isDuel, isFfa, isRoam, isWaves, questionLevel, shopBlock, sideOf, uiOpen } from './game/match';
import { buttons, down, mouse } from './input';
import { TOUCH } from './touch';
import { REWARD_NAME, nextReward } from './game/streak';
import { bind, keyName } from './keys';
import { FONT, H, W, button, clip, ctx, rr, text, wrapText } from './screen';
import { CLASS_MODE, ROOM_STATE, _v, aula, locked, project, scoreRows, state, timer } from './main';
import { CHEAP, SIDE_CSS, camera } from './scene3d';

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
/** The minimap's cells as last drawn: the canvas they were drawn on and what they depend on. */
const cellsCache = { canvas: null as HTMLCanvasElement | null, key: '', ox: 0, oy: 0 };
/**
 * The minimap's fixed layer (walls, floors, zones, stairs, the first floor over the ground), which only changes with the
 * map, the mode (Free for All and Duelo show no zones), the level shown and the screen's pixel ratio. It is drawn into a
 * canvas of its own, aligned with the screen's pixels and at the same scale, and only copied each frame (TD-008: it was
 * redrawn cell by cell every frame, both floors).
 */
function drawMinimapCells(x0: number, y0: number, k: number, myLv: number): void {
  const t = ctx.getTransform(), r = t.a, roam = isRoam(state);
  const key = `${MAP_ID}|${roam ? 1 : 0}|${myLv}|${r}|${t.e}|${t.f}|${x0}|${y0}`;
  if (cellsCache.key !== key || !cellsCache.canvas) {
    const ox = Math.floor(t.e + (x0 - 6) * r), oy = Math.floor(t.f + (y0 - 6) * r); // whole device pixels: the cache sits on the screen's grid
    const cv = cellsCache.canvas ?? document.createElement('canvas');
    cv.width = Math.ceil((MW * k + 12) * r) + 2; cv.height = Math.ceil((MH * k + 12) * r) + 2;
    const g = cv.getContext('2d')!;
    g.setTransform(r, 0, 0, r, t.e - ox, t.f - oy); // the same logical coordinates as the screen, shifted to the cache's corner
    const px = (c: number): number => Math.floor(c * k); // whole pixels: no seams
    if (myLv === 1) g.globalAlpha = 0.35; // on the first floor the ground below is dimmed
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y);
      if (!grid[i]) continue;
      const zi = roam ? 0 : zone[i]; // story 021: no bases or sites on the Free for All minimap (024: nor Duelo por equipos)
      g.fillStyle = grid[i] === 2 ? '#8a6a44' : zi === 1 ? '#c98a50' : zi === 2 ? '#5ea79e' : zi >= 3 ? '#b49a6c' : '#cbbd9c';
      if (hasHeights && rampAt(x, y)) g.fillStyle = '#e0b030'; // a stair, either level
      g.fillRect(x0 + px(x), y0 + px(y), px(x + 1) - px(x), px(y + 1) - px(y));
    }
    g.globalAlpha = 1;
    if (hasHeights) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const g1 = grid1[idx(x, y)];
      if (!g1) continue;
      const X = x0 + px(x), Y = y0 + px(y), w = px(x + 1) - px(x), h = px(y + 1) - px(y);
      if (myLv === 1) { g.fillStyle = g1 === 2 ? '#8a6a44' : !roam && zone1[idx(x, y)] >= 3 ? '#b49a6c' : '#e8e2d2'; g.fillRect(X, Y, w, h); }
      else { g.fillStyle = 'rgba(40,50,80,0.35)'; g.fillRect(X, Y, w, h); } // on the ground: the first floor overhead as a shade
    }
    Object.assign(cellsCache, { canvas: cv, key, ox, oy });
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cellsCache.canvas!, cellsCache.ox, cellsCache.oy); ctx.restore();
}
const MINIMAP_W = 180, MINIMAP_H = 120; // the minimap's box in pixels; any map is scaled to fit it
function drawMinimap(x0: number, y0: number): void {
  const k = Math.min(MINIMAP_W / MW, MINIMAP_H / MH), px = (c: number): number => Math.floor(c * k); // whole pixels: no seams
  rr(x0 - 6, y0 - 6, MW * k + 12, MH * k + 12 + (hasHeights ? 20 : 0), 8, 'rgba(15,20,32,0.72)', null);
  const me = state.human, b = state.bomb, view = me.alive || !state.specP ? me : state.specP;
  const myLv = hasHeights ? levelOfY(view.st?.y ?? 0) : 0; // story 012: the level the screen shows from
  drawMinimapCells(x0, y0, k, myLv); // the walls, floors, zones and stairs: drawn once into a cache, redrawn only when they change (TD-008)
  if (!isRoam(state)) for (const S of ['A', 'B'] as const) { // story 021: no A and B in Free for All (024: nor Duelo por equipos)
    const st = SITE[S], other = hasHeights && st.lv !== myLv;
    if (other) ctx.globalAlpha = 0.5;
    text(other ? (st.lv > myLv ? S + '↑' : S + '↓') : S, x0 + (st.cx + 0.5) * k, y0 + (st.cy + 0.5) * k, 16, '#a3241a');
    ctx.globalAlpha = 1;
  }
  const mark = (y: number | undefined, X: number, Y: number): void => { // a marker on the other level: dimmed, with an arrow up or down beside it
    if (!hasHeights) return;
    const lv = levelOfY(y ?? 0);
    if (lv !== myLv) { ctx.globalAlpha = 1; text(lv > myLv ? '↑' : '↓', X + 8, Y - 6, 12, '#ffffff'); ctx.globalAlpha = 0.5; }
  };
  if (b.state === 'planted' || b.state === 'dropped' || (b.state === 'carried' && sideOf(state, me) === 'att' && b.carrier && b.carrier !== me)) {
    if (b.state !== 'carried' || sideOf(state, me) === 'att') { const X = x0 + b.x / CELL * k, Y = y0 + b.z / CELL * k; mark(b.state === 'carried' ? b.carrier?.st?.y : b.y, X, Y); drawBombIcon(X, Y, 12); ctx.globalAlpha = 1; }
  }
  for (const p of state.players) {
    if (!p.alive || p.hidden) continue; // story 021: a hidden player has no dot
    const mine = p.squad === me.squad;
    // Story 018: while your Cazador runs every living enemy shows (the rows carry every player, at any distance), in hunter_color.
    const hunted = !mine && me.alive && me.hunterT > 0;
    if (!mine && !hunted && state.t - p.spotT > 1.5) continue;
    const X = x0 + p.x / CELL * k, Y = y0 + p.z / CELL * k;
    if (p !== view) mark(p.st?.y, X, Y);
    drawArrow(X, Y, p.yaw, p === me ? 6 : 5, p === me ? '#ffffff' : hunted && state.t - p.spotT > 1.5 ? HUNTER_CSS : SIDE_CSS[sideOf(state, p)]);
    ctx.globalAlpha = 1;
  }
  if (hasHeights) text(myLv === 1 ? 'Piso 1' : 'Planta baja', x0 + MW * k / 2, y0 + MH * k + 8, 14, myLv === 1 ? '#ffd06a' : '#e4e9f4');
}
export function drawHUD(paused?: boolean): void {
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  const p = state.human, b = state.bomb, mySide = sideOf(state, p);
  if (p.alive && p.scoped && p.cur === 'sniper') { // scope: dark all around a clear round lens
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, 300, 0, Math.PI * 2, true); ctx.fill();
    ctx.strokeStyle = '#05070a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 300, H / 2); ctx.lineTo(W / 2 + 300, H / 2);
    ctx.moveTo(W / 2, H / 2 - 300); ctx.lineTo(W / 2, H / 2 + 300); ctx.stroke();
  }
  if (state.flashT > 0) { ctx.fillStyle = `rgba(200,30,20,${state.flashT * 0.6})`; ctx.fillRect(0, 0, W, H); }
  if (state.boomT > 0 && 1.2 - state.boomT < tune.fx_boom_screen_time) { ctx.fillStyle = `rgba(255,220,160,${tune.fx_boom_screen_alpha * (1 - (1.2 - state.boomT) / tune.fx_boom_screen_time)})`; ctx.fillRect(0, 0, W, H); } // a short full-screen flash, so the fireball shows after it
  // teammates' names over their heads
  for (const q of state.players) {
    if (q === p || !q.alive || q.hidden || q.squad !== p.squad || q === state.specP && !p.alive) continue;
    if (!losClear(camera.position.x, camera.position.z, q.x, q.z)) continue;
    const s = project(q.x, 2.25, q.z);
    if (!s || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
    const tag = q.human ? q.name : `${q.name} (${ROLE_NAME[q.role]})`; ctx.font = `bold 14px ${FONT}`; // a student has no bot role
    const tw = ctx.measureText(tag).width + 14; rr(s.x - tw / 2, s.y - 11, tw, 22, 6, "rgba(15,20,32,0.75)", null);
    text(tag, s.x, s.y, 14, SIDE_CSS[sideOf(state, q)]);
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
  if (TOUCH) { // story 016: your kills under the minimap, beside the Tabla button (touch.ts places it at logical y 176)
    rr(16, 176, 112, 44, 10, 'rgba(15,20,32,0.78)', null);
    drawSkull(44, 198, 26); text(String(p.kills), 92, 198, 26, '#fff');
  }
  drawStreak(p);
  // score and timer, top centre
  const theirSide = mySide === 'att' ? 'def' : 'att';
  if (isFfa(state)) { // story 019: the clock, your kills and your place
    const place = 1 + state.players.filter(q => q !== p && (q.kills > p.kills || (q.kills === p.kills && q.deaths < p.deaths))).length;
    rr(W / 2 - 230, 12, 460, 64, 12, 'rgba(15,20,32,0.78)', null);
    text(`${p.kills}`, W / 2 - 110, 40, 30, '#fff'); text(p.kills === 1 ? 'baja' : 'bajas', W / 2 - 110, 64, 13, '#c8d2e6', 'center', 'normal');
    text(`${place}º`, W / 2 + 110, 40, 30, place === 1 ? '#ffd06a' : '#fff'); text(`de ${state.players.length}`, W / 2 + 110, 64, 13, '#c8d2e6', 'center', 'normal');
    text(fmtTime(state.roundT), W / 2, 36, 28, state.roundT < 30 ? '#ff9a7a' : '#ffffff');
    text('FREE FOR ALL', W / 2, 62, 14, SIDE_CSS.ffa);
  } else if (isWaves(state)) { // story 025: the wave, the enemies left and the players standing; the pause's clock
    const pause = state.phaseT > 0, left = state.score[0], up = state.score[1];
    rr(W / 2 - 230, 12, 460, 64, 12, 'rgba(15,20,32,0.78)', null);
    text(pause ? `Oleada ${state.round + 1} en ${fmtTime(state.phaseT)}` : `Oleada ${state.round}`, W / 2, 34, 26, pause ? '#ffe28a' : '#fff');
    text(pause ? (state.round > 0 ? `Oleada ${state.round} superada: compra y prepárate` : 'Compra y prepárate') : 'OLEADAS COOPERATIVAS', W / 2, 62, 13, '#c8d2e6');
    text(`${left}`, W / 2 - 170, 40, 34, pause ? '#8a93a3' : '#ff9a8a'); text('enemigos', W / 2 - 170, 64, 12, '#c8d2e6', 'center', 'normal');
    text(`${up}`, W / 2 + 170, 40, 34, '#9ff08a'); text('en pie', W / 2 + 170, 64, 12, '#c8d2e6', 'center', 'normal');
    if (!pause && -state.roundT < tune.waves_notice_time && state.round > 0) { // the wave's notice, fading out
      ctx.globalAlpha = Math.min(1, (tune.waves_notice_time + state.roundT) / 0.8);
      text(`OLEADA ${state.round}`, W / 2, 230, 64, '#ffd06a'); text(`${left} enemigos`, W / 2, 282, 22, '#fff');
      ctx.globalAlpha = 1;
    }
  } else if (isDuel(state)) { // story 024: the teams' kills, yours on the left, and the clock
    rr(W / 2 - 230, 12, 460, 64, 12, 'rgba(15,20,32,0.78)', null);
    text(`${state.score[p.squad]}`, W / 2 - 90, 44, 38, SIDE_CSS[mySide]);
    text(`${state.score[1 - p.squad]}`, W / 2 + 90, 44, 38, SIDE_CSS[theirSide]);
    text(`Equipo ${p.squad + 1}`, W / 2 - 175, 36, 16, SIDE_CSS[mySide]); text('tu equipo', W / 2 - 175, 56, 12, '#c8d2e6', 'center', 'normal');
    text(`Equipo ${2 - p.squad}`, W / 2 + 175, 36, 16, SIDE_CSS[theirSide]); text('rivales', W / 2 + 175, 56, 12, '#c8d2e6', 'center', 'normal');
    text(fmtTime(state.roundT), W / 2, 36, 28, state.roundT < 30 ? '#ff9a7a' : '#ffffff');
    text('DUELO POR EQUIPOS', W / 2, 62, 13, '#c8d2e6');
  } else {
  rr(W / 2 - 230, 12, 460, 64, 12, 'rgba(15,20,32,0.78)', null);
  text(`${state.score[p.squad]}`, W / 2 - 90, 44, 38, SIDE_CSS[mySide]);
  text(`${state.score[1 - p.squad]}`, W / 2 + 90, 44, 38, SIDE_CSS[theirSide]);
  text(mySide === 'att' ? 'Tú: ATAQUE' : 'Tú: DEFENSA', W / 2 - 175, 44, 16, SIDE_CSS[mySide]);
  text('Rivales', W / 2 + 175, 44, 16, SIDE_CSS[theirSide]);
  if (b.state === 'planted') { drawBombIcon(W / 2 - 34, 36, 24); text(fmtTime(b.timer), W / 2 + 14, 36, 28, b.panicT > 0 ? '#ff5a4a' : '#ff9a7a'); }
  else text(state.phase === 'buy' ? fmtTime(state.phaseT) : fmtTime(state.roundT), W / 2, 36, 28, state.phase === 'buy' ? '#ffe28a' : '#ffffff');
  text(state.phase === 'buy' ? 'TIEMPO DE COMPRA' : `Ronda ${state.round}  |  Primero a ${tune.rounds_to_win}`, W / 2, 62, 14, '#c8d2e6');
  }
  // kill feed
  state.feed.forEach((f, i) => {
    ctx.font = `bold 16px ${FONT}`; const w = ctx.measureText(f.s).width + 24;
    rr(W - 18 - w, 18 + i * 32, w, 26, 6, f.mine ? 'rgba(120,30,20,0.8)' : 'rgba(15,20,32,0.72)', null);
    text(f.s, W - 18 - w / 2, 31 + i * 32, 16, '#fff');
    if (f.team === 0 || f.team === 1) { // story 024: the killer's team, in its colour, before the line
      rr(W - 18 - w - 92, 18 + i * 32, 86, 26, 6, SIDE_CSS[f.team === state.attSquad ? 'att' : 'def'], null);
      text(`Equipo ${f.team + 1}`, W - 18 - w - 49, 31 + i * 32, 14, '#1b2232');
    }
  });
  // hurt direction
  for (const h of state.hurt) {
    const a = -angDiff(h.yaw, p.yaw) - Math.PI / 2;
    ctx.strokeStyle = `rgba(230,40,30,${Math.min(1, h.t) * 0.9})`; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 170, a - 0.32, a + 0.32); ctx.stroke();
  }
  if (p.alive) {
    // crosshair and hit marker
    if (!(p.scoped && p.cur === 'sniper') && !uiOpen(state)) {
      const gap = 6 + humanSpread(state, p) * 300;
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
    if (p.medkits > 0) { // story 016: the carried medkits and the control that uses one
      rr(326, H - 82, 96, 64, 12, 'rgba(15,20,32,0.78)', null);
      rr(340, H - 66, 32, 26, 5, '#f2f2ee', null); drawCross(356, H - 53, 18, '#d02020');
      text(`×${p.medkits}`, 398, H - 53, 24, '#fff'); text(TOUCH ? 'Botiquín' : keyName(bind.medkit), 374, H - 30, 13, '#c8d2e6', 'center', 'normal');
    }
    const a = p.ammo[p.cur];
    rr(W - 290, H - 82, 272, 64, 12, 'rgba(15,20,32,0.78)', null);
    text(WEAPON[p.cur].name, W - 270, H - 50, 20, p.cur === 'gold' ? GOLD_CSS : '#c8d2e6', 'left');
    if (a.mag === 0 && a.res === 0) text('Sin balas: golpe', W - 34, H - 50, 22, '#ffb366', 'right'); // story 016: fire strikes
    else text(p.reloadT > 0 ? 'Recargando' : `${a.mag} / ${a.res}`, W - 34, H - 50, 30, a.mag === 0 ? '#ff6a5a' : '#fff', 'right');
    // Story 033: the other carried guns (the pistol and the bought ones not in hand) beside the ammo box: key, name, magazine / reserve.
    if (p.primary) {
      const others = [['pistol', bind.pistol], [p.primary, bind.primary], ...(p.secondary ? [[p.secondary, bind.secondary]] : [])].filter(([g]) => g !== p.cur);
      rr(W - 566, H - 82, 268, 64, 12, 'rgba(15,20,32,0.78)', null);
      others.forEach(([g, k], i) => {
        const o = p.ammo[g], ry = H - 64 + i * 28, col = g === 'gold' ? GOLD_CSS : '#c8d2e6';
        text(`${TOUCH ? '' : keyName(k) + '  '}${WEAPON[g].name}`, W - 552, ry, 17, col, 'left', 'normal');
        text(o ? `${o.mag} / ${o.res}` : '', W - 312, ry, 17, '#fff', 'right', 'normal');
      });
    }
    // stance: a drawn figure and its word, above the health box, only when not just standing
    const word = state.me.proneT > 0 || state.me.stance === 'prone' ? 'tumbado' : state.me.stance === 'crouch' ? 'agachado' : state.me.sprint ? 'corriendo' : '';
    if (word) {
      rr(18, H - 136, 176, 44, 10, 'rgba(15,20,32,0.78)', null);
      const fx = 46, fy = H - 114;
      ctx.strokeStyle = '#ffe7a8'; ctx.fillStyle = '#ffe7a8'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
      if (word === 'tumbado') { ctx.arc(fx - 16, fy + 6, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx - 11, fy + 7); ctx.lineTo(fx + 18, fy + 9); ctx.moveTo(fx - 4, fy + 8); ctx.lineTo(fx + 4, fy + 2); }
      else if (word === 'agachado') { ctx.arc(fx, fy - 10, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx, fy - 5); ctx.lineTo(fx - 3, fy + 4); ctx.lineTo(fx + 6, fy + 8); ctx.lineTo(fx + 2, fy + 14); ctx.moveTo(fx - 3, fy + 4); ctx.lineTo(fx - 8, fy + 14); }
      else { ctx.arc(fx + 4, fy - 14, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx + 2, fy - 9); ctx.lineTo(fx - 2, fy + 3); ctx.lineTo(fx - 10, fy + 14); ctx.moveTo(fx - 2, fy + 3); ctx.lineTo(fx + 8, fy + 8); ctx.lineTo(fx + 6, fy + 14); ctx.moveTo(fx, fy - 4); ctx.lineTo(fx + 10, fy - 2); }
      ctx.stroke(); ctx.lineCap = 'butt';
      text(word, 74, H - 114, 18, '#ffe7a8', 'left');
      if (state.me.proneT > 0) rr(74, H - 101, 104 * (1 - state.me.proneT / tune.prone_time), 4, 2, '#ffd06a', null);
    }
    if (b.carrier === p) { rr(W - 290, H - 142, 160, 48, 10, 'rgba(15,20,32,0.78)', null); drawBombIcon(W - 256, H - 118, 30); text('Bomba', W - 182, H - 118, 18, '#ffd06a'); }
  } else if (!(isRoam(state) && state.card)) { // story 019: the respawn card says it all (024: in Duelo por equipos too)
    const sp = state.specP;
    rr(W / 2 - 280, H - 92, 560, 64, 12, 'rgba(15,20,32,0.78)', null);
    text('Has caído', W / 2, H - 74, 20, '#ff8a7a');
    if (isWaves(state)) text(state.phaseT > 0 ? 'Respondiste bien: vuelves cuando empiece la oleada' : 'Espera a que acabe la oleada: responderás una pregunta para volver', W / 2, H - 46, 16, '#fff'); // story 025
    else if (isRoam(state)) text('Responde bien la pregunta para volver a la partida', W / 2, H - 46, 16, '#fff'); // story 019, 024
    else text(sp ? `Viendo a ${sp.human ? sp.name : `${sp.name} (${ROLE_NAME[sp.role]})`}. ${TOUCH ? 'Toca la pantalla para ver al siguiente' : 'Clic o Espacio para el siguiente'}` : 'Espera a la siguiente ronda', W / 2, H - 46, 16, '#fff');
  }
  // the one hint that matters now
  let hint = '';
  if (p.alive && !uiOpen(state)) {
    const z = zone[idx(cellOf(p.x), cellOf(p.z))];
    if (state.phase === 'buy') hint = inOwnBase(state, p) ? `${TOUCH ? 'Toca Comprar' : `Pulsa ${keyName(bind.buy)}`} para comprar. Las puertas se abren en ${Math.ceil(state.phaseT)} s` : '';
    else if (b.carrier === p && (z === 3 || z === 4)) hint = TOUCH ? 'Mantén Plantar para plantar la bomba' : `Mantén ${keyName(bind.use)} para plantar la bomba`;
    else if (b.carrier === p) hint = 'Llevas la bomba: plántala en la A o la B grandes';
    else if (b.state === 'planted' && mySide === 'def' && Math.hypot(p.x - b.x, p.z - b.z) < 2) hint = TOUCH ? 'Toca Desactivar: ¡responde la pregunta!' : `Pulsa ${keyName(bind.use)} para desactivar: ¡responde la pregunta!`;
    else if (b.state === 'planted' && mySide === 'def') hint = `¡Desactiva la bomba en ${b.site}!`;
    else if (b.state === 'dropped' && mySide === 'att') hint = 'Recoge la bomba del suelo (mira el mapa)';
    if (!locked && !TOUCH && !CHEAP && state.phase !== 'post') hint = hint ? hint + '   |   Clic para mirar con el ratón' : 'Haz clic para mirar con el ratón';
  }
  if (hint) {
    const pulse = state.round === 1 && state.phase === 'buy' ? 0.75 + 0.25 * Math.sin(state.t * 6) : 1;
    ctx.globalAlpha = pulse; ctx.font = `bold 22px ${FONT}`;
    const w = ctx.measureText(hint).width + 40;
    rr(W / 2 - w / 2, H - 160, w, 44, 10, 'rgba(15,20,32,0.8)', '#ffd06a', 2);
    text(hint, W / 2, H - 138, 22, '#ffe7a8'); ctx.globalAlpha = 1;
  }
  if (state.plantT > 0 && b.carrier === p) {
    const k = state.plantT / tune.plant_time;
    rr(W / 2 - 160, H / 2 + 60, 320, 26, 8, 'rgba(15,20,32,0.85)', null);
    rr(W / 2 - 156, H / 2 + 64, 312 * k, 18, 6, SIDE_CSS.att, null);
    text('Plantando…', W / 2, H / 2 + 104, 18, '#fff');
  }
  if (p.alive && p.healT > 0) { // a medkit being used: the bar fills over tune.medkit_time
    const k = 1 - p.healT / tune.medkit_time;
    rr(W / 2 - 160, H / 2 + 120, 320, 26, 8, 'rgba(15,20,32,0.85)', null);
    rr(W / 2 - 156, H / 2 + 124, 312 * k, 18, 6, '#5fd36a', null);
    text('Curando…', W / 2, H / 2 + 164, 18, '#fff');
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
  if (CLASS_MODE && aula.retry) { // the connection dropped: the same line as the waiting screen's
    rr(340, 290, 600, 48, 12, '#4a3210', '#ffb366', 2);
    text(aula.retry, W / 2, 314, 20, '#ffe28a');
  }
  if (!paused) { if (state.menu && !state.card) drawShop(); if (state.card) drawCard(); }
  if (!paused && !uiOpen(state) && down.has(bind.scores)) drawScores();
}
/** Story 018 colours as CSS (data/config.json hunter_color, gold_color). */
export const css = (n: number): string => '#' + Math.round(n).toString(16).padStart(6, '0');
const HUNTER_CSS = css(tune.hunter_color), GOLD_CSS = css(tune.gold_color);
/**
 * Story 018: the streak box left of the score (the count, pips up to the next reward, and its name), and under it the kept
 * Cazador with its key or touch button, or while it runs, its time left and a bar. Nothing when the option is off.
 */
function drawStreak(p: Loose): void {
  if (!state.opts.streakRewards || !p.alive) return;
  // One box left of the score, at most 80 px tall so it stays above the message line (y 96): the count and pips to the next
  // reward, the next reward's name, then the Cazador kept (with its key or button) or running (time left and a bar).
  const x = 220, nx = nextReward(p.streak), hunt = p.hunterT > 0, row3 = hunt || p.kept;
  rr(x, 12, 184, row3 ? 80 : 62, 12, 'rgba(15,20,32,0.78)', hunt ? HUNTER_CSS : null, 2);
  text('Racha', x + 14, 28, 15, '#c8d2e6', 'left');
  text(String(p.streak), x + 76, 29, 22, p.streak > 0 ? '#ffd06a' : '#fff', 'left');
  if (nx) {
    const n = Math.min(nx.at, 10); // pips: one per answer up to the next reward (at most 10)
    for (let i = 0; i < n; i++) rr(x + 106 + i * (66 / n), 24, 66 / n - 2, 8, 2, i < p.streak ? '#ffd06a' : '#3a4458', null);
    text(`Siguiente: ${REWARD_NAME[nx.id]} (${nx.at})`, x + 92, 51, 14, nx.id === 'gold' ? GOLD_CSS : '#e4e9f4', 'center', 'normal');
  }
  if (hunt) {
    text(`Cazador ${p.hunterT.toFixed(1)} s`, x + 14, 72, 14, HUNTER_CSS, 'left');
    rr(x + 112, 68, 60 * p.hunterT / tune.hunter_time, 8, 3, HUNTER_CSS, null);
  } else if (p.kept) text(TOUCH ? 'Cazador: toca su botón' : `Cazador: pulsa ${keyName(bind.ability)}`, x + 92, 72, 14, '#ffd06a', 'center');
}
/** The banner over a match the teacher paused: centred, in ROOM_STATE.paused's words and colour. */
export function drawTeacherPause(): void {
  const [words, colour] = ROOM_STATE.paused;
  ctx.fillStyle = 'rgba(12,16,28,0.45)'; ctx.fillRect(0, 0, W, H);
  rr(W / 2 - 300, H / 2 - 70, 600, 140, 18, 'rgba(15,20,32,0.92)', colour, 4);
  text(words, W / 2, H / 2 - 16, 40, colour);
  text('La partida sigue cuando el profesor la reanude.', W / 2, H / 2 + 34, 20, '#e8eef8', 'center', 'normal');
}
/** A small skull for the kill counter (story 016), centred on (x, y), s high: canvas paths, no font symbol. */
function drawSkull(x: number, y: number, s: number): void {
  ctx.fillStyle = '#f2f2ee'; ctx.beginPath(); ctx.arc(x, y - s * 0.1, s * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - s * 0.24, y + s * 0.15, s * 0.48, s * 0.3);
  ctx.fillStyle = '#1b2232'; ctx.beginPath(); ctx.arc(x - s * 0.15, y - s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.arc(x + s * 0.15, y - s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - s * 0.1, y + s * 0.3, s * 0.05, s * 0.15); ctx.fillRect(x + s * 0.05, y + s * 0.3, s * 0.05, s * 0.15);
}
/** The score table (story 016), shown while the scores key (Tab) is held or the touch Tabla button is on: every player's kills and deaths, your squad first. */
function drawScores(): void {
  const me = state.human, x = W / 2 - 330, y = 110, w = 660;
  rr(x, y, w, 120 + 8 * 40, 16, 'rgba(14,19,30,0.92)', '#ffd06a', 3);
  text('MARCADOR', x + 28, y + 36, 28, '#ffd06a', 'left');
  const ffa = isFfa(state); // story 019: one list, best first, numbered
  if (ffa) text(`Free for All  |  ${fmtTime(state.roundT)}`, x + w - 28, y + 36, 18, SIDE_CSS.ffa, 'right');
  const waves = isWaves(state); // story 025: players only (the team), no team headings; the wave and the enemies left
  if (waves) text(`Oleada ${state.round}  |  ${state.score[0]} enemigos  |  ${state.score[1]} en pie`, x + w - 28, y + 36, 18, '#fff', 'right');
  const duel = isDuel(state); // story 024: the teams' kills and the clock; each row says its team
  if (duel) text(`Equipo 1  ${state.score[0]} – ${state.score[1]}  Equipo 2  |  ${fmtTime(state.roundT)}`, x + w - 28, y + 36, 18, '#fff', 'right');
  text('Bajas', x + w - 170, y + 74, 17, '#c8d2e6'); text('Muertes', x + w - 70, y + 74, 17, '#c8d2e6');
  scoreRows.length = 0; for (const q of state.players) if (!waves || q.squad === me.squad) scoreRows.push(q); // story 025: the enemy seats are not players
  const rows = scoreRows.sort((a, b) => (ffa || waves ? 0 : (a.squad === me.squad ? 0 : 1) - (b.squad === me.squad ? 0 : 1)) || b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  rows.forEach((q, i) => {
    const ry = y + 96 + i * 40 + (ffa || waves || q.squad === me.squad ? 0 : 12);
    if (ffa) text(`${i + 1}`, x + 20, ry + 17, 16, i === 0 ? '#ffd06a' : '#aab4c8', 'center');
    if (q === me) rr(x + 16, ry - 2, w - 32, 36, 8, 'rgba(255,208,106,0.16)', null);
    rr(x + 28, ry + 8, 18, 18, 4, SIDE_CSS[sideOf(state, q)], null);
    const nm = q.human ? q.name : `${q.name} (${ROLE_NAME[q.role]})`;
    text(duel ? clip(nm, 300, 20) : nm, x + 60, ry + 17, 20, q.alive ? '#fff' : '#7d8799', 'left');
    if (duel) text(`Equipo ${q.squad + 1}`, x + w - 280, ry + 17, 16, SIDE_CSS[sideOf(state, q)], 'center');
    text(String(q.kills), x + w - 170, ry + 17, 22, '#fff'); text(String(q.deaths), x + w - 70, ry + 17, 22, '#fff');
  });
}
function drawShop() {
  const p = state.human, x = W / 2 - 330, y = 120, w = 660, h = 128 + SHOP.length * 62; // 500 with the 6 items today
  rr(x, y, w, h, 16, 'rgba(14,19,30,0.94)', '#ffd06a', 3);
  text('MENÚ DE COMPRA', x + 28, y + 36, 28, '#ffd06a', 'left');
  text(`$${p.money}`, x + w - 28, y + 36, 28, '#9ff08a', 'right');
  text('Cada objeto hace una pregunta. Responde bien para conseguirlo.', x + 28, y + 72, 17, '#c8d2e6', 'left', 'normal');
  SHOP.forEach((it, i) => {
    const by = y + 96 + i * 62, why = shopBlock(p, it);
    button(x + 24, by, w - 48, 54, '', why ? null : 'buy:' + it.id, { fill: why ? '#1b2232' : undefined });
    rr(x + 36, by + 11, 32, 32, 8, '#ffd06a', null); text(String(i + 1), x + 52, by + 27, 20, '#1b2232');
    text(it.name, x + 84, by + 18, 21, why ? '#7d8799' : '#fff', 'left');
    const desc = it.id === 'medkit' ? `Cura ${tune.medkit_heal} de vida cuando lo usas (${TOUCH ? 'botón Botiquín' : 'tecla ' + keyName(bind.medkit)}). Tienes ${p.medkits}` : it.desc;
    text(TOUCH ? desc.replace('Clic derecho', 'Botón Apuntar') : desc, x + 84, by + 40, 15, why ? '#6a7383' : '#c8d2e6', 'left', 'normal');
    text(why || `$${tune[it.price]}`, x + w - 44, by + 20, 20, why ? '#ff9a8a' : '#9ff08a', 'right');
    const ql = questionLevel(state, it.id); // the level of the item's question (none for a custom CSV)
    if (ql) text(`pregunta ${QUESTIONS.LEVEL_NAMES[ql]}`, x + w - 44, by + 42, 14, why ? '#aab4c8' : '#c8d2e6', 'right', 'normal');
  });
  if (TOUCH) { text('Toca un objeto para elegirlo', x + 28, y + h - 22, 16, '#c8d2e6', 'left', 'normal'); button(x + w - 184, y + h - 42, 160, 38, 'Cerrar', 'closebuy', { size: 18 }); }
  else text(`1-${SHOP.length} o clic para elegir  |  ${keyName(bind.buy)} para cerrar`, x + w / 2, y + h - 22, 16, '#c8d2e6', 'center', 'normal');
  if (isRoam(state)) { // story 021: whether the others can see and hurt you while you buy (024: Duelo por equipos too)
    const msg = p.hidden ? 'Eres invisible y nadie te puede dañar mientras compras' : 'Te pueden ver y dañar mientras compras';
    rr(x + w / 2 - 260, y + h + 10, 520, 36, 10, 'rgba(14,19,30,0.85)', null);
    text(msg, x + w / 2, y + h + 28, 17, p.hidden ? '#9ff08a' : '#ff9a8a', 'center');
  }
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
  const defuse = c.kind === 'defuse', back = c.kind === 'respawn', it = SHOP.find(s => s.id === c.item);
  const edge = c.okT > 0 ? '#7fe07a' : c.wrongT > 0 ? '#ff5a4a' : defuse ? '#ff7a5a' : back ? SIDE_CSS.ffa : '#ffd06a';
  rr(x, y, w, h, 18, 'rgba(250,248,240,0.97)', edge, 6);
  // The header: what the card is for; on a defuse it carries the bomb timer, so the card never hides it.
  const head = back ? `VOLVER A LA PARTIDA  |  ${fmtTime(state.roundT)}` : defuse || !it ? `DESACTIVAR LA BOMBA  |  ${fmtTime(state.bomb.timer)}` : `COMPRAR ${it.name.toUpperCase()}  |  $${tune[it.price]}`;
  rr(x + 18, y + 16, w - 36, 42, 10, defuse ? '#b8321f' : back ? '#7a2a8c' : '#26324a', null);
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
    const ok = c.okT > 0, msg = ok ? (back ? '¡Correcto! Vuelves a la partida' : '¡Correcto!') : back ? `Incorrecto: otra pregunta en ${Math.ceil(c.wrongT)} s…` : 'Incorrecto: ahora viene otra pregunta…', col = ok ? '#24702a' : '#b8321f';
    ctx.font = `bold 18px ${FONT}`;
    const sx = W / 2 + shake - (ctx.measureText(msg).width + 30) / 2;
    drawVerdict(ok, sx + 10, fy, 20, col);
    text(msg, sx + 30, fy, 18, col, 'left');
  } else {
    const hint = defuse ? `1-4 o clic para responder  |  ${keyName(bind.use)} para alejarte${tune.defuse_answers > 1 ? `  |  ${c.got}/${tune.defuse_answers} correctas` : ''}`
      : `1-4 o clic para responder  |  ${keyName(bind.buy)} para cancelar`;
    if (back) text(TOUCH ? 'Toca la respuesta correcta para volver a la partida' : '1-4 o clic: responde bien para volver a la partida', W / 2 + shake, fy, 16, '#3a465e', 'center', 'normal'); // story 019: it cannot be closed
    else if (TOUCH) { // no keys: a button closes the card (cancel a purchase, step away from the bomb)
      text(`Toca una respuesta${defuse && tune.defuse_answers > 1 ? `  |  ${c.got}/${tune.defuse_answers} correctas` : ''}`, x + 36, fy, 16, '#3a465e', 'left', 'normal');
      button(x + w - 196, fy - 19, 172, 36, defuse ? 'Alejarte' : 'Cancelar', 'closecard', { size: 18 });
    } else text(hint, W / 2 + shake, fy, 16, '#3a465e', 'center', 'normal');
  }
  // The lockout bar under the card: it empties over the lockout, so the player sees why presses are ignored.
  if (c.wrongT > 0) {
    rr(x + 20, y + h + 8, w - 40, 8, 4, 'rgba(14,19,30,0.85)', null);
    rr(x + 20, y + h + 8, (w - 40) * Math.max(0, c.wrongT / c.wrongTotal), 8, 4, '#ff5a4a', null);
  }
}
