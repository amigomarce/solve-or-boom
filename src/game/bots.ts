// The bots: each step of a bot (look, take cover, fight, follow its plan) and how it walks.
// Everything random goes through match.rng(). No browser in here.
import { grid, zone, idx, siteCells, SITE, center, cellOf, walkable, moveBody, losClear, walkClear, bfs, type Cell } from './map';
import { yawTo, angDiff, lerp } from './rules';
import { tune } from './tune';
import type { Loose } from './types';
import { botShoot, finishReload, siteAlert } from './combat';
import { defuseBomb, plantBomb } from './bomb';
import { anchorTo, routeTo } from './plans';
import { level, sideOf, type Match } from './state';

export function botSpeed(b: Loose): number { return tune['bot_speed_' + b.role] * (b.cur === 'sniper' ? tune.sniper_speed_mult : 1); }
export function turnTo(b: Loose, yaw: number, rate: number, dt: number): void {
  const d = angDiff(yaw, b.yaw), m = rate * dt;
  b.yaw += Math.abs(d) < m ? d : Math.sign(d) * m;
}
/** Walks a bot along its waypoints (bfs between them, cutting corners where the straight line is clear), turning
 *  it to face the way it walks unless `look` is false. Stuck: it re-paths from its own cell, cell centre by cell
 *  centre, for bot_repath_strict s; stuck again in that time, it snaps to its cell centre. False once arrived. */
export function followPath(match: Match, b: Loose, dt: number, speed: number, look = true): boolean {
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
  if (b.pathI < b.path.length - 1 && match.t >= b.strictT) {
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
      if (match.t < b.strictT) { b.path = []; b.pathI = 0; b.x = center(cellOf(b.x)); b.z = center(cellOf(b.z)); }
      else { const cx = cellOf(b.x), cy = cellOf(b.z), w = b.wps[0]; b.path = [[cx, cy], ...bfs(cx, cy, w[0], w[1])]; b.pathI = 0; }
      b.strictT = match.t + tune.bot_repath_strict;
    }
  } else b.stuckT = 0;
  return true;
}
export function canSee(b: Loose, e: Loose): boolean {
  const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
  if (d > tune.bot_view_range) return false;
  const fov = (b.alertT > 0 || b.target === e) ? Math.PI * 2 : tune.bot_fov_deg * Math.PI / 180;
  if (Math.abs(angDiff(yawTo(dx, dz), b.yaw)) > fov / 2) return false;
  return losClear(b.x, b.z, e.x, e.z);
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
  if (d > 0.2) { const k = Math.min(d, speed * dt) / d; moveBody(b, dx * k, dz * k); b.moving = true; }
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** One bot's step: look, take cover, fight, then the plan (staging, rotation, noises, corner checks, the route). */
export function botUpdate(match: Match, b: Loose, dt: number): void {
  b.cool = Math.max(0, b.cool - dt); b.alertT = Math.max(0, b.alertT - dt); b.flashT = Math.max(0, b.flashT - dt);
  if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) finishReload(b); }
  const side = sideOf(match, b), live = match.phase === 'live', bomb = match.bomb;
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
      if (best !== b.target) { b.reactT = lerp(tune.bot_react_start, tune.bot_react_end, level(match)) * (0.8 + match.rng() * 0.4); }
      b.target = best; b.lastX = best.x; b.lastZ = best.z; b.lastSeenT = match.t;
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
        q.chasing = true; q.wps = [[cellOf(b.lastX), cellOf(b.lastZ)], ...(q.wps.length ? q.wps : [[cellOf(q.x), cellOf(q.z)]])];
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
  const t = b.target && b.target.alive ? b.target : null;
  if (!t) b.target = null;
  const speed = botSpeed(b);
  // Cover: when hit, reloading with an enemy about, or low on health facing one, find the nearest cell (within
  // bot_cover_search steps) beside a wall or crate with no line of sight to the threat, best one with a peek cell
  // beside it that has the line of sight back; not while planting or defusing, nor defending a planted bomb.
  if (t) { b.threatX = t.x; b.threatZ = t.z; }
  const about = !!t || match.t - b.lastSeenT < tune.bot_threat_memory;
  if (live && (b.wantCover || (b.coverT <= 0 && about && (b.reloadT > 0 || (!!t && b.hp < tune.bot_cover_hp))))
    && match.t >= b.coverTry && !b.defusing && !b.plantT && !(side === 'def' && bomb.state === 'planted')) {
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
  b.wantCover = false;
  // Keep apart: every body closer than bot_sep_dist pushes the bot away, harder the closer it is.
  if (live && !b.defusing && !b.plantT) {
    let px = 0, pz = 0;
    for (const o of match.players) {
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
    if (b.reactT <= 0 && Math.abs(angDiff(yawTo(dx, dz), b.yaw)) < 0.2) botShoot(match, b, t);
    if (b.coverT > 0) { coverStep(match, b, dt, speed, false); return; }
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = 0.5 + match.rng() * 0.8; b.strafe = match.rng() < 0.5 ? -1 : 1; }
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
  if (b.coverT > 0) { turnTo(b, yawTo(b.threatX - b.x, b.threatZ - b.z), 5, dt); coverStep(match, b, dt, speed, false); return; }
  // No enemy in sight: follow the plan.
  if (side === 'att') {
    if (bomb.state === 'dropped' && !b.fetching && !match.players.some(p => p.fetching && p.alive && sideOf(match, p) === 'att')) {
      b.fetching = true; b.wps = [[cellOf(bomb.x), cellOf(bomb.z)]]; b.path = []; b.arrived = false; b.after = [];
    }
    if (bomb.state === 'planted' && !b.guarding) {
      b.guarding = true; const c = nearCell(match, bomb.x, bomb.z, 2); b.wps = [c]; b.path = []; b.arrived = false; b.after = [];
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
      const z = zone[idx(cellOf(b.x), cellOf(b.z))];
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
      const d = Math.hypot(bomb.x - b.x, bomb.z - b.z);
      if (!b.guarding) { b.guarding = true; b.rotating = false; b.wps = [[cellOf(bomb.x), cellOf(bomb.z)]]; b.path = []; b.arrived = false; }
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
  if (followPath(match, b, dt, speed)) b.moving = true;
  else { b.chasing = false; b.investigating = false; turnTo(b, b.holdYaw, 3, dt); }
  if (b.arrived && b.fetching) b.fetching = false;
}
export function nearCell(match: Match, x: number, z: number, r: number): number[] {
  for (let k = 0; k < 12; k++) {
    const cx = cellOf(x) + Math.round((match.rng() - 0.5) * 2 * r), cy = cellOf(z) + Math.round((match.rng() - 0.5) * 2 * r);
    if (walkable(cx, cy)) return [cx, cy];
  }
  return [cellOf(x), cellOf(z)];
}
