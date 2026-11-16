// The human as a player whose inputs come from outside: the buy menu, the question cards, movement,
// stance, weapons and the bomb. The rules read a PlayerInput snapshot, never a key or the mouse,
// so a screen (or, later, a student's connection) only has to fill one in. No browser in here.
import { EYE, zone, idx, cellOf, center, moveBody, zoneAt, SITE } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { startReload, finishReload, humanShoot, makeNoise } from './combat';
import { defuseBomb, plantBomb } from './bomb';
import { routeTo } from './plans';
import { streakRight, streakWrong, useAbility, hunterTick, hunterSpeed } from './streak';
import { respawn } from './ffa';
import { closeCard, deskOf, feed, isFfa, openCard, personal, tell, sideOf, uiOpen, SHOP, WEAPON, type Match, type Pickup, type Stance } from './state';

/**
 * One human player's inputs for one step: actions, not keys. "Held" fields are true while the control is
 * down; the others are true only for the step it went down. The screen builds one from its own key bindings.
 * @example const inp = { ...idleInput(), moveF: 1, fire: true }; step(match, { [match.human.id]: inp }, STEP);
 */
export interface PlayerInput {
  /** Held: forward minus back (-1, 0, 1). */
  moveF: number;
  /** Held: right minus left (-1, 0, 1). */
  moveS: number;
  /** Held: walk (quiet and slow), sprint, crouch. */
  walk: boolean; sprint: boolean; crouch: boolean;
  /** Held: plant the bomb. Pressed: start or stop defusing. */
  use: boolean; usePress: boolean;
  /** Held: the trigger (automatic guns). Pressed: one shot (the others). */
  fire: boolean; firePress: boolean;
  /** Held: turn with the keys (the arrow keys). */
  lookLeft: boolean; lookRight: boolean; lookUp: boolean; lookDown: boolean;
  /** Radians the aim turned since the last step (the mouse): added to yaw and pitch, pitch kept within ±1.4. */
  lookYaw: number; lookPitch: number;
  /** Class mode only: the student's own aim after this input's turn, in radians. When present the server takes it as the aim
   *  instead of adding lookYaw / lookPitch, so an input lost on the way (a wifi hiccup, a full queue) cannot leave the
   *  server's aim off from the crosshair the student sees. Absent in single player. */
  aimYaw?: number; aimPitch?: number;
  /** Pressed: open or close the buy menu (and a buy card). */
  shop: boolean;
  /** Pressed: prone toggle, jump, primary gun, pistol, swap guns, reload. Held: scope, aiming down the sights. */
  prone: boolean; jump: boolean; primary: boolean; pistol: boolean; swap: boolean; reload: boolean; scope: boolean;
  /** Pressed: use a carried medkit (story 016). */
  medkit: boolean;
  /** Pressed: use the kept ability, the Cazador (story 018). */
  ability: boolean;
  /** Pressed: the number choices 0..5 (keys 1..6), ascending: a card's answer or a shop item. */
  digits: number[];
  /** Clicked: buy this shop item id ('' for none). */
  buyItem: string;
  /** Clicked: this answer on the card (-1 for none). */
  answer: number;
  /** Clicked: close the buy menu, close the card, the next player to spectate. */
  closeShop: boolean; closeCard: boolean; spectate: boolean;
  /** Pressed: the next player to spectate, when dead (the Space key). */
  spectateKey: boolean;
}

/** An input with nothing held or pressed. */
export function idleInput(): PlayerInput {
  return {
    moveF: 0, moveS: 0, walk: false, sprint: false, crouch: false, use: false, usePress: false, fire: false, firePress: false,
    lookLeft: false, lookRight: false, lookUp: false, lookDown: false, lookYaw: 0, lookPitch: 0, shop: false, medkit: false, ability: false,
    prone: false, jump: false, primary: false, pistol: false, swap: false, reload: false, scope: false, digits: [],
    buyItem: '', answer: -1, closeShop: false, closeCard: false, spectate: false, spectateKey: false,
  };
}

