// The match without a screen: build one from the session's choices and a seed, then step it with each
// human player's inputs. The browser game (src/main.ts) and, later, the classroom server both run it
// this way and read the same state and events. No browser in here.
//
//   const m = createMatch({ seed: 7, subject: 'matematicas', level: 'medio', topics: ['arith'], custom: [], customName: '', map: 'pequeno' });
//   for (let i = 0; i < 600; i++) { step(m, { [m.human.id]: { ...idleInput(), moveF: 1 } }, STEP); m.events.length = 0; }
//   m.round, m.score, m.players[0].money, m.bomb.state
import { MAP_ID, loadMap, mapState } from './map';
import { tune, CONFIG } from './tune';
import { updateBomb } from './bomb';
import { botUpdate } from './bots';
import { humanUpdate, updateCard, grant, tryBuy, answer, idleInput, type PlayerInput } from './player';
import { afterRound, checkRound, startRound } from './rounds';
import { startFfa, ffaTick, syncHidden } from './ffa';
import { startDuel, duelTick } from './teamduel';
import { startWaves, wavesTick } from './waves';
import { blankMatch, closeCard, deskOf, isDuel, isFfa, isRoam, isWaves, mulberry32, nextSpec, say, setMode, sideOf, type Match, type MatchOptions } from './state';
import * as QUESTIONS from '../questions';

export * from './state';
export { idleInput, shopBlock, inOwnBase, type PlayerInput } from './player';

/**
 * A match ready to play: the map loaded, the question deck drawn from the seed, round 1 in its buy time.
 * Pushes the 'round' and 'match' events.
 * @example const m = createMatch({ seed: 7, subject: 'matematicas', level: 'medio', topics: ['arith'], custom: [], customName: '', map: 'pequeno' });
 */
export function createMatch(opts: MatchOptions): Match {
  if (MAP_ID !== opts.map) loadMap(opts.map);
  const match = blankMatch(opts.seed, opts.humans ?? [0]);
  match.classroom = !!opts.classroom;
  // Story 017: absent = today's game (friendly fire off, the config's buy time, bots Normal); a classroom's bots are always Normal.
  const bt = Number(opts.buyTime), lim = CONFIG.buy_time;
  match.opts = {
    subject: opts.subject, level: opts.level, map: opts.map, friendlyFire: !!opts.friendlyFire,
    buyTime: Number.isFinite(bt) ? Math.min(lim.max, Math.max(lim.min, bt)) : tune.buy_time,
    botLevel: !opts.classroom && (opts.botLevel === 'facil' || opts.botLevel === 'dificil') ? opts.botLevel : 'normal',
    streakRewards: opts.streakRewards !== false, // story 018: on unless turned off
  } as Match['opts']; // opts.mode is set hidden just below (setMode)
  setMode(match, opts.mode === 'ffa' ? 'ffa' : opts.mode === 'duel' ? 'duel' : opts.mode === 'waves' ? 'waves' : 'bomb'); // story 019, 024, 025
  if (isWaves(match)) match.opts.friendlyFire = false; // story 025: no friendly fire in Oleadas cooperativas
  const topics = opts.subject === QUESTIONS.CUSTOM ? [] : opts.topics;
  match.deck = QUESTIONS.deck(opts.subject, topics, opts.level, opts.custom, match.rng);
  // A classroom student's own deck (deskOf): same choices, its own seeded random, so it never draws from match.rng.
  if (match.classroom) match.newDeck = (id: number) => QUESTIONS.deck(opts.subject, topics, opts.level, opts.custom, mulberry32((opts.seed ^ Math.imul(id + 1, 0x9E3779B1)) >>> 0));
  match.subjectLabel = opts.subject === QUESTIONS.CUSTOM ? `${QUESTIONS.CUSTOM_NAME} (${opts.customName})`
    : `${QUESTIONS.SUBJECTS[opts.subject].name}: ${topics.map(t => QUESTIONS.SUBJECTS[opts.subject].topics[t]).join(', ')}`;
  if (isFfa(match)) startFfa(match); else if (isDuel(match)) startDuel(match); else if (isWaves(match)) startWaves(match); else startRound(match);
  match.events.push({ type: 'match', subject: opts.subject });
  return match;
}

/**
 * One fixed step of the match (dt seconds, normally STEP): the human's inputs, the phase clock, every player,
 * the bomb and the round's end, then the timers. `inputs` holds each human player's snapshot by player id; a
 * missing one is an idle input. The match's map and gates are loaded first, so several matches can take turns in one process. What happened is pushed to match.events, for the caller to read and empty.
 * @example step(m, { [m.human.id]: { ...idleInput(), fire: true } }, STEP);
 */
