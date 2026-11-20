// Oleadas cooperativas (story 025, brief MVP feature 37): every player (students in a classroom; you and three teammate bots in single
// player) is squad 0 (seats 0..3) against waves of enemy bots, squad 1 (seats 4..7, the roster's other squad). No bomb, sites, bases,
// gates or friendly fire; the map is played like Free for All's. Waves are numbered (match.round = the wave started, 0 before the first):
// wave n has waveSize(n) enemies (waves_start_count, waves_growth, waves_max_count) of skill waveSkill(n); only four enemy seats exist, so
// at most four are on the map and the rest come in, one per waves_spawn_gap, as seats free up. A wave ends when all its enemies are dead:
// then a pause of waves_pause seconds (match.phaseT counts it down; phaseT > 0 IS the pause) with every living person's shop open. A fallen
// person waits for the wave to end, answers a respawn question in the pause (a wrong answer: another question after ffa_wrong_wait) and a
// right answer marks them ready: they come back, with the pistol and full health, when the next wave starts; teammate bots come back then
// without a question. The team loses when nobody of squad 0 is standing: match.over, with the waves survived and each player's kills and
// answers. For the screens: match.score = [enemies left, players standing], match.roundT = minus the seconds since the wave started (step() counts it down from 0 at the wave's start).
// Class results per student keep flowing through match.count. No browser in here.
import { MAP, mapState, center } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { botBuy } from './plans';
import { botFresh, deskOf, freshStance, openCard, resetGuns, say, tell, closeCard, waveSkill, type Match } from './state';
import { place, openMenu, spawnCells, syncHidden, randomSpot } from './ffa';
import { pickDuelSpawn } from './teamduel';
import { cellAt } from './bots';

