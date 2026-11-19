// The bots: each step of a bot (look, take cover, fight, follow its plan) and how it walks.
// Everything random goes through match.rng(). No browser in here.
import { grid, zone, zoneAt, idx, siteCells, SITE, center, cellOf, walkable, moveBody, losClear, walkClear, bfs, type Cell,
  hasHeights, bfs3, canStepXY, cellLevels, floorHeight, levelHeight, levelOfY, rampAt, supportAt, grid1, zone1, MW, MH, RADIUS, rampSide } from './map';
import { yawTo, angDiff, lerp } from './rules';
import { tune } from './tune';
import type { Loose } from './types';
import { botShoot, finishReload, siteAlert, makeNoise } from './combat';
import { defuseBomb, plantBomb } from './bomb';
import { anchorTo, routeTo } from './plans';
import { isDuel, isRoam, level, sideOf, type Match } from './state';
import { randomSpot } from './ffa';

export function botSpeed(b: Loose): number { return tune['bot_speed_' + b.role] * (b.cur === 'sniper' ? tune.sniper_speed_mult : 1); }
export function turnTo(b: Loose, yaw: number, rate: number, dt: number): void {
  const d = angDiff(yaw, b.yaw), m = rate * dt;
  b.yaw += Math.abs(d) < m ? d : Math.sign(d) * m;
}
/** The level a bot walks on: 0 on the ground or a ramp, 1 on the first floor; always 0 on a flat map. */
export function botLevel(b: Loose): number { return hasHeights && !rampAt(cellOf(b.x), cellOf(b.z)) ? levelOfY(b.st.y) : 0; }
/** The cell holding the point (x, z) at feet height y as a waypoint: [cx, cy] on a flat map, [cx, cy, level] with heights (a ramp is level 0). */
export function cellAt(x: number, z: number, y = 0): Cell {
  const cx = cellOf(x), cy = cellOf(z);
  return hasHeights ? [cx, cy, rampAt(cx, cy) ? 0 : levelOfY(y)] : [cx, cy];
}
/** A waypoint's level: its third number, else the lowest level its cell can be walked on. */
export function wpLevel(w: Cell): number { return w.length > 2 ? w[2] : (cellLevels(w[0], w[1])[0] ?? 0); }
/** The path from cell `h` (with its level on a map with heights) to waypoint `w`: bfs3 with heights, the old bfs on a flat map. */
export function pathFrom(h: Cell, w: Cell): number[][] { return hasHeights ? bfs3(h[0], h[1], h[2] ?? 0, w[0], w[1], wpLevel(w)) : bfs(h[0], h[1], w[0], w[1]); }
/** True when the bot stands on the level of path step c (always on a flat map). */
function onLevel(b: Loose, c: Cell): boolean { return !hasHeights || Math.abs(b.st.y - floorHeight(c[0], c[1], c[2] ?? 0)) < levelHeight() / 2; }
/** True when the bot can walk straight to the centre of path step n (corner cutting): with heights, without dropping, without crossing a ramp's side, and ending on n's level. */
function cutClear(b: Loose, n: Cell): boolean {
  const tx = center(n[0]), tz = center(n[1]);
  if (!hasHeights) return walkClear(b.x, b.z, tx, tz);
  const dx = tx - b.x, dz = tz - b.z, k = Math.ceil(Math.hypot(dx, dz) / 0.4);
  let y = b.st.y;
  for (let i = 1; i <= k; i++) {
    const px = b.x + dx * i / k, pz = b.z + dz * i / k, s = supportAt(px, pz, y);
    if (s === null || s < y - tune.step_height || rampSide(px, pz)) return false; // no drop, and never across a ramp's side (moveBody refuses it)
    y = s;
  }
  return Math.abs(y - floorHeight(n[0], n[1], n[2] ?? 0)) < levelHeight() / 2;
}
/** Moves a bot like moveBody, but on a map with heights it never walks off a first-floor edge unless `drop` (a path chose that step), nor climbs onto (or hangs off) the side of a ramp. */
export function botMove(match: Match, b: Loose, dx: number, dz: number, drop = false): void {
  if (!hasHeights) { moveBody(b, dx, dz); return; }
  // Refused: a drop (unless chosen). The ramp-side rule is in moveBody, shared with the players (src/game/map.ts rampSide).
  if (!drop) {
    const low = b.st.y - tune.step_height;
    let s = supportAt(b.x + dx, b.z, b.st.y);
    if (s !== null && s < low) dx = 0;
    s = supportAt(b.x + dx, b.z + dz, b.st.y);
    if (s !== null && s < low) dz = 0;
  }
  moveBody(b, dx, dz);
  // A bot lands at once (bots have no stance step): the drop is counted and its landing heard.
  if (b.st.jumpY > 0) { b.st.jumpY = 0; b.st.vy = 0; b.drops = (b.drops ?? 0) + 1; makeNoise(match, b.x, b.z, tune.bot_hear_land, b.squad, b.st.y); }
}
/** The cell and level a bot stands on, for planning (with heights): the level of its feet, and its centre's cell when that
 *  cell has a floor at that level; else (the centre over a ledge, a corner holding it up) the cell under its nearest
 *  corner that has one. Flat maps: [cx, cy]. */
