// Shooting and damage: the human's shot, a bot's shot, armour, kills, reloads and the noises that bots hear.
// No browser in here: sounds, tracers and sparks are events in match.events for the screen to play and draw.
import { EYE, solidSight, center, SITE, hasHeights, rayStop, levelOfY, losClear } from './map';
import { yawTo, hitChance, armourHit } from './rules';
import { tune } from './tune';
import type { Loose } from './types';
import { closeDesk, feed, level, nextSpec, say, sideOf, WEAPON, type Match } from './state';

export function applyDamage(match: Match, t: Loose, dmg: number, from: Loose): void {
  if (!t.alive) return;
  { const r = armourHit(dmg, t.armor, tune.armor_absorb); t.armor = r.armor; dmg = r.dmg; }
  t.hp -= dmg;
  if (t.human) {
    const yaw = yawTo(from.x - t.x, from.z - t.z);
    if (t === match.human) match.flashT = 0.35;
    match.events.push({ type: 'hurt', p: t.id, yaw });
    if (t === match.human) match.hurt.push({ yaw, t: 1.0 });
  } else {
    t.alertT = 1.5; t.alertYaw = yawTo(from.x - t.x, from.z - t.z); if (t.defusing) t.defusing = false;
    t.wantCover = true; t.threatX = from.x; t.threatZ = from.z;
  }
  if (t.hp <= 0) kill(match, t, from);
}
export function kill(match: Match, t: Loose, from: Loose): void {
  t.alive = false; t.hp = 0; t.deaths++; t.deadT = 0; t.defusing = false;
  match.count?.kill(from && from !== t ? from : null, t);
  if (from && from !== t) { from.kills++; from.money = Math.min(tune.max_money, from.money + tune.kill_money); }
  const me = match.human;
  feed(match, `${from ? from.name : 'La bomba'} ${from && from === me ? 'eliminaste a' : 'eliminó a'} ${t === me ? 'ti' : t.name}${from && from !== t ? ' (' + WEAPON[from.cur].name + ')' : ''}`,
    (from && from === me) || t === me);
  if (from && from.human && from !== t) { if (from === me) match.killT = 0.4; match.events.push({ type: 'killmark', p: from.id }); }
  if (match.bomb.state === 'carried' && match.bomb.carrier === t) {
    match.bomb.state = 'dropped'; match.bomb.x = t.x; match.bomb.z = t.z; match.bomb.y = t.st.y; match.bomb.carrier = null;
    if (me && sideOf(match, me) === 'att') say(match, t === me ? '¡Soltaste la bomba!' : '¡La bomba quedó en el suelo!');
  }
  if (match.bomb.defuser === t) match.bomb.defuser = null;
  if (t.human) { t.scoped = false; closeDesk(match, t); if (t === me) { match.spec = 0; nextSpec(match); } }
  match.events.push({ type: 'kill', who: t.name, by: from ? from.name : '' });
}

export function humanShoot(match: Match, p: Loose): void {
  const w = p.cur, a = p.ammo[w];
  if (p.reloadT > 0 || p.cool > 0) return;
  if (a.mag <= 0) { match.events.push({ type: 'empty', p: p.id }); p.cool = 0.25; if (a.res > 0) startReload(match, p); return; }
  a.mag--; p.cool = tune[w + '_rate'];
  if (a.mag > 0 && a.mag <= Math.ceil(tune[w + '_mag'] * 0.2)) match.events.push({ type: 'lowAmmo', p: p.id });
  const spread = humanSpread(match, p), eye = p.st.eye + p.st.jumpY;
  const yaw = p.yaw + (match.rng() - 0.5) * 2 * spread, pitch = p.pitch + p.recoil + (match.rng() - 0.5) * 2 * spread;
  p.recoil += w === 'sniper' ? 0.06 : w === 'rifle' ? 0.022 : w === 'smg' ? 0.014 : 0.03;
  if (w === 'sniper') p.scoped = false;
  const hx = -Math.sin(yaw), hz = -Math.cos(yaw), cp = Math.cos(pitch), tp = Math.tan(pitch);
  // walls and crates along the flat ray, or the floor when aimed down
  let wallT = 200;
  if (hasHeights) wallT = rayStop(p.x, p.z, p.st.y + eye, hx, hz, tp); // floors, ceilings, ramps, walls and crates at their height (story 011)
  else {
    for (let s = 0.2; s < 200; s += 0.2) if (solidSight(p.x + hx * s, p.z + hz * s)) { wallT = s; break; }
    if (pitch < -0.01) wallT = Math.min(wallT, eye / -tp);
  }
  let best = null, bestT = wallT, head = false;
  for (const e of match.players) {
    if (!e.alive || e.squad === p.squad) continue;
    const ox = e.x - p.x, oz = e.z - p.z, along = ox * hx + oz * hz;
    if (along <= 0) continue;
    const perp2 = ox * ox + oz * oz - along * along, r = 0.42;
    if (perp2 > r * r) continue;
    const t = along - Math.sqrt(r * r - perp2);
    const y = eye + tp * t + (p.st.y - e.st.y); // height over the target's feet
    if (y < 0 || y > 1.88 || t >= bestT) continue;
    best = e; bestT = t; head = y > 1.46;
  }
  const ex = p.x + hx * bestT, ez = p.z + hz * bestT, ey = p.st.y + eye + tp * bestT;
  const gx = p.x + hx * 0.6 - hz * 0.18, gz = p.z + hz * 0.6 + hx * 0.18;
  match.events.push({ type: 'shot', human: true, by: p.id, w, x: p.x, z: p.z, from: [gx, p.st.y + eye - 0.18, gz], to: [ex, ey, ez], spark: !best });
  p.flashT = 0.05;
  makeNoise(match, p.x, p.z, tune.bot_hear_shot, p.squad, p.st.y);
  if (best) {
    if (p === match.human) match.hitT = 0.15;
    match.events.push({ type: 'hit', p: p.id });
    applyDamage(match, best, tune[w + '_dmg'] * (head ? tune.headshot_mult : 1), p);
  }
  void cp;
}
/** The human's shot spread now, in radians: the gun, moving, the scope, then the stance and the air multipliers. */
export function humanSpread(match: Match, p: Loose): number {
  const s = p.cur === 'sniper' && p.scoped ? 0.002 : tune[p.cur + '_spread'] + (p.moving ? tune.move_spread : 0);
  const st = p.st, stance = st.stance === 'prone' ? tune.prone_spread_mult : st.stance === 'crouch' ? tune.crouch_spread_mult : 1;
  return s * stance * (st.jumpY > 0 || st.vy !== 0 ? tune.air_spread_mult : 1);
}
export function startReload(match: Match, p: Loose): void {
  const a = p.ammo[p.cur];
  if (p.reloadT > 0 || a.res <= 0 || a.mag >= tune[p.cur + '_mag']) return;
  p.reloadT = tune.reload_time; p.scoped = false; if (p.human) match.events.push({ type: 'reload', p: p.id, w: p.cur });
}
export function finishReload(p: Loose): void {
  const a = p.ammo[p.cur], need = tune[p.cur + '_mag'] - a.mag;
  if (p.human) { const n = Math.min(need, a.res); a.mag += n; a.res -= n; } else a.mag = tune[p.cur + '_mag'];
}
/** A noise at (x, z) made by a body of `squad`: every living enemy bot within r metres hears it (walls do not stop
 *  sound; on a map with heights a ceiling damps it, see bot_hear_floor_mult). A defender who hears it near a site raises the site alert; a bot not already fighting turns toward it
 *  and remembers where it was, to go and look when it has nothing better to do. With sight, the only way a bot
 *  learns where an enemy is. */