/** Wave n's state, hidden on the match (match.waves). */
export interface WaveState {
  /** Enemies of this wave still to come in. */
  queue: number;
  /** Seconds until the next enemy may come in. */
  spawnT: number;
  /** Seconds until the next order to hunt. */
  huntT: number;
  /** The ids of fallen people who answered right and come back when the next wave starts. */
  ready: Set<number>;
}
/** Enemies in wave `n`: waves_start_count plus waves_growth for each wave after the first, at most waves_max_count. */
export const waveSize = (n: number): number => Math.min(tune.waves_max_count, tune.waves_start_count + tune.waves_growth * Math.max(0, n - 1));
const squadOf = (match: Match, s: number): Loose[] => match.players.filter(p => p.squad === s);
/** The match's start: the roster's squads as they are, squad 0 together on one base's spawn cells, no enemy yet (their seats are hidden and out), wave 0 and the first pause with every person's shop open. */
export function startWaves(match: Match): void {
  match.round = 0; match.phase = 'live'; match.roundT = 0; match.score = [0, 0];
  mapState.gatesClosed = match.gatesClosed = false; match.gateT = 0; match.banner = null; match.alert = null;
  Object.assign(match.bomb, { state: 'none', carrier: null, timer: 0, defuser: null, panicT: 0, beepT: 0 });
  match.waves = { queue: 0, spawnT: 0, huntT: 0, ready: new Set<number>() } as WaveState;
  let next = 0;
  for (const p of match.players) {
    Object.assign(p.st, freshStance());
    if (p.squad === 0) { place(p, MAP.spawns.att[next++ % MAP.spawns.att.length]); }
    else { p.alive = false; p.hidden = true; p.deadT = 99; } // an enemy seat nobody has filled: not drawn, not a target
  }
  match.phaseT = tune.waves_pause;
  openShops(match);
  say(match, `Oleadas cooperativas: todos contra las oleadas de bots. Si caes, responde para volver cuando empiece la siguiente. Oleada 1 en ${tune.waves_pause} s`, 5);
  match.events.push({ type: 'round', round: 0, side: 'waves' });
}
/** Opens the shop of every living person for the whole pause (visible and vulnerable: no enemies are about). */
function openShops(match: Match): void {
  for (const p of match.players) if (p.human && p.alive) { openMenu(match, p, false); deskOf(match, p).menuT = match.phaseT; }
}
/** Marks fallen person `p` (who just answered the respawn question right) to come back when the next wave starts. */
export function markReady(match: Match, p: Loose): void {
  (match.waves as WaveState).ready.add(p.id);
  tell(match, p, 'Bien: vuelves cuando empiece la oleada', 4);
}
/** Brings `p` back at a wave's start: near the living teammates, away from enemies, full health, the pistol; a person's shop opens (hidden meanwhile), a bot buys with its money. */
function revive(match: Match, p: Loose): void {
  Object.assign(p.st, freshStance());
  place(p, pickDuelSpawn(match, p));
  if (p.human) openMenu(match, p, true);
  else { Object.assign(p, botFresh()); botBuy(match, p); p.wps = [randomSpot(match)]; }
  match.events.push({ type: 'respawn', p: p.id });
}
/** The spawn cell for an enemy: a random one at least waves_enemy_spawn_dist metres from every living person (else the farthest). */
function pickEnemySpawn(match: Match): number[] {
  const foes = squadOf(match, 0).filter(q => q.alive);
  const scored = spawnCells().map(c => ({ c, d: foes.reduce((m, q) => Math.min(m, Math.hypot(center(c[0]) - q.x, center(c[1]) - q.z)), Infinity) }));
  const far = scored.filter(s => s.d >= tune.waves_enemy_spawn_dist);
  if (far.length) return far[Math.floor(match.rng() * far.length)].c;
  return scored.reduce((a, b) => (b.d > a.d ? b : a)).c;
}
/** Puts enemy seat `e` on the map for wave `n`: full health, the gun of the wave (waves_smg_from, waves_rifle_from), heading for the nearest person. */
function spawnEnemy(match: Match, e: Loose, n: number): void {
  Object.assign(e, botFresh()); resetGuns(e); Object.assign(e.st, freshStance());
  place(e, pickEnemySpawn(match));
  const gun = n >= tune.waves_rifle_from ? 'rifle' : n >= tune.waves_smg_from ? 'smg' : '';
  if (gun) { e.primary = gun; e.cur = gun; e.ammo[gun] = { mag: tune[gun + '_mag'], res: tune[gun + '_reserve'] }; }
  hunt(match, e, squadOf(match, 0));
}
/** Sends bot `b` (nothing in sight, not in cover) to the nearest living, visible member of `goal`. */
function hunt(match: Match, b: Loose, goal: Loose[]): void {
  let best: Loose | null = null, bd = Infinity;
  for (const q of goal) {
    if (!q.alive || q.hidden) continue;
    const d = Math.hypot(q.x - b.x, q.z - b.z);
    if (d < bd) { best = q; bd = d; }
  }
  if (!best || b.target || b.coverT > 0) return;
  b.wps = [cellAt(best.x, best.z, best.st.y)]; b.path = []; b.pathI = 0; b.arrived = false;
}
/** A wave starts: the number goes up, the queue is filled, the fallen who are ready (and the teammate bots) come back, the old enemy bodies go. */
function startWave(match: Match): void {
  const w = match.waves as WaveState;
  match.round++; match.phaseT = 0; match.roundT = 0; w.queue = waveSize(match.round); w.spawnT = 0; w.huntT = 0;
  for (const e of squadOf(match, 1)) if (!e.alive) e.hidden = true;
  for (const p of squadOf(match, 0)) {
    if (p.alive) continue;
    if (p.human) { if (deskOf(match, p).card) closeCard(match, p, true); if (w.ready.has(p.id)) revive(match, p); }
    else revive(match, p);
  }
  w.ready.clear();
  match.events.push({ type: 'round', round: match.round, side: 'waves' });
}
/** One step of the mode: the pause's clock and the fallen's questions, the enemies coming in and hunting, the wave's end, the defeat. */
export function wavesTick(match: Match, dt: number): void {
  const w = match.waves as WaveState, team = squadOf(match, 0), foes = squadOf(match, 1);
  const pause = match.phaseT > 0;
  for (const p of team) {
    const d = p.human ? deskOf(match, p) : null;
    if (!d) continue;
    if (!p.alive) { if (pause && !d.card && !w.ready.has(p.id)) openCard(match, p, 'respawn'); }
    else {
      if (p.hidden) { p.hideT -= dt; syncHidden(match, p); }
      if (d.menu && !d.card && (d.menuT -= dt) <= 0) { d.menu = false; if (!pause) tell(match, p, 'Se acabó el tiempo de compra', 2); syncHidden(match, p); }
    }
  }
  const standing = team.filter(p => p.alive).length;
  if (!standing) { endWaves(match); return; } // everybody down at once (in a pause too)
  if (!pause) {
    w.spawnT -= dt; w.huntT -= dt;
    if (w.queue > 0 && w.spawnT <= 0) {
      const seat = foes.find(e => !e.alive);
      if (seat) { spawnEnemy(match, seat, match.round); w.queue--; w.spawnT = tune.waves_spawn_gap; }
    }
    if (w.huntT <= 0) {
      w.huntT = tune.waves_hunt_interval;
      for (const e of foes) if (e.alive) hunt(match, e, team);
      for (const m of team) if (!m.human && m.alive) hunt(match, m, foes);
    }
    const left = w.queue + foes.filter(e => e.alive).length;
    match.score = [left, standing];
    if (!left && match.round > 0) clearWave(match);
  } else {
    match.score = [0, standing];
    match.phaseT -= dt;
    if (match.phaseT <= 0) startWave(match);
  }
}
/** The wave's last enemy fell: the pause starts and the living people's shops open. */
function clearWave(match: Match): void {
  match.phaseT = tune.waves_pause; match.roundT = 0;
  for (const p of match.players) if (p.human && p.alive) tell(match, p, `¡Oleada ${match.round} superada! Siguiente en ${tune.waves_pause} s`, 4);
  openShops(match);
  match.events.push({ type: 'waveClear', round: match.round });
}
/** The players best first: most kills, then fewer deaths, then the lower seat (squad 0 only). */
export function wavesRanking(match: Match): Loose[] {
  return squadOf(match, 0).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
}
/** Everybody is down: the team lost. The waves survived are those cleared (match.round - 1); the table (each player's kills, deaths, answers) is match.podium. */
export function endWaves(match: Match): void {
  if (match.over) return;
  const survived = Math.max(0, match.round - 1), p = match.human;
  match.podium = wavesRanking(match).map(q => ({ id: q.id, kills: q.kills, deaths: q.deaths, right: q.human ? q.right : -1, wrong: q.human ? q.wrong : -1 }));
  match.survived = survived;
  match.gained = `Cayó el equipo en la oleada ${match.round}: sobrevivieron ${survived} ${survived === 1 ? 'oleada' : 'oleadas'}`;
  if (p) { const total = p.right + p.wrong; match.answered = total ? `Respondiste bien ${p.right} de ${total} preguntas (${Math.round(100 * p.right / total)} %)` : 'No respondiste ninguna pregunta en esta partida'; }
  match.phase = 'post'; match.over = true; match.score = [match.score[0], 0];
  for (const q of match.players) if (q.human) { const d = deskOf(match, q); d.menu = false; d.card = null; q.hidden = false; q.hideT = 0; }
  match.events.push({ type: 'matchEnd', won: false, podium: match.podium, waves: survived });
}
