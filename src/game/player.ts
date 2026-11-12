// The human as a player whose inputs come from outside: the buy menu, the question cards, movement,
// stance, weapons and the bomb. The rules read a PlayerInput snapshot, never a key or the mouse,
// so a screen (or, later, a student's connection) only has to fill one in. No browser in here.
import { EYE, zone, idx, cellOf, center, moveBody, SITE } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { startReload, finishReload, humanShoot, makeNoise } from './combat';
import { defuseBomb, plantBomb } from './bomb';
import { routeTo } from './plans';
import { closeCard, feed, openCard, say, sideOf, uiOpen, SHOP, WEAPON, type Match } from './state';

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
  /** Pressed: open or close the buy menu (and a buy card). */
  shop: boolean;
  /** Pressed: prone toggle, jump, primary gun, pistol, swap guns, reload, sniper scope. */
  prone: boolean; jump: boolean; primary: boolean; pistol: boolean; swap: boolean; reload: boolean; scope: boolean;
  /** Pressed: the number choices 0..4 (keys 1..5), ascending: a card's answer or a shop item. */
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
    lookLeft: false, lookRight: false, lookUp: false, lookDown: false, lookYaw: 0, lookPitch: 0, shop: false,
    prone: false, jump: false, primary: false, pistol: false, swap: false, reload: false, scope: false, digits: [],
    buyItem: '', answer: -1, closeShop: false, closeCard: false, spectate: false, spectateKey: false,
  };
}