/** True when the player stands in its own side's base (where it may buy). */
export function inOwnBase(match: Match, p: Loose): boolean { const z = zone[idx(cellOf(p.x), cellOf(p.z))]; return z === (sideOf(match, p) === 'att' ? 1 : 2); }
/** Why an item cannot be bought now, as the menu shows it (empty when it can). */
export function shopBlock(p: Loose, it: typeof SHOP[number]): string {
  if (it.id === 'armor' && p.armor >= 100) return 'Lleno';
  if (it.id === 'medkit' && p.medkits >= tune.medkit_max) return 'Lleno';
  if (it.id === 'ammo' && Object.entries(p.ammo as Record<string, Loose>).every(([w, a]) => a.res >= tune[w + '_reserve'])) return 'Lleno';
  if (p.primary === it.id) return 'Comprada';
  if (p.primary === 'gold' && WEAPON[it.id]) return 'Tienes el Rifle dorado'; // story 018: a bought gun would replace it
  if (p.money < tune[it.price]) return 'Falta $' + (tune[it.price] - p.money);
  return '';
}
/** Gives a person a bought item and takes its price. */
export function grant(match: Match, p: Loose, id: string): void {
  const it = SHOP.find(s => s.id === id)!;
  p.money -= tune[it.price];
  if (id === 'armor') p.armor = 100;
  else if (id === 'medkit') p.medkits++;
  else if (id === 'ammo') for (const [w, a] of Object.entries(p.ammo as Record<string, Loose>)) a.res = tune[w + '_reserve'];
  else { p.primary = id; p.cur = id; p.ammo[id] = { mag: tune[id + '_mag'], res: tune[id + '_reserve'] }; p.reloadT = 0; }
  if (p === match.human) feed(match, `Compraste: ${it.name}`, true);
  personal(match, p, { type: 'buy', item: id });
}
/**
 * Person `p` answers their open card with choice `i`. Ignored with no card, during the wrong-answer lockout, while a
 * right answer is being confirmed, or out of range: the server's check for a classroom student's answer.
 */
export function answer(match: Match, p: Loose, i: number): void {
  const d = deskOf(match, p), c = d.card;
  if (!c || c.wrongT > 0 || c.okT > 0 || i >= c.q.choices.length) return;
  c.picked = i;
  if (i === c.q.answer) { p.right++; match.count?.answer(p, true, c.q.topic, c.q.level ?? ''); d.wrongStreak = 0; streakRight(match, p); c.okT = 0.35; personal(match, p, { type: 'answer', right: true }); }
  else {
    p.wrong++; match.count?.answer(p, false, c.q.topic, c.q.level ?? ''); d.wrongStreak++; streakWrong(p);
    // The lockout grows by wrong_delay_growth for each wrong answer in a row, up to wrong_delay_max.
    c.wrongT = c.wrongTotal = c.kind === 'respawn' ? tune.ffa_wrong_wait // story 019: a fixed wait, then another question
      : Math.min(tune.wrong_delay_max, tune.wrong_delay * tune.wrong_delay_growth ** (d.wrongStreak - 1));
    d.deck.miss(c.q); personal(match, p, { type: 'answer', right: false });
    if (c.kind === 'defuse') match.bomb.panicT = 1.6;
  }
}
/** One step of `p`'s open card: number keys answer, a confirmed right answer completes the buy or defuse, a lockout ends in a new question. */
export function updateCard(match: Match, p: Loose, dt: number, inp: PlayerInput): void {
  const d = deskOf(match, p), c = d.card;
  c.anim = Math.min(1, c.anim + dt * 5);
  for (let k = 0; k < 4; k++) if (inp.digits.includes(k)) answer(match, p, k);
  if (c.okT > 0) {
    c.okT -= dt;
    if (c.okT <= 0) {
      if (c.kind === 'buy') { grant(match, p, c.item); d.card = null; }
      else if (c.kind === 'respawn') { d.card = null; respawn(match, p); } // story 019: the right answer brings the player back
      else {
        c.got++;
        if (c.got >= tune.defuse_answers) { d.card = null; defuseBomb(match, p); }
        else { c.q = d.deck.next(c.level); c.picked = -1; }
      }
    }
  } else if (c.wrongT > 0) {
    c.wrongT -= dt;
    if (c.wrongT <= 0) { c.q = d.deck.next(c.level); c.picked = -1; } // a wrong answer always brings a new question
  }
}
/**
 * The first part of a human's step, shared by the server and a client's prediction: the prone change, the jump,
 * the sprint flag, the crouch and the eye height. `quiet` skips the landing noise the bots hear (a prediction
 * must not wake the copies of the bots it holds).
 */
