// Free for All (story 019, brief MVP feature 31): everybody against everybody in one timed match.
// No bomb, no teams (every player's `squad` is their own id, so every other player is an enemy), no rounds and no
// halftime: the match lasts tune.ffa_duration seconds (match.roundT counts down) and the winner is whoever has the
// most kills, a tie going to fewer deaths. Dying is not final: a person answers a respawn question (card kind
// 'respawn', judged by whoever runs the match, the server in a classroom) and a right answer brings them back at a
// spawn point far from the enemies, with the pistol and full health, and opens their buy menu; a wrong one gives
// another question after tune.ffa_wrong_wait seconds. A bot respawns after tune.ffa_bot_respawn seconds, with no
// question. Money comes from kills (tune.ffa_kill_money). No browser in here.
import { MAP, MAP_ID, MW, MH, center, levelY, mapState, hasHeights, grid, grid1, rampDir, idx, canStepXY } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { botBuy } from './plans';
import { botFresh, deskOf, freshStance, isRoam, openCard, personal, resetGuns, say, tell, type Match } from './state';
import { yawTo } from './rules';

/** Every cell a person or bot may start or come back on (story 021): each walkable floor cell of the whole map, the first floor too (as [cx, cy, level]), ramps left out; only cells a body can walk to from the bases (no closed-off pockets). Built once per map. */
const pools = new Map<string, number[][]>();
function spawnPool(): number[][] {
  const kept = pools.get(MAP_ID);
  if (kept) return kept;
  const start = MAP.spawns.att[0], seen = new Uint8Array(MW * MH * 2), q: number[] = [(start[1] * MW + start[0]) * 2 + (start[2] ?? 0)];
  seen[q[0]] = 1;
  const gates = mapState.gatesClosed; mapState.gatesClosed = false; // the walking graph with the gates open, as the match is played
  for (let h = 0; h < q.length; h++) {
    const k = q[h], l = k & 1, c = k >> 1, cx = c % MW, cy = (c - cx) / MW;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let nl = 0; nl < 2; nl++) {
      const nx = cx + dx, ny = cy + dy;
      if (!canStepXY(cx, cy, l, nx, ny, nl)) continue;
      const nk = (ny * MW + nx) * 2 + nl;
      if (!seen[nk]) { seen[nk] = 1; q.push(nk); }
    }
  }
  mapState.gatesClosed = gates;
  const out: number[][] = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y);
    if (grid[i] === 1 && !rampDir[i] && seen[i * 2]) out.push([x, y, 0]);
    if (hasHeights && grid1[i] === 1 && seen[i * 2 + 1]) out.push([x, y, 1]);
  }
  pools.set(MAP_ID, out);
  return out;
}
/** The cells a person or bot may start or come back on, for the checks (story 021). */
export const spawnCells = (): number[][] => spawnPool();
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
export function place(p: Loose, spot: number[]): void {
  p.alive = true; p.hp = tune.max_hp; p.x = p.px = center(spot[0]); p.z = p.pz = center(spot[1]); p.st.y = levelY(spot[2] ?? 0);
  p.yaw = yawTo(center(MW / 2) - p.x, center(MH / 2) - p.z); p.pitch = 0; p.recoil = 0; p.scoped = false; p.st.aimGun = '';
  p.target = null; p.path = []; p.wps = []; p.arrived = false; p.defusing = false; p.plantT = 0; p.deadT = 0; p.alertT = 0;
  p.reloadT = 0; p.cool = 0; p.lastSeenT = -99; p.healT = 0; p.moving = false; p.hidden = false; p.hideT = 0;
}
/**
 * The match's start: round 1 live at once (gates open, no buy phase), the clock set, no bomb, everybody their own
 * squad on a spawn cell of the whole map (story 021: no bases), and each person's buy menu open for tune.ffa_buy_menu_time
 * seconds, the person invisible and untouchable meanwhile.
 */
export function startFfa(match: Match): void {
  match.round = 1; match.phase = 'live'; match.phaseT = 0; match.roundT = tune.ffa_duration;
  mapState.gatesClosed = match.gatesClosed = false; match.gateT = 0; match.banner = null; match.alert = null;
  Object.assign(match.bomb, { state: 'none', carrier: null, timer: 0, defuser: null, panicT: 0, beepT: 0 });
  for (const p of match.players) p.alive = false; // not placed yet: pickSpawn counts only the living, so each one keeps its distance from those already placed
  for (const p of match.players) {
    p.squad = p.id; Object.assign(p.st, freshStance());
    place(p, pickSpawn(match, p));
    if (p.human) openMenu(match, p, true);
  }
  match.events.push({ type: 'round', round: 1, side: 'ffa' }); // the screen dresses the figures (one colour for all) and hides the gates
  say(match, `Free for All: gana quien tenga más bajas en ${Math.round(tune.ffa_duration / 60 * 10) / 10} min. Si caes, responde para volver`, 5);
}
/**
 * Opens `p`'s buy menu for tune.ffa_buy_menu_time seconds. `hide` (the start, a respawn): the person is invisible and untouchable
 * (p.hidden) until the menu is closed or that time runs out; a menu opened by the buy key during the match hides nobody.
 */
export function openMenu(match: Match, p: Loose, hide: boolean): void {
  const d = deskOf(match, p);
  d.menu = true; d.menuT = tune.ffa_buy_menu_time; personal(match, p, { type: 'unlock' });
  p.hidden = hide; p.hideT = hide ? tune.ffa_buy_menu_time : 0;
}
/** A classroom student seated as the match is made (src/server/room.ts) gets the start's buy menu, hidden, like the start gives a single player (story 021). */
export function startShop(match: Match, p: Loose): void { if (isRoam(match) && p.human && p.alive) openMenu(match, p, true); }
/** The shop opened with the buy key or the touch button while the match is live (story 021): visible and vulnerable, the same menu and timer. */
export function openShop(match: Match, p: Loose): void { openMenu(match, p, false); }
/** Ends `p`'s hiding when its menu is shut, its time is up, or it is no longer a living person: it appears, visible and vulnerable. */
export function syncHidden(match: Match, p: Loose): void {
  if (p.hidden && (!p.alive || !p.human || p.hideT <= 0 || !deskOf(match, p).menu)) { p.hidden = false; p.hideT = 0; }
}
/** Brings `p` back (a right respawn answer, or a bot's wait over): far from the enemies, full health, the pistol (taken at death); a person's buy menu opens, a bot buys with its money. */
export function respawn(match: Match, p: Loose): void {
  Object.assign(p.st, freshStance());
  place(p, pickSpawn(match, p));
  if (p.human) openMenu(match, p, true);
  else { Object.assign(p, botFresh()); botBuy(match, p); p.wps = [randomSpot(match)]; }
  match.events.push({ type: 'respawn', p: p.id });
}
/** A random cell of the whole map as a waypoint (with the level on a map with heights). */
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
    } else if (d) {
      if (p.hidden) { p.hideT -= dt; syncHidden(match, p); } // the hiding has its own clock: an open question cannot keep a person invisible
      if (d.menu && !d.card && (d.menuT -= dt) <= 0) { d.menu = false; tell(match, p, 'Se acabó el tiempo de compra', 2); syncHidden(match, p); }
    }
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
  for (const q of match.players) if (q.human) { const d = deskOf(match, q); d.menu = false; d.card = null; q.hidden = false; q.hideT = 0; }
  match.events.push({ type: 'matchEnd', won, podium: match.podium });
}
