// Duelo por equipos (story 024, brief MVP feature 36): two teams of 4 (the roster's squads: seats 0..3 and 4..7) in one
// timed match. No bomb, sites, start gates, rounds or halftime: the match lasts tune.duel_duration seconds (match.roundT counts
// down) and the team with more kills wins; equal kills is a tie ("Empate"). match.score is the teams' kills. Dying is not
// final, as in Free for All (src/game/ffa.ts, whose respawn question, wrong-answer wait and hiding while buying it reuses): a
// person answers a respawn question and comes back near living teammates and away from living rivals, with the pistol and
// full health, and their buy menu opens; a bot comes back by itself after tune.duel_bot_respawn seconds. Money comes from
// kills (tune.duel_kill_money). Friendly fire follows the match option. No browser in here.
import { MAP, center, mapState } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { botBuy } from './plans';
import { botFresh, deskOf, freshStance, isDuel, openCard, tell, type Match } from './state';
import { place, openMenu, randomSpot, ranking, spawnCells, syncHidden } from './ffa';

/** The team names as the screens say them in a classroom and on the teacher page. */
export const teamName = (squad: number): string => `Equipo ${squad + 1}`;

/**
 * The match's start: round 1 live at once (gates open, no buy phase), the clock set, no bomb, score 0 - 0, each team on its
 * own side's four spawn cells of the map (the teams start apart) and each person's buy menu open for tune.ffa_buy_menu_time
 * seconds, the person invisible and untouchable meanwhile (story 021).
 */
export function startDuel(match: Match): void {
  match.round = 1; match.phase = 'live'; match.phaseT = 0; match.roundT = tune.duel_duration; match.score = [0, 0];
  mapState.gatesClosed = match.gatesClosed = false; match.gateT = 0; match.banner = null; match.alert = null;
  Object.assign(match.bomb, { state: 'none', carrier: null, timer: 0, defuser: null, panicT: 0, beepT: 0 });
  const next = [0, 0];
  for (const p of match.players) {
    const spots = p.squad === 0 ? MAP.spawns.att : MAP.spawns.def;
    Object.assign(p.st, freshStance());
    place(p, spots[next[p.squad]++ % spots.length]);
    if (p.human) openMenu(match, p, true);
  }
  match.events.push({ type: 'round', round: 1, side: 'duel' });
  say(match, tune.duel_duration);
}
/** The start message: the rules in one line, shown to the viewer. */
function say(match: Match, secs: number): void {
  match.msg = `Duelo por equipos: gana el equipo con más bajas en ${Math.round(secs / 60 * 10) / 10} min. Si caes, responde para volver`; match.msgT = 5;
}
/**
 * The spawn cell for `p` when it comes back: a random cell at least tune.duel_mate_gap metres from every living teammate and, when
 * a teammate is alive, no farther than tune.duel_mate_dist metres from the nearest one; among those, one at least tune.duel_rival_dist
 * metres from every living rival (else the farthest from them). With no living teammate any cell of the map may be drawn.
 */
export function pickDuelSpawn(match: Match, p: Loose): number[] {
  const mates = match.players.filter(q => q !== p && q.alive && q.squad === p.squad), foes = match.players.filter(q => q.alive && q.squad !== p.squad);
  const near = (c: number[], from: Loose[]): number => from.reduce((m, q) => Math.min(m, Math.hypot(center(c[0]) - q.x, center(c[1]) - q.z)), Infinity);
  const pool = spawnCells();
  let cand = pool;
  if (mates.length) {
    const close = pool.filter(c => { const d = near(c, mates); return d >= tune.duel_mate_gap && d <= tune.duel_mate_dist; });
    if (close.length) cand = close;
    else { const gap = pool.filter(c => near(c, mates) >= tune.duel_mate_gap); cand = gap.length ? [...gap].sort((a, b) => near(a, mates) - near(b, mates)).slice(0, 12) : pool; } // none in range: the nearest ones
  }
  const scored = cand.map(c => ({ c, d: near(c, foes) }));
  const far = scored.filter(s => s.d >= tune.duel_rival_dist);
  if (far.length) return far[Math.floor(match.rng() * far.length)].c;
  return scored.reduce((a, b) => (b.d > a.d ? b : a)).c;
}
/** Brings `p` back (a right respawn answer, or a bot's wait over): near its team, away from the rivals, full health, the pistol; a person's buy menu opens, a bot buys with its money. */
export function duelRespawn(match: Match, p: Loose): void {
  Object.assign(p.st, freshStance());
  place(p, pickDuelSpawn(match, p));
  if (p.human) openMenu(match, p, true);
  else { Object.assign(p, botFresh()); botBuy(match, p); p.wps = [randomSpot(match)]; }
  match.events.push({ type: 'respawn', p: p.id });
}
/** The winning team (0 or 1), or -1 for a tie, from the teams' kills. */
export function winningTeam(match: Match): number {
  return match.score[0] === match.score[1] ? -1 : match.score[0] > match.score[1] ? 0 : 1;
}
/** One step of the mode: the dead come back (bots on their timer, a person's card is opened), the buy menus time out, the clock ends the match. */
export function duelTick(match: Match, dt: number): void {
  for (const p of match.players) {
    const d = p.human ? deskOf(match, p) : null;
    if (!p.alive) {
      if (!p.human) { if (p.deadT >= tune.duel_bot_respawn) duelRespawn(match, p); }
      else if (!d!.card) openCard(match, p, 'respawn');
    } else if (d) {
      if (p.hidden) { p.hideT -= dt; syncHidden(match, p); }
      if (d.menu && !d.card && (d.menuT -= dt) <= 0) { d.menu = false; tell(match, p, 'Se acabó el tiempo de compra', 2); syncHidden(match, p); }
    }
  }
  if (match.roundT <= 0) endDuel(match);
}
/**
 * The clock reached 0: the team with more kills wins (a tie is "Empate"); the table (every player's kills, deaths and answers, best first)
 * is set as match.podium and the winner as match.winTeam (-1: tie) for the results screen.
 */
export function endDuel(match: Match): void {
  if (match.over || !isDuel(match)) return;
  const rank = ranking(match), win = winningTeam(match), p = match.human, s = match.score;
  match.podium = rank.map(q => ({ id: q.id, kills: q.kills, deaths: q.deaths, right: q.human ? q.right : -1, wrong: q.human ? q.wrong : -1 }));
  match.winTeam = win;
  const won = !!p && win === p.squad;
  const mine = p ? s[p.squad] : s[0], theirs = p ? s[1 - p.squad] : s[1];
  match.gained = win < 0 ? `Empate ${s[0]} - ${s[1]}` : p ? `${won ? 'Tu equipo gana' : 'Los rivales ganan'} ${mine} - ${theirs}` : `${teamName(win)} gana ${s[win]} - ${s[1 - win]}`;
  if (p) { const total = p.right + p.wrong; match.answered = total ? `Respondiste bien ${p.right} de ${total} preguntas (${Math.round(100 * p.right / total)} %)` : 'No respondiste ninguna pregunta en esta partida'; }
  match.phase = 'post'; match.over = true;
  for (const q of match.players) if (q.human) { const d = deskOf(match, q); d.menu = false; d.card = null; q.hidden = false; q.hideT = 0; }
  match.events.push({ type: 'matchEnd', won, podium: match.podium, win, score: s.slice() });
}
