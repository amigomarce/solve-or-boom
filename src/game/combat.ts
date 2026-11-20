// Shooting and damage: the human's shot, a bot's shot, armour, kills, reloads and the noises that bots hear.
// No browser in here: sounds, tracers and sparks are events in match.events for the screen to play and draw.
import { EYE, solidAt, center, SITE, hasHeights, rayStop, levelOfY, losClear } from './map';
import { yawTo, hitChance, armourHit } from './rules';
import { tune } from './tune';
import type { Loose } from './types';
import { closeDesk, feed, isDuel, isFfa, isRoam, isWaves, level, nextSpec, resetGuns, say, sideOf, tell, WEAPON, type Match } from './state';

export function applyDamage(match: Match, t: Loose, dmg: number, from: Loose): void {
  if (!t.alive || t.hidden) return; // story 021: a Free for All player buying at the start or a respawn cannot be hurt
  { const r = armourHit(dmg, t.armor, tune.armor_absorb); t.armor = r.armor; dmg = r.dmg; }
  t.hp -= dmg;
  if (t.human) {
    const yaw = yawTo(from.x - t.x, from.z - t.z);
    if (t === match.human) match.flashT = 0.35;
    match.events.push({ type: 'hurt', p: t.id, yaw });
    if (t === match.human) match.hurt.push({ yaw, t: 1.0 });
  } else if (!friendly(from, t)) { // a bot hit by a teammate (friendly fire) has no enemy to take cover from
    t.alertT = 1.5; t.alertYaw = yawTo(from.x - t.x, from.z - t.z); if (t.defusing) t.defusing = false;
    t.wantCover = true; t.threatX = from.x; t.threatZ = from.z;
  }
  if (t.hp <= 0) kill(match, t, from);
}
/** A hit by a teammate (friendly fire, story 017): the same squad, not oneself. */
const friendly = (from: Loose, t: Loose): boolean => !!from && from !== t && from.squad === t.squad;
export function kill(match: Match, t: Loose, from: Loose): void {
  t.alive = false; t.hp = 0; t.deaths++; t.deadT = 0; t.defusing = false; t.healT = 0; t.hunterT = 0; // story 018: dying ends a running Cazador (a kept one stays)
  // A teammate's death (friendly fire) counts for nothing: no kill, no money, no first-kill bonus, and no penalty to the shooter.
  const team = friendly(from, t);
  match.count?.kill(from && from !== t && !team ? from : null, t);
  if (from && from !== t && !team) {
    from.kills++; from.money = Math.min(tune.max_money, from.money + (isFfa(match) ? tune.ffa_kill_money : isDuel(match) ? tune.duel_kill_money : isWaves(match) ? tune.waves_kill_money : tune.kill_money)); // story 019: Free for All pays its own amount, with no first-kill bonus; 024: so does Duelo por equipos
    if (isDuel(match)) match.score[from.squad]++; // story 024: the team's kills are the match score
    if (!match.firstKill && !isRoam(match)) { // the round's first kill pays a bonus (story 016)
      match.firstKill = true; from.money = Math.min(tune.max_money, from.money + tune.first_kill_bonus);
      tell(match, from, `Primera baja: +$${tune.first_kill_bonus}`, 3);
    }
  }
  // What the dead leave (story 016): a medkit and ammo for the gun in hand, side by side, at the feet's height. Carried medkits are lost.
  t.medkits = 0;
  // Side by side, pickup_offset each way along x; a side that would lie inside a wall or crate falls back to the dead player's own spot.
  const h = t.st.y + 0.5, side = (dx: number): number => (solidAt(t.x + dx, t.z, h, h) ? t.x : t.x + dx);
  match.pickups.push({ id: match.nextPickupId++, kind: 'medkit', gun: '', x: side(-tune.pickup_offset), z: t.z, y: t.st.y, age: 0 },
    { id: match.nextPickupId++, kind: 'ammo', gun: t.cur, x: side(tune.pickup_offset), z: t.z, y: t.st.y, age: 0 });
  if (isRoam(match)) resetGuns(t); // story 019: the dead come back with the pistol (the drop above already took the gun in hand)
  const me = match.human;
  // "Tú eliminaste a Bot Kira", "Bot Kira te eliminó", "Bot Kira eliminó a Bot Rex", "La bomba te eliminó"
  const killer = from ? (from === me ? 'Tú' : from.name) : 'La bomba';
  const what = from && from === me ? (t === me ? 'te eliminaste' : `eliminaste a ${t.name}`) : t === me ? 'te eliminó' : `eliminó a ${t.name}`;
  feed(match, `${killer} ${what}${team ? ' (fuego amigo)' : from && from !== t ? ' (' + WEAPON[from.cur].name + ')' : ''}`,
    (from && from === me) || t === me, isDuel(match) && from && from !== t ? from.squad : undefined); // story 024: the killer's team
  if (from && from.human && from !== t && !team) { if (from === me) match.killT = 0.4; match.events.push({ type: 'killmark', p: from.id }); }
  if (match.bomb.state === 'carried' && match.bomb.carrier === t) {
    match.bomb.state = 'dropped'; match.bomb.x = t.x; match.bomb.z = t.z; match.bomb.y = t.st.y; match.bomb.carrier = null;
    if (me && sideOf(match, me) === 'att') say(match, t === me ? '¡Soltaste la bomba!' : '¡La bomba quedó en el suelo!');
  }
  if (match.bomb.defuser === t) match.bomb.defuser = null;
  if (t.human) { t.scoped = false; t.st.aimGun = ''; closeDesk(match, t); if (t === me) { match.spec = 0; nextSpec(match); } }
  const ev: Loose = team ? { type: 'kill', who: t.name, by: from.name, ff: true } : { type: 'kill', who: t.name, by: from ? from.name : '' }; // ff: a teammate's kill, for the classroom feed (protocol 7)
  if (isDuel(match) && from && from !== t) ev.bt = from.squad; // story 024 (protocol 15): the killer's team, for the classroom feed
  match.events.push(ev);
}

