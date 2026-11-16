// Free for All (story 019, brief MVP feature 31): everybody against everybody in one timed match.
// No bomb, no teams (every player's `squad` is their own id, so every other player is an enemy), no rounds and no
// halftime: the match lasts tune.ffa_duration seconds (match.roundT counts down) and the winner is whoever has the
// most kills, a tie going to fewer deaths. Dying is not final: a person answers a respawn question (card kind
// 'respawn', judged by whoever runs the match, the server in a classroom) and a right answer brings them back at a
// spawn point far from the enemies, with the pistol and full health, and opens their buy menu; a wrong one gives
// another question after tune.ffa_wrong_wait seconds. A bot respawns after tune.ffa_bot_respawn seconds, with no
// question. Money comes from kills (tune.ffa_kill_money). No browser in here.
import { MAP, MW, MH, center, levelY, mapState, hasHeights } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { botBuy } from './plans';
import { botFresh, deskOf, freshStance, openCard, personal, resetGuns, say, tell, type Match } from './state';
import { yawTo } from './rules';

/** Cells a person or bot may come back at: the two bases and the walkable cells of every bot route, anchor and hold (map data). */
function spawnPool(): number[][] {
  const out: number[][] = [...MAP.spawns.att, ...MAP.spawns.def];
  for (const S of ['A', 'B'] as const) { const r = MAP.routes[S]; out.push(...r.lane, ...r.mid); }
  out.push(...MAP.anchors.conn, MAP.anchors.mid, MAP.attack_hold);
  return out;
}
/** The spawn cell for `p`: a random one at least tune.ffa_spawn_dist metres from every living enemy; when none is that far, the farthest one. */
export function pickSpawn(match: Match, p: Loose): number[] {
  const pool = spawnPool(), foes = match.players.filter(q => q !== p && q.alive);
  const gap = (c: number[]): number => foes.reduce((m, q) => Math.min(m, Math.hypot(center(c[0]) - q.x, center(c[1]) - q.z)), Infinity);
  const scored = pool.map(c => ({ c, d: gap(c) }));
  const far = scored.filter(s => s.d >= tune.ffa_spawn_dist);
  if (far.length) return far[Math.floor(match.rng() * far.length)].c;
  return scored.reduce((a, b) => (b.d > a.d ? b : a)).c;
}
/** Puts `p` on spawn cell `spot` at full health, facing the middle of the map; its guns are as they are. */
function place(p: Loose, spot: number[]): void {
  p.alive = true; p.hp = tune.max_hp; p.x = p.px = center(spot[0]); p.z = p.pz = center(spot[1]); p.st.y = levelY(spot[2] ?? 0);
  p.yaw = yawTo(center(MW / 2) - p.x, center(MH / 2) - p.z); p.pitch = 0; p.recoil = 0; p.scoped = false; p.st.aimGun = '';
  p.target = null; p.path = []; p.wps = []; p.arrived = false; p.defusing = false; p.plantT = 0; p.deadT = 0; p.alertT = 0;
  p.reloadT = 0; p.cool = 0; p.lastSeenT = -99; p.healT = 0; p.moving = false;
}
/**
 * The match's start: round 1 live at once (gates open, no buy phase), the clock set, no bomb, everybody their own
 * squad on a base spawn, and each person's buy menu open for tune.ffa_buy_menu_time seconds.
 */
export function startFfa(match: Match): void {
  match.round = 1; match.phase = 'live'; match.phaseT = 0; match.roundT = tune.ffa_duration;
  mapState.gatesClosed = match.gatesClosed = false; match.gateT = 0; match.banner = null; match.alert = null;
  Object.assign(match.bomb, { state: 'none', carrier: null, timer: 0, defuser: null, panicT: 0, beepT: 0 });
  const bases = [...MAP.spawns.att, ...MAP.spawns.def];
  match.players.forEach((p, i) => {
    p.squad = p.id; Object.assign(p.st, freshStance());
    place(p, bases[i % bases.length]);
    if (p.human) openMenu(match, p);
  });
  match.events.push({ type: 'round', round: 1, side: 'ffa' }); // the screen dresses the figures (one colour for all) and hides the gates
  say(match, `Free for All: gana quien tenga más bajas en ${Math.round(tune.ffa_duration / 60 * 10) / 10} min. Si caes, responde para volver`, 5);
}
/** Opens `p`'s buy menu for tune.ffa_buy_menu_time seconds (a respawn, or the start). */
function openMenu(match: Match, p: Loose): void {
  const d = deskOf(match, p);
  d.menu = true; d.menuT = tune.ffa_buy_menu_time; personal(match, p, { type: 'unlock' });
}
/** Brings `p` back (a right respawn answer, or a bot's wait over): far from the enemies, full health, the pistol (taken at death); a person's buy menu opens, a bot buys with its money. */
export function respawn(match: Match, p: Loose): void {
  Object.assign(p.st, freshStance());
  place(p, pickSpawn(match, p));
  if (p.human) openMenu(match, p);
  else { Object.assign(p, botFresh()); botBuy(match, p); p.wps = [randomSpot(match)]; }
  match.events.push({ type: 'respawn', p: p.id });
}
/** A random cell of the spawn pool as a waypoint (with the level on a map with heights). */
export function randomSpot(match: Match): number[] {
  const c = spawnPool(), k = c[Math.floor(match.rng() * c.length)];
  return hasHeights ? [k[0], k[1], k[2] ?? 0] : [k[0], k[1]];
}
/** The players best first: most kills, then fewer deaths, then the lower seat. */
export function ranking(match: Match): Loose[] {
  return [...match.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
}
/** One step of the mode: the dead come back (bots on their timer, a person's card is opened), the buy menus time out, the clock ends the match. */
export function ffaTick(match: Match, dt: number): void {
  for (const p of match.players) {
    const d = p.human ? deskOf(match, p) : null;
    if (!p.alive) {
      if (!p.human) { if (p.deadT >= tune.ffa_bot_respawn) respawn(match, p); }
      else if (!d!.card) openCard(match, p, 'respawn');
    } else if (d && d.menu && !d.card && (d.menuT -= dt) <= 0) { d.menu = false; tell(match, p, 'Se acabó el tiempo de compra', 2); }
  }
  if (match.roundT <= 0) endFfa(match);
}
/** The clock reached 0: the winner is first in the ranking; the podium (every player's kills, deaths and answers) is set for the results screen. */
export function endFfa(match: Match): void {
  if (match.over) return;
  const rank = ranking(match), win = rank[0], p = match.human;
  match.podium = rank.map(q => ({ id: q.id, kills: q.kills, deaths: q.deaths, right: q.human ? q.right : -1, wrong: q.human ? q.wrong : -1 }));
  const won = !!p && win === p;
  match.gained = `${won ? '¡Ganaste!' : win.name + ' gana'} con ${win.kills} ${win.kills === 1 ? 'baja' : 'bajas'}`;
  if (p) { const total = p.right + p.wrong; match.answered = total ? `Respondiste bien ${p.right} de ${total} preguntas (${Math.round(100 * p.right / total)} %)` : 'No respondiste ninguna pregunta en esta partida'; }
  match.phase = 'post'; match.over = true;
  for (const q of match.players) if (q.human) { const d = deskOf(match, q); d.menu = false; d.card = null; }
  match.events.push({ type: 'matchEnd', won, podium: match.podium });
}