export function stanceStep(match: Match, p: Loose, dt: number, inp: PlayerInput, quiet = false): void {
  const me = p.st as Stance, live = match.phase === 'live';
  const f = inp.moveF, s = inp.moveS;
  const planting = live && match.bomb.carrier === p && inp.use;
  const walk = inp.walk, sprintKey = inp.sprint && !walk && (f !== 0 || s !== 0);
  if (me.proneT > 0) { me.proneT -= dt; if (me.proneT <= 0) { me.proneT = 0; me.prone = !me.prone; } }
  if (me.jumpY > 0 || me.vy !== 0) {
    me.vy -= tune.gravity * dt; me.jumpY += me.vy * dt;
    if (me.jumpY <= 0) { me.jumpY = 0; me.vy = 0; if (live && !quiet) makeNoise(match, p.x, p.z, tune.bot_hear_land, p.squad, p.st.y); } // the landing is heard
  }
  // Aim (story 013): a held control. A gun switch, a reload, a menu, the bomb or death ends it until the button is let go.
  if (!inp.scope || !p.alive || planting || uiOpen(deskOf(match, p))) me.aimGun = '';
  else if (me.aimGun === '') me.aimGun = p.reloadT > 0 ? '!' : p.cur;
  else if (me.aimGun !== p.cur || p.reloadT > 0) me.aimGun = '!';
  p.scoped = me.aimGun !== '' && me.aimGun !== '!';
  me.sprint = sprintKey && !uiOpen(deskOf(match, p)) && !planting && !p.scoped && !me.prone && me.proneT === 0;
  const crouch = !me.prone && !me.sprint && inp.crouch;
  me.stance = me.prone ? 'prone' : crouch ? 'crouch' : 'stand';
  const eyeTo = (me.proneT > 0 ? !me.prone : me.prone) ? tune.prone_eye : crouch ? tune.crouch_eye : EYE;
  me.eye += (eyeTo - me.eye) * Math.min(1, tune.eye_rate * dt);
  if (Math.abs(eyeTo - me.eye) < 0.002) me.eye = eyeTo;
}
/**
 * The second part: the arrow-key look, the stance keys (prone, jump) and the walk itself, with the footstep
 * noise the bots hear (skipped when `quiet`). A client predicts its own player with stanceStep + moveStep;
 * the mouse look (lookYaw, lookPitch) is applied by the caller before them.
 */
export function moveStep(match: Match, p: Loose, dt: number, inp: PlayerInput, quiet = false): void {
  const me = p.st as Stance, live = match.phase === 'live';
  const f = inp.moveF, s = inp.moveS;
  const planting = live && match.bomb.carrier === p && inp.use;
  const walk = inp.walk, sprintKey = inp.sprint && !walk && (f !== 0 || s !== 0);
  // Look with the arrow keys too.
  if (inp.lookLeft) p.yaw += tune.key_turn_speed * dt;
  if (inp.lookRight) p.yaw -= tune.key_turn_speed * dt;
  if (inp.lookUp) p.pitch = Math.min(1.4, p.pitch + tune.key_turn_speed * 0.6 * dt);
  if (inp.lookDown) p.pitch = Math.max(-1.4, p.pitch - tune.key_turn_speed * 0.6 * dt);
  // Stance keys: prone toggles (and takes prone_time), sprinting stands you up, a jump needs standing on the ground.
  const ground = me.jumpY === 0 && me.vy === 0, changing = me.proneT > 0;
  if (!changing && ground && (inp.prone || (me.prone && sprintKey))) me.proneT = tune.prone_time;
  if (inp.jump && ground && !changing && me.stance === 'stand') me.vy = tune.jump_velocity;
  // Move.
  let sp = walk ? tune.walk_speed : me.sprint ? tune.sprint_speed : tune.run_speed;
  if (p.cur === 'sniper') sp *= tune.sniper_speed_mult;
  if (p.scoped) sp *= tune[p.cur + '_aim_speed'];
  if (me.stance === 'prone') sp *= tune.prone_speed_mult; else if (me.stance === 'crouch') sp *= tune.crouch_speed_mult;
  sp *= hunterSpeed(p); // story 018: the Cazador's bonus
  if ((f || s) && !planting && me.proneT === 0) {
    const n = Math.hypot(f, s), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const mx = (fx * f + -fz * s) / n, mz = (fz * f + fx * s) / n;
    moveBody(p, mx * sp * dt, mz * sp * dt); p.moving = sp / hunterSpeed(p) > tune.walk_speed + 0.1;
  } else p.moving = false;
  // Footsteps the enemy bots hear: sprinting carries far, running less; walking, crouched or prone is silent.
  const stepR = !live || !p.moving || me.jumpY > 0 ? 0 : me.sprint ? tune.bot_hear_sprint : me.stance === 'stand' ? tune.bot_hear_run : 0;
  if (!quiet && stepR > 0 && Math.floor(match.t / tune.bot_step_interval) !== Math.floor((match.t - dt) / tune.bot_step_interval)) makeNoise(match, p.x, p.z, stepR, p.squad, p.st.y);
}
/** Stops a medkit being used: nothing is spent and no health is given. */
function stopHeal(match: Match, p: Loose): void { p.healT = 0; tell(match, p, 'Curación cancelada: el botiquín no se gastó', 2); }
/** When each player last heard "Ya tienes toda la vida", so pressing the medkit key at full health does not repeat it every press. */
const fullMsgAt = new WeakMap<Loose, number>();
/** The guns `q` holds whose reserve is not full: what a dropped ammo box refills. */
function hungryGuns(q: Loose): string[] {
  return [q.primary, 'pistol'].filter((g): g is string => !!g && !!q.ammo[g] && q.ammo[g].res < tune[g + '_reserve']);
}
/** True when `q` is close enough to pickup `k` (radius and height) and has room for it: a medkit while carrying fewer than `medkit_max`, ammo while a held gun's reserve is not full. */
function canTake(q: Loose, k: Pickup): boolean {
  if (Math.hypot(k.x - q.x, k.z - q.z) > tune.pickup_radius || Math.abs(k.y - q.st.y) > tune.pickup_reach_y) return false;
  return k.kind === 'medkit' ? q.medkits < tune.medkit_max : hungryGuns(q).length > 0;
}