/** True when the player stands in its own side's base (where it may buy). */
export function inOwnBase(match: Match, p: Loose): boolean { const z = zone[idx(cellOf(p.x), cellOf(p.z))]; return z === (sideOf(match, p) === 'att' ? 1 : 2); }
/** Why an item cannot be bought now, as the menu shows it (empty when it can). */
export function shopBlock(p: Loose, it: typeof SHOP[number]): string {
  if (it.id === 'armor' && p.armor >= 100) return 'Lleno';
  if (it.id === 'ammo' && Object.entries(p.ammo as Record<string, Loose>).every(([w, a]) => a.res >= tune[w + '_reserve'])) return 'Lleno';
  if (p.primary === it.id) return 'Comprada';
  if (p.money < tune[it.price]) return 'Falta $' + (tune[it.price] - p.money);
  return '';
}
/** Gives the human a bought item and takes its price. */
export function grant(match: Match, p: Loose, id: string): void {
  const it = SHOP.find(s => s.id === id)!;
  p.money -= tune[it.price];
  if (id === 'armor') p.armor = 100;
  else if (id === 'ammo') for (const [w, a] of Object.entries(p.ammo as Record<string, Loose>)) a.res = tune[w + '_reserve'];
  else { p.primary = id; p.cur = id; p.ammo[id] = { mag: tune[id + '_mag'], res: tune[id + '_reserve'] }; p.reloadT = 0; }
  feed(match, `Compraste: ${it.name}`, true);
  match.events.push({ type: 'buy', item: id });
}
export function answer(match: Match, i: number): void {
  const c = match.card, p = match.human;
  if (!c || c.wrongT > 0 || c.okT > 0 || i >= c.q.choices.length) return;
  c.picked = i;
  if (i === c.q.answer) { p.right++; match.wrongStreak = 0; c.okT = 0.35; match.events.push({ type: 'answer', right: true }); }
  else {
    p.wrong++; match.wrongStreak++;
    // The lockout grows by wrong_delay_growth for each wrong answer in a row, up to wrong_delay_max.
    c.wrongT = c.wrongTotal = Math.min(tune.wrong_delay_max, tune.wrong_delay * tune.wrong_delay_growth ** (match.wrongStreak - 1));
    match.deck.miss(c.q); match.events.push({ type: 'answer', right: false });
    if (c.kind === 'defuse') match.bomb.panicT = 1.6;
  }
}
export function updateCard(match: Match, dt: number, inp: PlayerInput): void {
  const c = match.card;
  c.anim = Math.min(1, c.anim + dt * 5);
  for (let k = 0; k < 4; k++) if (inp.digits.includes(k)) answer(match, k);
  if (c.okT > 0) {
    c.okT -= dt;
    if (c.okT <= 0) {
      if (c.kind === 'buy') { grant(match, match.human, c.item); match.card = null; }
      else {
        c.got++;
        if (c.got >= tune.defuse_answers) { match.card = null; defuseBomb(match, match.human); }
        else { c.q = match.deck.next(c.level); c.picked = -1; }
      }
    }
  } else if (c.wrongT > 0) {
    c.wrongT -= dt;
    if (c.wrongT <= 0) { c.q = match.deck.next(c.level); c.picked = -1; } // a wrong answer always brings a new question
  }
}
export function humanUpdate(match: Match, p: Loose, dt: number, inp: PlayerInput): void {
  p.cool = Math.max(0, p.cool - dt); p.flashT = Math.max(0, p.flashT - dt);
  p.recoil *= Math.exp(-dt * 7);
  if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) finishReload(p); }
  const live = match.phase === 'live', buy = match.phase === 'buy';
  // Stance: the prone change and the jump run even with a card open, so nothing stops mid-air.
  const f = inp.moveF, s = inp.moveS;
  const planting = live && match.bomb.carrier === p && inp.use;
  const walk = inp.walk, sprintKey = inp.sprint && !walk && (f !== 0 || s !== 0);
  if (match.me.proneT > 0) { match.me.proneT -= dt; if (match.me.proneT <= 0) { match.me.proneT = 0; match.me.prone = !match.me.prone; } }
  if (match.me.jumpY > 0 || match.me.vy !== 0) {
    match.me.vy -= tune.gravity * dt; match.me.jumpY += match.me.vy * dt;
    if (match.me.jumpY <= 0) { match.me.jumpY = 0; match.me.vy = 0; if (live) makeNoise(match, p.x, p.z, tune.bot_hear_land, p.squad); } // the landing is heard
  }
  match.me.sprint = sprintKey && !uiOpen(match) && !planting && !match.me.prone && match.me.proneT === 0;
  const crouch = !match.me.prone && !match.me.sprint && inp.crouch;
  match.me.stance = match.me.prone ? 'prone' : crouch ? 'crouch' : 'stand';
  const eyeTo = (match.me.proneT > 0 ? !match.me.prone : match.me.prone) ? tune.prone_eye : crouch ? tune.crouch_eye : EYE;
  match.me.eye += (eyeTo - match.me.eye) * Math.min(1, tune.eye_rate * dt);
  if (Math.abs(eyeTo - match.me.eye) < 0.002) match.me.eye = eyeTo;
  // Menus and cards first.
  if (inp.shop) {
    if (match.card && match.card.kind === 'buy') closeCard(match);
    else if (match.menu) match.menu = false;
    else if (buy && inOwnBase(match, p)) { match.menu = true; match.events.push({ type: 'unlock' }); }
    else say(match, buy ? 'Compra en tu propia base' : 'Solo se compra durante el tiempo de compra');
  }
  if (match.card && match.card.kind === 'defuse') {
    if (match.bomb.state !== 'planted') closeCard(match, true);
    else if (inp.usePress) closeCard(match);
  }
  if (match.card) { updateCard(match, dt, inp); p.moving = false; return; }
  if (match.menu) {
    if (!buy) { match.menu = false; say(match, 'Se acabó el tiempo de compra'); }
    for (let k = 0; k < SHOP.length; k++) if (inp.digits.includes(k)) tryBuy(match, SHOP[k].id);
    p.moving = false; return;
  }
  // Look with the arrow keys too.
  if (inp.lookLeft) p.yaw += tune.key_turn_speed * dt;
  if (inp.lookRight) p.yaw -= tune.key_turn_speed * dt;
  if (inp.lookUp) p.pitch = Math.min(1.4, p.pitch + tune.key_turn_speed * 0.6 * dt);
  if (inp.lookDown) p.pitch = Math.max(-1.4, p.pitch - tune.key_turn_speed * 0.6 * dt);
  // Stance keys: prone toggles (and takes prone_time), sprinting stands you up, a jump needs standing on the ground.
  const ground = match.me.jumpY === 0 && match.me.vy === 0, changing = match.me.proneT > 0;
  if (!changing && ground && (inp.prone || (match.me.prone && sprintKey))) match.me.proneT = tune.prone_time;
  if (inp.jump && ground && !changing && match.me.stance === 'stand') match.me.vy = tune.jump_velocity;
  // Move.
  let sp = walk ? tune.walk_speed : match.me.sprint ? tune.sprint_speed : tune.run_speed;
  if (p.cur === 'sniper') sp *= tune.sniper_speed_mult;
  if (p.scoped) sp *= 0.5;
  if (match.me.stance === 'prone') sp *= tune.prone_speed_mult; else if (match.me.stance === 'crouch') sp *= tune.crouch_speed_mult;
  if ((f || s) && !planting && match.me.proneT === 0) {
    const n = Math.hypot(f, s), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const mx = (fx * f + -fz * s) / n, mz = (fz * f + fx * s) / n;
    moveBody(p, mx * sp * dt, mz * sp * dt); p.moving = sp > tune.walk_speed + 0.1;
  } else p.moving = false;
  // Footsteps the enemy bots hear: sprinting carries far, running less; walking, crouched or prone is silent.
  const stepR = !live || !p.moving || match.me.jumpY > 0 ? 0 : match.me.sprint ? tune.bot_hear_sprint : match.me.stance === 'stand' ? tune.bot_hear_run : 0;
  if (stepR > 0 && Math.floor(match.t / tune.bot_step_interval) !== Math.floor((match.t - dt) / tune.bot_step_interval)) makeNoise(match, p.x, p.z, stepR, p.squad);
  // Weapons.
  if (inp.primary && p.primary && p.cur !== p.primary) { p.cur = p.primary; p.reloadT = 0; p.scoped = false; p.cool = 0.3; }
  if (inp.pistol && p.cur !== 'pistol') { p.cur = 'pistol'; p.reloadT = 0; p.scoped = false; p.cool = 0.25; }
  if (inp.swap && p.primary) { p.cur = p.cur === 'pistol' ? p.primary : 'pistol'; p.reloadT = 0; p.scoped = false; p.cool = 0.25; }
  if (inp.reload) startReload(match, p);
  if (inp.scope && p.cur === 'sniper' && p.reloadT <= 0) p.scoped = !p.scoped;
  if (live) {
    const auto = WEAPON[p.cur].auto;
    const trig = auto ? inp.fire : inp.firePress;
    if (trig && !match.me.sprint && match.me.proneT === 0) humanShoot(match, p);
  } else if (inp.firePress) say(match, 'Se puede disparar cuando se abran las puertas');
  // The bomb.
  const b = match.bomb;
  if (live && b.carrier === p) {
    const z = zone[idx(cellOf(p.x), cellOf(p.z))];
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
  if (live && b.state === 'planted' && sideOf(match, p) === 'def' && Math.hypot(p.x - b.x, p.z - b.z) < 2 && inp.usePress) {
    if (b.defuser && !b.defuser.human) { b.defuser.defusing = false; }
    b.defuser = p; openCard(match, 'defuse');
  }
}
export function tryBuy(match: Match, id: string): void {
  const p = match.human, it = SHOP.find(s => s.id === id)!, why = shopBlock(p, it);
  if (why) { say(match, `${it.name}: ${why}`); match.events.push({ type: 'click' }); return; }
  openCard(match, 'buy', id);
}