export function standCell(b: Loose): Cell {
  const h = cellAt(b.x, b.z, b.st.y);
  if (!hasHeights || cellLevels(h[0], h[1]).includes(h[2])) return h;
  let best = h, bd = Infinity;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = cellOf(b.x + sx * RADIUS), cz = cellOf(b.z + sz * RADIUS);
    if (!cellLevels(cx, cz).includes(h[2])) continue;
    const d = Math.hypot(center(cx) - b.x, center(cz) - b.z);
    if (d < bd) { bd = d; best = [cx, cz, h[2]]; }
  }
  return best;
}
/** A waypoint made safe (with heights): its level moved to the one its cell can be walked on when it names a level with no
 *  floor there; null when the cell has no floor at all. Flat maps: unchanged. */
function fixWp(w: Cell): Cell | null {
  if (!hasHeights) return w;
  const lv = cellLevels(w[0], w[1]);
  if (!lv.length) return null;
  return lv.includes(wpLevel(w)) ? w : [w[0], w[1], lv[0]];
}
/** Walks a bot along its waypoints (bfs between them, cutting corners where the straight line is clear), turning
 *  it to face the way it walks unless `look` is false. Stuck: it re-paths from its own cell, cell centre by cell
 *  centre, for bot_repath_strict s; stuck again in that time, it snaps to its cell centre. False once arrived. */