/**
 * One step of a person's player: stance, their buy menu and question card (deskOf), movement, weapons,
 * shooting and the bomb. `p` is any human player (the single-player one, or a student in a classroom room).
 */
export function humanUpdate(match: Match, p: Loose, dt: number, inp: PlayerInput): void {
  p.cool = Math.max(0, p.cool - dt); p.flashT = Math.max(0, p.flashT - dt);
  p.recoil *= Math.exp(-dt * 7);
  if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) finishReload(p); }
  const live = match.phase === 'live', buy = match.phase === 'buy' || isFfa(match), me = p.st as Stance, d = deskOf(match, p); // Free for All: the menu is open after a respawn, any time
  // Stance: the prone change and the jump run even with a card open, so nothing stops mid-air.
  stanceStep(match, p, dt, inp);
  hunterTick(p, dt); // story 018: a running Cazador's clock runs with a menu or card open too
  // The person's menu and card first.
  if (inp.shop) {
    if (d.card && d.card.kind === 'buy') closeCard(match, p);
    else if (d.menu) d.menu = false;
    else if (isFfa(match)) tell(match, p, 'La tienda se abre cuando reapareces');
    else if (buy && inOwnBase(match, p)) { d.menu = true; personal(match, p, { type: 'unlock' }); }
    else tell(match, p, buy ? 'Compra en tu propia base' : 'Solo se compra durante el tiempo de compra');
  }
  if (d.card && d.card.kind === 'defuse') {
    if (match.bomb.state !== 'planted') closeCard(match, p, true);
    else if (inp.usePress) closeCard(match, p);
  }
  if (p.healT > 0 && (d.card || d.menu)) stopHeal(match, p); // a menu or a card stops a medkit being used
  if (d.card) { updateCard(match, p, dt, inp); p.moving = false; return; }
  if (d.menu) {
    if (!buy) { d.menu = false; tell(match, p, 'Se acabó el tiempo de compra'); }
    for (let k = 0; k < SHOP.length; k++) if (inp.digits.includes(k)) tryBuy(match, p, SHOP[k].id);
    p.moving = false; return;
  }
  moveStep(match, p, dt, inp);
  if (inp.ability) useAbility(match, p); // story 018: a kept Cazador starts; anything else is refused
  // Medkits (story 016): using a carried one takes tune.medkit_time seconds, walking allowed; it is spent and heals
  // tune.medkit_heal when the time is up. Shooting, reloading or changing gun first stops it and keeps the medkit. Full health keeps the medkit.
  if (p.healT > 0) {
    if (inp.fire || inp.firePress || inp.reload || inp.swap || inp.primary || inp.pistol) stopHeal(match, p);
    else if ((p.healT -= dt) <= 0) { p.healT = 0; p.medkits--; p.hp = Math.min(tune.max_hp, p.hp + tune.medkit_heal); personal(match, p, { type: 'pickup', kind: 'heal' }); }
  } else if (inp.medkit) {
    if (p.hp >= tune.max_hp) { if (match.t - (fullMsgAt.get(p) ?? -99) > tune.medkit_full_msg_s) { fullMsgAt.set(p, match.t); tell(match, p, 'Ya tienes toda la vida'); } }
    else if (p.medkits <= 0) tell(match, p, 'No tienes botiquines: se compran en el menú');
    else p.healT = tune.medkit_time;
  }
  for (let i = match.pickups.length - 1; i >= 0; i--) {
    const k = match.pickups[i], dist = Math.hypot(k.x - p.x, k.z - p.z);
    if (!canTake(p, k)) continue;
    // Two players over it on the same step: the nearer one takes it, whatever the seat order (each is checked on their own step).
    if (match.players.some(q => q !== p && q.human && q.alive && canTake(q, k) && Math.hypot(k.x - q.x, k.z - q.z) < dist)) continue;
    // Taken by walking over it (story 016, changed after the classroom test): a medkit goes into the pack, ammo tops up every held gun that is not full.
    if (k.kind === 'medkit') { p.medkits++; tell(match, p, `Botiquín recogido (${p.medkits}/${tune.medkit_max})`, 2); }
    else {
      const guns = hungryGuns(p);
      for (const g of guns) p.ammo[g].res = Math.min(tune[g + '_reserve'], p.ammo[g].res + Math.ceil(tune[g + '_mag'] * tune.drop_ammo_mags));
      tell(match, p, `Munición: ${guns.map(g => WEAPON[g].name).join(' y ')}`, 2);
    }
    match.pickups.splice(i, 1); personal(match, p, { type: 'pickup', kind: k.kind });
  }
  // Weapons.
  if (inp.primary && p.primary && p.cur !== p.primary) { p.cur = p.primary; p.reloadT = 0; p.scoped = false; p.cool = 0.3; }
  if (inp.pistol && p.cur !== 'pistol') { p.cur = 'pistol'; p.reloadT = 0; p.scoped = false; p.cool = 0.25; }
  if (inp.swap && p.primary) { p.cur = p.cur === 'pistol' ? p.primary : 'pistol'; p.reloadT = 0; p.scoped = false; p.cool = 0.25; }
  if (inp.reload) startReload(match, p);
  if (live) {
    const auto = WEAPON[p.cur].auto;
    const trig = auto ? inp.fire : inp.firePress;
    if (trig && !me.sprint && me.proneT === 0) humanShoot(match, p);
  } else if (inp.firePress) tell(match, p, 'Se puede disparar cuando se abran las puertas');
  // The bomb.
  const b = match.bomb;
  if (live && b.carrier === p) {
    const z = zoneAt(cellOf(p.x), cellOf(p.z), me.y); // the zone on the level the person stands on
    if ((z === 3 || z === 4) && inp.use) {
      match.plantT += dt;
      if (match.plantT >= tune.plant_time) plantBomb(match, p);
    } else match.plantT = 0;
    // Your bot teammates follow you to the site you head for.
    for (const k of ['A', 'B']) {
      if (match.attackSite !== k && Math.hypot(p.x - center(SITE[k].cx), p.z - center(SITE[k].cy)) < 20) {
        match.attackSite = k;
        for (const q of match.players) if (!q.human && q.squad === p.squad && q.alive && q.routeKind !== 'hold') routeTo(match, q, 'site');
      }
    }
  }
  if (live && b.state === 'planted' && sideOf(match, p) === 'def' && Math.hypot(p.x - b.x, p.z - b.z) < 2 && Math.abs(me.y - b.y) < tune.bomb_reach_y && inp.usePress) {
    // One student defuses at a time: a teammate's open defuse card keeps the bomb theirs.
    if (b.defuser && b.defuser !== p && b.defuser.human && deskOf(match, b.defuser).card?.kind === 'defuse') tell(match, p, 'Un compañero ya está desactivando la bomba');
    else {
      if (b.defuser && !b.defuser.human) { b.defuser.defusing = false; }
      b.defuser = p; openCard(match, p, 'defuse');
    }
  }
}
/** Opens `p`'s buy card for a shop item, or says why it cannot be bought (an unknown id does nothing). */
export function tryBuy(match: Match, p: Loose, id: string): void {
  const it = SHOP.find(s => s.id === id);
  if (!it) return;
  const why = shopBlock(p, it);
  if (why) { tell(match, p, `${it.name}: ${why}`); personal(match, p, { type: 'click' }); return; }
  openCard(match, p, 'buy', id);
}