export function humanShoot(match: Match, p: Loose): void {
  const w = p.cur, a = p.ammo[w];
  if (p.reloadT > 0 || p.cool > 0) return;
  // No ammo at all (story 016): the trigger is a strike with the hands or the gun, a short ray along the aim, and quiet.
  const melee = a.mag <= 0 && a.res <= 0;
  if (a.mag <= 0 && !melee) { match.events.push({ type: 'empty', p: p.id }); p.cool = 0.25; startReload(match, p); return; }
  if (melee) p.cool = tune.melee_rate;
  else {
    a.mag--; p.cool = tune[w + '_rate'];
    if (a.mag > 0 && a.mag <= Math.ceil(tune[w + '_mag'] * 0.2)) match.events.push({ type: 'lowAmmo', p: p.id });
  }
  const spread = melee ? 0 : humanSpread(match, p), eye = p.st.eye + p.st.jumpY;
  // A strike draws no random numbers (no spread), so the match's random sequence goes on as if the trigger had clicked empty.
  const yaw = melee ? p.yaw : p.yaw + (match.rng() - 0.5) * 2 * spread, pitch = p.pitch + p.recoil + (melee ? 0 : (match.rng() - 0.5) * 2 * spread);
  if (!melee) p.recoil += w === 'sniper' ? 0.06 : w === 'gold' ? tune.gold_recoil : w === 'rifle' ? 0.022 : w === 'smg' ? 0.014 : 0.03;
  const hx = -Math.sin(yaw), hz = -Math.cos(yaw), cp = Math.cos(pitch), tp = Math.tan(pitch);
  // Walls, the floor, and on maps with heights floors, ceilings and ramps (story 011); crates as drawn (story 015): not out to
  // their cell's edge, and only up to their drawn height, so a shot over a crate's top flies on. The same ray on every map.
  const wallT = rayStop(p.x, p.z, p.st.y + eye, hx, hz, tp, melee ? tune.melee_range : 200, true);
  let best = null, bestT = wallT, head = false;
  for (const e of match.players) {
    if (!e.alive || e.hidden || e === p || (e.squad === p.squad && !match.opts.friendlyFire)) continue; // story 021: nobody shoots a hidden player
    const ox = e.x - p.x, oz = e.z - p.z, along = ox * hx + oz * hz;
    if (along <= 0) continue;
    const perp2 = ox * ox + oz * oz - along * along, r = tune.hit_radius;
    if (perp2 > r * r) continue;
    const t = along - Math.sqrt(r * r - perp2);
    const y = eye + tp * t + (p.st.y - e.st.y); // height over the target's feet
    if (y < 0 || y > 1.88 || t >= bestT) continue;
    best = e; bestT = t; head = y > 1.46;
  }
  if (melee) {
    match.events.push({ type: 'melee', p: p.id, hit: !!best });
    if (best) { if (p === match.human) match.hitT = 0.15; match.events.push({ type: 'hit', p: p.id }); applyDamage(match, best, tune.melee_dmg, p); }
    return;
  }
  const ex = p.x + hx * bestT, ez = p.z + hz * bestT, ey = p.st.y + eye + tp * bestT;
  // Where the shot and its tracer leave (story 015): the gun in the hand, or on the centre line at the sights when aimed (never the shoulder).
  // Pulled back toward the eye when a wall or crate is close, so the start is never inside one: first along the ray, then onto the centre line
  // when the gun's side point is inside a crate beside the shooter, then the eye itself.
  const fwd = tune.muzzle_fwd, down = p.scoped ? tune.sights_down : tune.muzzle_down;
  let k = Math.min(1, Math.max(0, (wallT - 0.05) / fwd)), side = p.scoped ? 0 : tune.muzzle_side;
  if (side && solidAt(p.x + (hx * fwd - hz * side) * k, p.z + (hz * fwd + hx * side) * k, p.st.y + eye - down * k, p.st.y + eye - down * k, true)) side = 0;
  if (solidAt(p.x + (hx * fwd - hz * side) * k, p.z + (hz * fwd + hx * side) * k, p.st.y + eye - down * k, p.st.y + eye - down * k, true)) k = 0;
  const gx = p.x + (hx * fwd - hz * side) * k, gz = p.z + (hz * fwd + hx * side) * k;
  match.events.push({ type: 'shot', human: true, by: p.id, w, x: p.x, z: p.z, from: [gx, p.st.y + eye - down * k, gz], to: [ex, ey, ez], spark: !best });
  p.flashT = 0.05;
  makeNoise(match, p.x, p.z, tune.bot_hear_shot, p.squad, p.st.y);
  if (best) {
    if (p === match.human) match.hitT = 0.15;
    match.events.push({ type: 'hit', p: p.id });
    applyDamage(match, best, tune[w + '_dmg'] * (head ? tune.headshot_mult : 1), p);
  }
  void cp;
}
/** The human's shot spread now, in radians: aimed, the gun's own aimed spread; otherwise the gun and moving. Then the stance and the air multipliers. */
export function humanSpread(match: Match, p: Loose): number {
  const s = p.scoped ? tune[p.cur + '_aim_spread'] : tune[p.cur + '_spread'] + (p.moving ? tune.move_spread : 0);
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
  if (isDuel(match) || isWaves(match) || sideOf(match, b) !== 'def') return; // no sites in Duelo por equipos
  const toA = Math.hypot(x - center(SITE.A.cx), z - center(SITE.A.cy)), toB = Math.hypot(x - center(SITE.B.cx), z - center(SITE.B.cy));
  if (Math.min(toA, toB) < tune.bot_site_alert) match.alert = { squad: b.squad, site: toA < toB ? 'A' : 'B', t: match.t };
}
export function botShoot(match: Match, b: Loose, t: Loose): void {
  if (t.hidden) return; // story 021: nobody shoots a hidden player
  const w = b.cur;
  if (!b.ammo[w]) b.ammo[w] = { mag: tune[w + '_mag'], res: 999 };
  const a = b.ammo[w];
  if (b.reloadT > 0 || b.cool > 0) return;
  if (a.mag <= 0) { b.reloadT = tune.reload_time; return; }
  a.mag--; b.cool = tune[w + '_rate'] * tune.bot_fire_slow * (0.85 + match.rng() * 0.3);
  const d = Math.hypot(t.x - b.x, t.z - b.z);
  const stanceHit = !t.human ? 1 : t.st.stance === 'prone' ? tune.prone_hit_mult : t.st.stance === 'crouch' ? tune.crouch_hit_mult : 1;
  const am = tune[`bot_${match.opts.botLevel}_acc_mult`]; // the bot level (story 017); Normal is 1
  const chance = hitChance(level(match, b), tune.bot_acc_start * am, tune.bot_acc_end * am, WEAPON[w].botAcc, d, WEAPON[w].range, t.moving) * stanceHit;
  const hitIt = match.rng() < chance;
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  const gx = b.x + fx * 0.8 + fz * 0.14, gz = b.z + fz * 0.8 - fx * 0.14;
  const miss = hitIt ? 0 : (match.rng() - 0.5) * 2.2;
  const body = t.human ? t.st.eye / EYE : 1, lift = t.human ? t.st.jumpY : 0; // a person's body: lower when down, higher in a jump
  match.events.push({ type: 'shot', human: false, by: b.id, w, x: b.x, z: b.z, from: [gx, b.st.y + 1.3, gz], to: [t.x - fz * miss, t.st.y + (hitIt ? 1.2 : 1.0 + match.rng() * 1.2) * body + lift, t.z + fx * miss], spark: false });
  b.flashT = 0.06;
  makeNoise(match, b.x, b.z, tune.bot_hear_shot, b.squad, b.st.y);
  if (hitIt) {
    // Friendly fire (story 017): a teammate standing in the line, nearer than the target, takes the shot. No random numbers are drawn here.
    let victim = t;
    if (match.opts.friendlyFire) {
      const dx = (t.x - b.x) / (d || 1), dz = (t.z - b.z) / (d || 1);
      let near = d;
      for (const q of match.players) {
        if (q === b || q === t || !q.alive || q.hidden || q.squad !== b.squad || Math.abs(q.st.y - b.st.y) > tune.ff_line_dy) continue;
        const ox = q.x - b.x, oz = q.z - b.z, along = ox * dx + oz * dz, perp = Math.abs(ox * dz - oz * dx);
        if (along > tune.ff_line_min && along < near && perp < tune.hit_radius) { victim = q; near = along; }
      }
    }
    applyDamage(match, victim, tune[w + '_dmg'], b);
  }
}