export function makeNoise(match: Match, x: number, z: number, r: number, squad: number, y = 0): void {
  for (const b of match.players) {
    if (b.human || !b.alive || b.squad === squad) continue;
    // Heights: a noise on the other level carries bot_hear_floor_mult of its range, unless a clear line joins the two (an opening, the ramp).
    const far = hasHeights && levelOfY(y) !== levelOfY(b.st.y) && !losClear(x, z, b.x, b.z, y + 1, b.st.y + 1) ? r * tune.bot_hear_floor_mult : r;
    if (Math.hypot(b.x - x, b.z - z) >= far) continue;
    siteAlert(match, b, x, z);
    if (b.target) continue;
    b.alertT = 1.2; b.alertYaw = yawTo(x - b.x, z - b.z); b.noiseX = x; b.noiseZ = z; if (hasHeights) b.noiseY = y; b.noiseNew = true; // noiseY only where there are heights, so a flat match's state is as before
  }
}
/** A defender bot that saw or heard an enemy at (x, z) within bot_site_alert metres of a site calls that site:
 *  the squad's other defenders (not the sniper) rotate there together. */
export function siteAlert(match: Match, b: Loose, x: number, z: number): void {
  if (sideOf(match, b) !== 'def') return;
  const toA = Math.hypot(x - center(SITE.A.cx), z - center(SITE.A.cy)), toB = Math.hypot(x - center(SITE.B.cx), z - center(SITE.B.cy));
  if (Math.min(toA, toB) < tune.bot_site_alert) match.alert = { squad: b.squad, site: toA < toB ? 'A' : 'B', t: match.t };
}
export function botShoot(match: Match, b: Loose, t: Loose): void {
  const w = b.cur;
  if (!b.ammo[w]) b.ammo[w] = { mag: tune[w + '_mag'], res: 999 };
  const a = b.ammo[w];
  if (b.reloadT > 0 || b.cool > 0) return;
  if (a.mag <= 0) { b.reloadT = tune.reload_time; return; }
  a.mag--; b.cool = tune[w + '_rate'] * tune.bot_fire_slow * (0.85 + match.rng() * 0.3);
  const d = Math.hypot(t.x - b.x, t.z - b.z);
  const stanceHit = !t.human ? 1 : t.st.stance === 'prone' ? tune.prone_hit_mult : t.st.stance === 'crouch' ? tune.crouch_hit_mult : 1;
  const chance = hitChance(level(match), tune.bot_acc_start, tune.bot_acc_end, WEAPON[w].botAcc, d, WEAPON[w].range, t.moving) * stanceHit;
  const hitIt = match.rng() < chance;
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  const gx = b.x + fx * 0.8 + fz * 0.14, gz = b.z + fz * 0.8 - fx * 0.14;
  const miss = hitIt ? 0 : (match.rng() - 0.5) * 2.2;
  const body = t.human ? t.st.eye / EYE : 1, lift = t.human ? t.st.jumpY : 0; // a person's body: lower when down, higher in a jump
  match.events.push({ type: 'shot', human: false, by: b.id, w, x: b.x, z: b.z, from: [gx, b.st.y + 1.3, gz], to: [t.x - fz * miss, t.st.y + (hitIt ? 1.2 : 1.0 + match.rng() * 1.2) * body + lift, t.z + fx * miss], spark: false });
  b.flashT = 0.06;
  makeNoise(match, b.x, b.z, tune.bot_hear_shot, b.squad, b.st.y);
  if (hitIt) applyDamage(match, t, tune[w + '_dmg'], b);
}