export function followPath(match: Match, b: Loose, dt: number, speed: number, look = true): boolean {
  if (b.pathI >= b.path.length) {
    if (!b.wps.length) { b.arrived = true; return false; }
    const w = fixWp(b.wps[0]);
    if (!w) { b.wps.shift(); return true; }
    b.wps[0] = w;
    b.path = pathFrom(standCell(b), w); b.pathI = 0;
    if (!b.path.length) { // no path: walk straight at it on its own level, else give the waypoint up
      const tx = center(w[0]), tz = center(w[1]), dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.3 && (!hasHeights || botLevel(b) === wpLevel(w))) { botMove(match, b, dx / d * speed * dt, dz / d * speed * dt); if (look) b.yaw = yawTo(dx, dz); return true; }
      b.wps.shift(); return true;
    }
  }
  if (b.pathI < b.path.length - 1 && match.t >= b.strictT) {
    const n = b.path[b.pathI + 1];
    if (cutClear(b, n)) b.pathI++;
  }
  const c = b.path[b.pathI], tx = center(c[0]), tz = center(c[1]);
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  if (d < 0.5 && !onLevel(b, c)) { b.path = []; b.pathI = 0; b.repaths = (b.repaths ?? 0) + 1; return true; } // over or under its step: re-plan from where it stands
  if (d < 0.5 && onLevel(b, c)) {
    b.pathI++; b.stuckN = 0;
    if (b.pathI >= b.path.length) { b.wps.shift(); b.path = []; b.pathI = 0; }
    return true;
  }
  const ox = b.x, oz = b.z;
  const drop = hasHeights && (c[2] ?? 0) === 0 && botLevel(b) === 1 && !rampAt(c[0], c[1]); // this step leaves the first floor off its edge
  botMove(match, b, dx / d * speed * dt, dz / d * speed * dt, drop);
  if (look) turnTo(b, yawTo(dx, dz), 8, dt);
  if (Math.hypot(b.x - ox, b.z - oz) < speed * dt * 0.2) {
    b.stuckT += dt;
    if (b.stuckT > 0.8) {
      b.stuckT = 0;
      // With heights: stuck bot_stuck_give_up times in a row without reaching a path step, it gives that waypoint up.
      if (hasHeights && (b.stuckN = (b.stuckN ?? 0) + 1) >= tune.bot_stuck_give_up) { b.stuckN = 0; b.wps.shift(); b.path = []; b.pathI = 0; }
      else if (match.t < b.strictT) { b.path = []; b.pathI = 0; snapToCell(b); }
      else if (b.wps.length) { const h = standCell(b), w = fixWp(b.wps[0]) ?? h; b.path = [h, ...pathFrom(h, w)]; b.pathI = 0; }
      b.strictT = match.t + tune.bot_repath_strict;
    }
  } else b.stuckT = 0;
  return true;
}
/** Puts a stuck bot on the centre of its cell (with heights: only when that spot is on its own floor, never over a drop). */
function snapToCell(b: Loose): void {
  const x = center(cellOf(b.x)), z = center(cellOf(b.z));
  if (!hasHeights) { b.x = x; b.z = z; return; }
  const s = supportAt(x, z, b.st.y);
  if (s !== null && s >= b.st.y - tune.step_height) { b.x = x; b.z = z; b.st.y = s; }
}
/** True when bot b can see enemy e: in range, in its field of view, and a clear line between their heads (heights count). */
export function canSee(b: Loose, e: Loose): boolean {
  if (e.hidden) return false; // story 021: a Free for All player buying at the start or a respawn cannot be seen
  const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
  if (d > tune.bot_view_range) return false;
  const fov = (b.alertT > 0 || b.target === e) ? Math.PI * 2 : tune.bot_fov_deg * Math.PI / 180;
  if (Math.abs(angDiff(yawTo(dx, dz), b.yaw)) > fov / 2) return false;
  return losClear(b.x, b.z, e.x, e.z, b.st.y + 1.3, e.st.y + 1.2); // with the heights of both (a floor between blocks it)
}
/** One step of a bot in cover: it walks to its cover cell, then hides there for bot_peek_hide s and steps out to its
 *  peek cell (where it can shoot) for bot_peek_show s, in turn, never peeking while it reloads. When bot_cover_time
 *  is up and the gun is loaded it takes up the plan it left. `look`: false so walking never turns it from the threat. */
