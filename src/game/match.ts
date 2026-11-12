// The match without a screen: build one from the session's choices and a seed, then step it with each
// human player's inputs. The browser game (src/main.ts) and, later, the classroom server both run it
// this way and read the same state and events. No browser in here.
//
//   const m = createMatch({ seed: 7, subject: 'matematicas', level: 'medio', topics: ['arith'], custom: [], customName: '', map: 'pequeno' });
//   for (let i = 0; i < 600; i++) { step(m, { [m.human.id]: { ...idleInput(), moveF: 1 } }, STEP); m.events.length = 0; }
//   m.round, m.score, m.players[0].money, m.bomb.state
import { MAP_ID, loadMap, mapState } from './map';
import { tune } from './tune';
import { updateBomb } from './bomb';
import { botUpdate } from './bots';
import { humanUpdate, grant, tryBuy, answer, idleInput, type PlayerInput } from './player';
import { afterRound, checkRound, startRound } from './rounds';
import { blankMatch, closeCard, nextSpec, say, sideOf, type Match, type MatchOptions } from './state';
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
  const match = blankMatch(opts.seed);
  match.opts = { subject: opts.subject, level: opts.level, map: opts.map };
  const topics = opts.subject === QUESTIONS.CUSTOM ? [] : opts.topics;
  match.deck = QUESTIONS.deck(opts.subject, topics, opts.level, opts.custom, match.rng);
  match.subjectLabel = opts.subject === QUESTIONS.CUSTOM ? `${QUESTIONS.CUSTOM_NAME} (${opts.customName})`
    : `${QUESTIONS.SUBJECTS[opts.subject].name}: ${topics.map(t => QUESTIONS.SUBJECTS[opts.subject].topics[t]).join(', ')}`;
  startRound(match);
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
  const inp = inputs[match.human.id] ?? idleInput(), human = match.human;
  if (inp.lookYaw || inp.lookPitch) { // the aim answers the hand at once: no smoothing
    human.yaw += inp.lookYaw;
    human.pitch = Math.max(-1.4, Math.min(1.4, human.pitch + inp.lookPitch));
  }
  if (inp.buyItem) tryBuy(match, inp.buyItem);
  if (inp.answer >= 0) answer(match, inp.answer);
  if (inp.closeShop) match.menu = false;
  if (inp.closeCard) closeCard(match);
  if (inp.spectate || (!human.alive && inp.spectateKey)) nextSpec(match);
  match.t += dt;
  for (const p of match.players) { p.px = p.x; p.pz = p.z; }
  if (match.phase === 'buy') {
    match.phaseT -= dt;
    if (match.phaseT <= 0) {
      // A right answer already given completes the purchase; any other open buy card closes (GDD Edge Cases).
      if (match.card && match.card.kind === 'buy') {
        if (match.card.okT > 0) grant(match, human, match.card.item);
        closeCard(match, true);
      }
      match.phase = 'live'; mapState.gatesClosed = match.gatesClosed = false; match.gateT = 0.01; match.events.push({ type: 'gate' });
      say(match, sideOf(match, human) === 'att' ? '¡Puertas abiertas: adelante!' : '¡Puertas abiertas: defiende los sitios!', 2.5);
    }
  } else if (match.phase === 'live') {
    if (match.bomb.state !== 'planted') match.roundT -= dt;
  } else if (match.phase === 'post') {
    match.phaseT -= dt;
    if (match.phaseT <= 0) { afterRound(match); return; }
  }
  if (human.alive) humanUpdate(match, human, dt, inp);
  else { human.moving = false; if (!match.specP || !match.specP.alive) nextSpec(match); }
  for (const p of match.players) if (!p.human && p.alive) botUpdate(match, p, dt);
  for (const p of match.players) if (!p.alive) p.deadT += dt;
  updateBomb(match, dt);
  checkRound(match);
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