export function step(match: Match, inputs: Record<number, PlayerInput>, dt: number): void {
  if (match.over) return;
  if (MAP_ID !== match.opts.map) loadMap(match.opts.map); // another room may have left its map loaded
  mapState.gatesClosed = match.gatesClosed;
  const human = match.human;
  // Each person's look, then their menu and card clicks (in a classroom, every student's), then the viewer's spectator clicks.
  for (const p of match.players) {
    if (!p.human) continue;
    const inp = inputs[p.id] ?? idleInput();
    if (inp.aimYaw !== undefined && inp.aimPitch !== undefined) { // a student's own aim, as their screen shows it (class mode)
      p.yaw = inp.aimYaw;
      p.pitch = Math.max(-1.4, Math.min(1.4, inp.aimPitch));
    } else if (inp.lookYaw || inp.lookPitch) { // the aim answers the hand at once: no smoothing
      p.yaw += inp.lookYaw;
      p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch + inp.lookPitch));
    }
    if (p !== human && !match.classroom) continue;
    const d = deskOf(match, p);
    // A student's buy click counts only from their open menu with no card: the menu itself checks buy time and base.
    if (inp.buyItem && (!match.classroom || (d.menu && !d.card))) tryBuy(match, p, inp.buyItem);
    if (inp.answer >= 0) answer(match, p, inp.answer);
    if (inp.closeShop) d.menu = false;
    if (isRoam(match)) syncHidden(match, p); // story 021: closing the shop ends the hiding
    if (inp.closeCard) closeCard(match, p);
    if (p === human && (inp.spectate || (!p.alive && inp.spectateKey))) nextSpec(match);
  }
  match.t += dt;
  for (const p of match.players) { p.px = p.x; p.pz = p.z; }
  if (match.phase === 'buy') {
    match.phaseT -= dt;
    if (match.phaseT <= 0) {
      // A right answer already given completes the purchase; any other open buy card closes (GDD Edge Cases).
      for (const p of match.players) {
        const d = p.human ? deskOf(match, p) : null;
        if (!d || !d.card || d.card.kind !== 'buy') continue;
        if (d.card.okT > 0) grant(match, p, d.card.item);
        closeCard(match, p, true);
      }
      match.phase = 'live'; mapState.gatesClosed = match.gatesClosed = false; match.gateT = 0.01; match.events.push({ type: 'gate' });
      if (human) say(match, sideOf(match, human) === 'att' ? '¡Puertas abiertas: adelante!' : '¡Puertas abiertas: defiende los sitios!', 2.5);
    }
  } else if (match.phase === 'live') {
    if (match.bomb.state !== 'planted') match.roundT -= dt;
  } else if (match.phase === 'post') {
    match.phaseT -= dt;
    if (match.phaseT <= 0) { afterRound(match); return; }
  }
  for (const p of match.players) {
    if (!p.human) continue;
    if (p.alive) humanUpdate(match, p, dt, inputs[p.id] ?? idleInput());
    else {
      p.moving = false;
      if (isRoam(match) && deskOf(match, p).card) updateCard(match, p, dt, inputs[p.id] ?? idleInput()); // story 019: a dead person's respawn question
      if (p === human && (!match.specP || !match.specP.alive)) nextSpec(match);
    }
  }
  for (const p of match.players) if (!p.human && p.alive) botUpdate(match, p, dt);
  for (const k of match.pickups) k.age += dt; // dropped items fade after pickup_life (story 016)
  for (let i = match.pickups.length - 1; i >= 0; i--) if (match.pickups[i].age >= tune.pickup_life) match.pickups.splice(i, 1);
  for (const p of match.players) if (!p.alive) p.deadT += dt;
  updateBomb(match, dt);
  if (isFfa(match)) ffaTick(match, dt); else if (isDuel(match)) duelTick(match, dt); else if (isWaves(match)) wavesTick(match, dt); else checkRound(match);
  // timers
  match.msgT -= dt; match.flashT = Math.max(0, match.flashT - dt); match.hitT = Math.max(0, match.hitT - dt);
  match.killT = Math.max(0, match.killT - dt); match.boomT = Math.max(0, match.boomT - dt);
  for (const h of match.hurt) h.t -= dt;
  match.hurt = match.hurt.filter(h => h.t > 0);
  for (const f of match.feed) f.t -= dt;
  match.feed = match.feed.filter(f => f.t > 0);
  if (match.gateT > 0) match.gateT += dt;
}
export { humanSpread } from './combat';
export { stanceStep, moveStep } from './player';
export { seatHuman, seatBot, setViewer } from './seats';

