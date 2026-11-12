// The rounds: the start of a round, how a round ends and what comes after (the half-time swap, the match's end).
// No browser in here: the screen learns of each from match.events.
import { MAP, mapState, center } from './map';
import { roundPay } from './rules';
import { tune } from './tune';
import type { Loose } from './types';
import { botBuy, planRound } from './plans';
import { closeCard, freshStance, resetGuns, botFresh, say, sideOf, spawnSpots, type Match } from './state';

export function startRound(match: Match) {
  match.round++;
  match.phase = 'buy'; match.phaseT = tune.buy_time; match.roundT = MAP.round_time;
  match.menu = false; closeCard(match, true); match.alert = null; match.banner = null; match.plantT = 0;
  mapState.gatesClosed = match.gatesClosed = true; match.gateT = 0;
  Object.assign(match.me, freshStance());
  const sides: Record<string, number> = { att: 0, def: 0 };
  for (const p of match.players) {
    if (!p.alive) resetGuns(p);
    const side = sideOf(match, p), spot = spawnSpots(side)[sides[side]++];
    p.alive = true; p.hp = tune.max_hp; p.x = p.px = center(spot[0]); p.z = p.pz = center(spot[1]);
    p.yaw = side === 'att' ? -Math.PI / 2 : Math.PI / 2; p.pitch = 0; p.recoil = 0; p.scoped = false;
    p.target = null; p.path = []; p.wps = []; p.arrived = false; p.defusing = false; p.plantT = 0;
    p.deadT = 0; p.alertT = 0; p.rotated = false; p.guarding = false; p.fetching = false; p.chasing = false; p.reloadT = 0; p.cool = 0; p.lastSeenT = -99;
    if (!p.human && !p.cur) p.cur = 'pistol';
    if (!p.human) Object.assign(p, botFresh());
  }
  // The bomb: you carry it when you attack; otherwise a bot does.
  const attackers = match.players.filter(p => sideOf(match, p) === 'att');
  const human = match.human;
  let carrier = sideOf(match, human) === 'att' ? human : null;
  if (!carrier) { const c = attackers.filter(p => p.role !== 'sniper'); carrier = c[Math.floor(match.rng() * c.length)]; }
  Object.assign(match.bomb, { state: 'carried', carrier, timer: tune.bomb_time, defuser: null, panicT: 0, beepT: 0 });
  for (const p of match.players) if (!p.human) botBuy(match, p);
  planRound(match);
  const side = sideOf(match, human);
  say(match, side === 'att' ? `Ronda ${match.round}: ATAQUE. Compra y planta la bomba en A o B` :
    `Ronda ${match.round}: DEFENSA. Evita que planten o responde para desactivar`, 5);
  match.events.push({ type: 'round', round: match.round, side });
}

export function endRound(match: Match, winSide: string, reason: string): void {
  if (match.phase !== 'live') return;
  const win = winSide === 'att' ? match.attSquad : 1 - match.attSquad, lose = 1 - win;
  match.score[win]++;
  match.lossStreak[win] = 0; match.lossStreak[lose]++;
  for (const p of match.players) {
    const pay = roundPay(p.squad === win, match.lossStreak[lose], tune.win_money, tune.loss_money, tune.loss_bonus);
    p.money = Math.min(tune.max_money, p.money + pay);
  }
  match.phase = 'post'; match.phaseT = tune.round_end_delay;
  match.banner = { text: `${win === 0 ? 'Tu equipo gana' : 'Los rivales ganan'} la ronda`, reason, mine: win === match.human.squad };
  match.menu = false; closeCard(match, true);
  match.events.push({ type: 'roundEnd', win, reason, score: match.score.slice() });
}
export function checkRound(match: Match) {
  if (match.phase !== 'live') return;
  const alive = (side: string): number => match.players.filter(p => p.alive && sideOf(match, p) === side).length;
  const b = match.bomb;
  if (b.state === 'planted') { if (!alive('def')) endRound(match, 'att', 'Todos los defensores han caído'); return; }
  if (!alive('att')) endRound(match, 'def', 'Todos los atacantes han caído');
  else if (!alive('def')) endRound(match, 'att', 'Todos los defensores han caído');
  else if (match.roundT <= 0) endRound(match, 'def', 'Se acabó el tiempo sin plantar la bomba');
}
export function afterRound(match: Match) {
  if (match.score[0] >= tune.rounds_to_win || match.score[1] >= tune.rounds_to_win) {
    const p = match.human, total = p.right + p.wrong;
    const won = match.score[0] > match.score[1];
    match.gained = `${won ? 'Tu equipo gana' : 'Los rivales ganan'} ${match.score[0]} - ${match.score[1]}`;
    match.answered = total ? `Respondiste bien ${p.right} de ${total} preguntas (${Math.round(100 * p.right / total)} %)` : 'No respondiste ninguna pregunta en esta partida';
    match.over = true; match.events.push({ type: 'matchEnd', won });
    return;
  }
  if (match.round === tune.halftime_after) {
    match.attSquad = 1 - match.attSquad; match.lossStreak = [0, 0];
    for (const p of match.players) { resetGuns(p); p.money = tune.start_money; p.alive = false; }
    say(match, '¡Descanso: se cambian los lados!', 4);
  }
  startRound(match);
}