export function coverStep(match: Match, b: Loose, dt: number, speed: number, look: boolean): void {
  b.coverT -= dt;
  if (b.coverT <= 0 && b.reloadT <= 0) { b.coverT = 0; b.wps = b.plan; b.plan = []; b.path = []; b.pathI = 0; b.arrived = false; return; }
  if (b.wps.length) { if (followPath(match, b, dt, speed, look)) b.moving = true; return; }
  b.peekT -= dt;
  if (b.peekT <= 0) { b.peekOut = !b.peekOut; b.peekT = b.peekOut ? tune.bot_peek_show : tune.bot_peek_hide; }
  const c = b.peekOut && b.peek && b.reloadT <= 0 ? b.peek : b.cover;
  const dx = center(c[0]) - b.x, dz = center(c[1]) - b.z, d = Math.hypot(dx, dz);
  if (d > 0.2) { const k = Math.min(d, speed * dt) / d; botMove(match, b, dx * k, dz * k); b.moving = true; }
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** One bot's step: look, take cover, fight, then the plan (staging, rotation, noises, corner checks, the route). */
export function botUpdate(match: Match, b: Loose, dt: number): void {
  b.cool = Math.max(0, b.cool - dt); b.alertT = Math.max(0, b.alertT - dt); b.flashT = Math.max(0, b.flashT - dt);
  if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) finishReload(b); }
  const side = isDuel(match) ? 'duel' : sideOf(match, b), live = match.phase === 'live', bomb = match.bomb;
  b.moving = false;
  // Look for enemies a few times a second.
  b.scanT -= dt;
  if (live && b.scanT <= 0) {
    b.scanT = 0.15 + match.rng() * 0.06;
    let best = null, bestD = 1e9;
    for (const e of match.players) {
      if (!e.alive || e.squad === b.squad || !canSee(b, e)) continue;
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (best) {
      if (best !== b.target) { b.reactT = lerp(tune.bot_react_start, tune.bot_react_end, level(match)) * tune[`bot_${match.opts.botLevel}_react_mult`] * (0.8 + match.rng() * 0.4); }
      b.target = best; b.lastX = best.x; b.lastZ = best.z; b.lastY = best.st.y; b.lastSeenT = match.t;
      best.spotT = match.t;
      siteAlert(match, b, best.x, best.z);
      if (b.defusing) { b.defusing = false; match.bomb.defuser = null; }
    } else {
      // Lost sight of a living target: go to where it was last seen (and back), with the nearest free teammate.
      const lost = b.target && b.target.alive && b.coverT <= 0;
      b.target = null;
      const free = (q: Loose): boolean => q.role !== 'sniper' && bomb.carrier !== q && !q.defusing && !q.chasing && q.coverT <= 0
        && !(sideOf(match, q) === 'def' && bomb.state === 'planted');
      const go = (q: Loose): void => {
        q.chasing = true; q.wps = [cellAt(b.lastX, b.lastZ, b.lastY), ...(q.wps.length ? q.wps : [cellAt(q.x, q.z, q.st.y)])];
        q.path = []; q.arrived = false;
      };
      if (lost && free(b)) {
        go(b);
        let buddy = null, bd = tune.bot_buddy_range;
        for (const q of match.players) {
          const d = Math.hypot(q.x - b.x, q.z - b.z);
          if (q !== b && !q.human && q.alive && q.squad === b.squad && !q.target && free(q) && d < bd) { buddy = q; bd = d; }
        }
        if (buddy) go(buddy);
      }
    }
  }
  const t = b.target && b.target.alive && !b.target.hidden ? b.target : null;
  if (!t) b.target = null;
  const speed = botSpeed(b);
  // Cover: when hit, reloading with an enemy about, or low on health facing one, find the nearest cell (within
  // bot_cover_search steps) beside a wall or crate with no line of sight to the threat, best one with a peek cell
  // beside it that has the line of sight back; not while planting or defusing, nor defending a planted bomb.
  if (t) { b.threatX = t.x; b.threatZ = t.z; b.threatY = t.st.y; }
  const about = !!t || match.t - b.lastSeenT < tune.bot_threat_memory;
  if (live && (b.wantCover || (b.coverT <= 0 && about && (b.reloadT > 0 || (!!t && b.hp < tune.bot_cover_hp))))
    && match.t >= b.coverTry && !b.defusing && !b.plantT && !(side === 'def' && bomb.state === 'planted')) {
    if (hasHeights) coverSearch3(b); else {
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
    } else b.coverTry = match.t + tune.bot_cover_retry;
    }
    if (hasHeights && !b.coverT) b.coverTry = match.t + tune.bot_cover_retry;
  }
  b.wantCover = false;
  // Keep apart: every body closer than bot_sep_dist pushes the bot away, harder the closer it is.
  if (live && !b.defusing && !b.plantT) {
    let px = 0, pz = 0;
    for (const o of match.players) {
      if (o === b || !o.alive || o.hidden || (hasHeights && Math.abs(o.st.y - b.st.y) > levelHeight() / 2)) continue; // one floor apart: no push
      const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz);
      if (d >= tune.bot_sep_dist) continue;
      const k = (tune.bot_sep_dist - d) / tune.bot_sep_dist;
      if (d > 1e-3) { px += dx / d * k; pz += dz / d * k; } else { px += Math.cos(b.id) * k; pz += Math.sin(b.id) * k; }
    }
    const m = Math.hypot(px, pz);
    if (m > 0) { const k = Math.min(1, m) / m * speed * dt; botMove(match, b, px * k, pz * k); }
  }
  if (t && live) { // fight
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
    turnTo(b, yawTo(dx, dz), 7, dt);
    b.reactT -= dt;
    if (b.reactT <= 0 && Math.abs(angDiff(yawTo(dx, dz), b.yaw)) < 0.2) botShoot(match, b, t);
    if (b.coverT > 0) { coverStep(match, b, dt, speed, false); return; }
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = 0.5 + match.rng() * 0.8; b.strafe = match.rng() < 0.5 ? -1 : 1; }
    const sk = b.role === 'rusher' ? 0.65 : b.role === 'rifleman' ? 0.3 : 0;
    if (sk > 0) {
      const px = -dz / d, pz = dx / d;
      let mx = px * b.strafe * sk, mz = pz * b.strafe * sk;
      if (b.role === 'rusher' && d > 9) { mx += dx / d * 0.7; mz += dz / d * 0.7; }
      botMove(match, b, mx * speed * dt, mz * speed * dt); b.moving = true;
    }
    return;
  }
  if (b.alertT > 0) turnTo(b, b.alertYaw, 6, dt);
  if (!live) return;
  if (b.coverT > 0) { turnTo(b, yawTo(b.threatX - b.x, b.threatZ - b.z), 5, dt); coverStep(match, b, dt, speed, false); return; }
  // No enemy in sight: follow the plan (Free for All, story 019: roam from spot to spot, there is no bomb or site to go to).
  if (isRoam(match) && !b.wps.length && b.pathI >= b.path.length) { b.wps = [randomSpot(match)]; b.arrived = false; }
  if (side === 'att') {
    if (bomb.state === 'dropped' && !b.fetching && !match.players.some(p => p.fetching && p.alive && sideOf(match, p) === 'att')) {
      b.fetching = true; b.wps = [cellAt(bomb.x, bomb.z, bomb.y ?? 0)]; b.path = []; b.arrived = false; b.after = [];
    }
    if (bomb.state === 'planted' && !b.guarding) {
      b.guarding = true; const c = nearCell(match, bomb.x, bomb.z, 2, bomb.y ?? 0); b.wps = [c]; b.path = []; b.arrived = false; b.after = [];
    }
    // Staging: wait facing the site until every attacker bot still to go in is at its staging point (and out of
    // cover), or bot_group_wait passes; then all of them that are there go in together.
    if (b.after.length && b.arrived && !b.wps.length) {
      const mates = match.players.filter(q => !q.human && q.alive && q.squad === b.squad && q.after.length);
      const ready = (q: Loose): boolean => q.arrived && !q.wps.length && q.coverT <= 0;
      b.waitT += dt; turnTo(b, yawTo(center(b.after[0][0]) - b.x, center(b.after[0][1]) - b.z), 4, dt);
      if (b.waitT >= tune.bot_group_wait || mates.every(ready)) {
        for (const q of mates) if (ready(q)) { q.wps = q.after; q.after = []; q.arrived = false; q.path = []; q.waitT = 0; }
      }
      return;
    }
    if (bomb.carrier === b && b.arrived) {
      const z = zoneAt(cellOf(b.x), cellOf(b.z), b.st.y);
      if (z === 3 || z === 4) {
        b.plantT += dt;
        if (b.plantT >= tune.plant_time) plantBomb(match, b);
        return;
      }
      routeTo(match, b, 'site');
    }
    if (b.routeKind === 'hold' && b.arrived) {
      b.holdT -= dt; turnTo(b, b.holdYaw, 4, dt);
      if (b.holdT <= 0) routeTo(match, b, match.rng() < 0.5 ? 'mid' : 'lane');
      return;
    }
  } else {
    if (bomb.state === 'planted') {
      const d = Math.abs(bomb.y - b.st.y) < tune.bomb_reach_y ? Math.hypot(bomb.x - b.x, bomb.z - b.z) : Infinity; // under or over the bomb is not near it
      if (!b.guarding) { b.guarding = true; b.rotating = false; b.wps = [cellAt(bomb.x, bomb.z, bomb.y ?? 0)]; b.path = []; b.arrived = false; }
      if (d < 1.7 && (!bomb.defuser || bomb.defuser === b)) {
        if (!b.defusing) { b.defusing = true; bomb.defuser = b; b.thinkT = lerp(tune.bot_think_min, tune.bot_think_max, match.rng()); b.defuseRight = 0; }
        b.thinkT -= dt;
        if (b.thinkT <= 0) {
          if (match.rng() < tune.bot_defuse_right) { b.right++; b.defuseRight++; } else { b.wrong++; bomb.panicT = 1.0; }
          if (b.defuseRight >= tune.defuse_answers) { defuseBomb(match, b); return; }
          b.thinkT = lerp(tune.bot_think_min, tune.bot_think_max, match.rng());
        }
        return;
      }
    } else if (match.alert && match.alert.squad === b.squad && !b.rotated && b.role !== 'sniper' && b.anchor !== match.alert.site
      && match.t - match.alert.t < 8) {
      b.rotated = true; anchorTo(match, b, match.alert.site); b.rotating = true; b.rotT = 0;
    }
  }
  // Rotating defenders go as a pack: one more than bot_group_gap m ahead of a rotating teammate waits for them
  // (at most bot_group_wait s in all), facing the site.
  if (b.rotating) {
    if (!b.wps.length) b.rotating = false;
    else {
      const gx = center(SITE[b.anchor].cx), gz = center(SITE[b.anchor].cy), mine = Math.hypot(gx - b.x, gz - b.z);
      if (b.rotT < tune.bot_group_wait && match.players.some(q => q !== b && q.alive && q.rotating && q.squad === b.squad
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
      b.investigating = true; b.wps = [cellAt(b.noiseX, b.noiseZ, b.noiseY ?? 0), cellAt(b.x, b.z, b.st.y)]; b.path = []; b.arrived = false;
    }
  }
  // Corner check: an attacker that arrives in a site (not the carrier) looks at each way into it, bot_corner_look s
  // apiece (entries closer than bot_corner_merge_deg count as one), before it settles.
  const here = hasHeights ? zoneAt(cellOf(b.x), cellOf(b.z), b.st.y) : zone[idx(cellOf(b.x), cellOf(b.z))];
  if (side === 'att' && b.arrived && !b.cleared && bomb.carrier !== b && (here === 3 || here === 4)) {
    b.cleared = true; b.lookT = 0; b.looks = [];
    for (const [x, y] of here === SITE.A.z ? siteCells.A : siteCells.B) {
      if (!N4.some(([dx, dy]) => entryInto(x, y, x + dx, y + dy, here))) continue;
      const yw = yawTo(center(x) - b.x, center(y) - b.z);
      if (b.looks.every((l: number) => Math.abs(angDiff(l, yw)) > tune.bot_corner_merge_deg * Math.PI / 180)) b.looks.push(yw);
    }
  }
  if (b.looks.length) {
    turnTo(b, b.looks[0], 6, dt); b.lookT += dt;
    if (b.lookT >= tune.bot_corner_look) { b.looks.shift(); b.lookT = 0; }
    return;
  }
  if (followPath(match, b, dt, speed)) b.moving = true;
  else { b.chasing = false; b.investigating = false; turnTo(b, b.holdYaw, 3, dt); }
  if (b.arrived && b.fetching) b.fetching = false;
}
/** A random walkable cell within r cells of (x, z) (with heights: on the level of feet height y), else the cell of (x, z). */
export function nearCell(match: Match, x: number, z: number, r: number, y = 0): number[] {
  const lv = cellAt(x, z, y)[2] ?? 0;
  for (let k = 0; k < 12; k++) {
    const cx = cellOf(x) + Math.round((match.rng() - 0.5) * 2 * r), cy = cellOf(z) + Math.round((match.rng() - 0.5) * 2 * r);
    if (!hasHeights ? walkable(cx, cy) : cellLevels(cx, cy).includes(lv) && pathFrom(cellAt(x, z, y), [cx, cy, lv]).length > 0) return hasHeights ? [cx, cy, lv] : [cx, cy];
  }
  return cellAt(x, z, y);
}
/** True when the neighbour (nx, ny) of site cell (x, y) is a way into the site of zone `here`: flat, a floor cell of another zone; with heights, on the site's own level (or the top of a ramp onto it). */
function entryInto(x: number, y: number, nx: number, ny: number, here: number): boolean {
  const lv = here === SITE.A.z ? SITE.A.lv : SITE.B.lv;
  if (!hasHeights || lv === 0) return grid[idx(nx, ny)] === 1 && zone[idx(nx, ny)] !== here;
  if (nx < 0 || ny < 0) return false;
  return (grid1[idx(nx, ny)] === 1 && zone1[idx(nx, ny)] !== here) || canStepXY(nx, ny, 0, x, y, 1);
}
/** True when a body standing on level l of cell (x, y) has something solid beside it there (out of the map, a wall, or a crate on that level). */
function solidAt(x: number, y: number, l: number): boolean {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
  const i = idx(x, y);
  return grid[i] === 0 || (l === 0 ? grid[i] === 2 : grid1[i] === 2);
}
/** The cover search on a map with heights (as the flat one: the nearest cell within bot_cover_search steps on the bot's own
 *  level, beside something solid, with no line of sight to the threat, best with a peek cell beside it that sees it); sets
 *  the bot's cover when found. The lines use the eye heights of both. */
function coverSearch3(b: Loose): void {
  const sl = botLevel(b), key = (x: number, y: number): number => idx(x, y);
  const ty = (b.threatY ?? 0) + 1.2;
  const see = (x: number, y: number): boolean => losClear(center(x), center(y), b.threatX, b.threatZ, floorHeight(x, y, sl) + 1.3, ty);
  const sx = cellOf(b.x), sy = cellOf(b.z), steps = new Map<number, number>([[key(sx, sy), 0]]), q: Cell[] = [[sx, sy]];
  let hide: Cell | null = null, best: Cell | null = null, peek: Cell | null = null;
  for (let h = 0; h < q.length && !best; h++) {
    const [x, y] = q[h], n = steps.get(key(x, y))!;
    if (!rampAt(x, y) && N4.some(([dx, dy]) => solidAt(x + dx, y + dy, sl)) && !see(x, y)) {
      hide ??= [x, y, sl];
      const pk = N4.find(([dx, dy]) => !rampAt(x + dx, y + dy) && canStepXY(x, y, sl, x + dx, y + dy, sl) && see(x + dx, y + dy));
      if (pk) { best = [x, y, sl]; peek = [x + pk[0], y + pk[1], sl]; }
    }
    if (n < tune.bot_cover_search) for (const [dx, dy] of N4) {
      if (canStepXY(x, y, sl, x + dx, y + dy, sl) && !steps.has(key(x + dx, y + dy))) { steps.set(key(x + dx, y + dy), n + 1); q.push([x + dx, y + dy]); }
    }
  }
  const c = best ?? hide;
  if (c) {
    if (b.coverT <= 0) b.plan = b.wps;
    Object.assign(b, { coverT: tune.bot_cover_time, cover: c, peek, wps: [c], path: [], pathI: 0, arrived: false, peekOut: false, peekT: tune.bot_peek_hide });
  }
}
