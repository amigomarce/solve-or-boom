// The bots' plans and purchases: who buys what, and each round's routes (staging lanes, anchors, holds).
// Everything random goes through match.rng(). No browser in here.
import { MAP, SITE, siteCells, hasHeights, cellLevels, type Cell } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { isFfa, sideOf, type Match } from './state';

/** A bot buys at the start of a round (not the first of a half): it answers like a student, sometimes wrong, and
 *  spends on its role's guns, then armour. */
export function botBuy(match: Match, b: Loose): void {
  const firstOfHalf = !isFfa(match) && (match.round === 1 || match.round === tune.halftime_after + 1);
  if (firstOfHalf) return; // pistol rounds for the bots: round 1 is fair
  const ask = () => { // a bot answers like a student: sometimes wrong, then a new question
    for (let k = 0; k < 6; k++) { if (match.rng() < tune.bot_answer_right) { b.right++; return true; } b.wrong++; }
    return false;
  };
  const want = b.role === 'sniper' ? ['sniper', 'rifle', 'smg'] : b.role === 'rusher' ? ['smg'] : ['rifle', 'smg'];
  if (!b.primary) for (const w of want) {
    if (b.money >= tune['price_' + w] + (w === 'smg' ? 0 : 300) && ask()) {
      b.money -= tune['price_' + w]; b.primary = w; b.cur = w;
      b.ammo[w] = { mag: tune[w + '_mag'], res: tune[w + '_reserve'] }; break;
    }
  }
  if (b.primary) b.cur = b.primary;
  if (b.armor < 50 && b.money >= tune.price_armor && ask()) { b.money -= tune.price_armor; b.armor = 100; }
}

/** A random cell of site S (with heights: [cx, cy, the site's level]). */
export function siteSpot(match: Match, S: string): number[] {
  const c = siteCells[S], k = c[Math.floor(match.rng() * c.length)];
  return hasHeights ? [k[0], k[1], SITE[S].lv] : k;
}
/** A copy of a map-data cell: the level (third number) kept on a map with heights. */
const copy = (c: Cell): Cell => (hasHeights ? c.slice() : [c[0], c[1]]);
/** Sends bot b on the attack route of `kind` (lane, mid, hold, or straight to the site) for this round's site. */
export function routeTo(match: Match, b: Loose, kind: string): void {
  const S = match.attackSite;
  const r = S === 'A' ? MAP.routes.A : MAP.routes.B, lane = r.lane.map(copy), mid = r.mid.map(copy);
  b.routeKind = kind; b.arrived = false; b.path = []; b.after = []; b.coverT = 0; b.plan = [];
  if (kind === 'lane') b.wps = [...lane, siteSpot(match, S)];
  else if (kind === 'mid') b.wps = [...mid, siteSpot(match, S)];
  else if (kind === 'hold') { b.wps = [copy(MAP.attack_hold)]; b.holdT = tune.sniper_hold_time; b.holdYaw = -Math.PI / 2; }
  else b.wps = [siteSpot(match, S)];
  if (kind !== 'hold') b.holdYaw = -Math.PI / 2;
  if (match.bomb.carrier === b) {
    const c = [SITE[S].cx + (match.rng() < 0.5 ? -1 : 1), SITE[S].cy];
    // With heights the carrier plants on the site's level (the cell beside the centre, or the centre when that one is not floor there).
    b.wps[b.wps.length - 1] = !hasHeights ? c : cellLevels(c[0], c[1]).includes(SITE[S].lv) ? [c[0], c[1], SITE[S].lv] : [SITE[S].cx, SITE[S].cy, SITE[S].lv];
  }
}
/** Sends defender bot b to anchor `a` (A, B, the connector or mid). */
export function anchorTo(match: Match, b: Loose, a: string): void {
  b.anchor = a; b.arrived = false; b.path = []; b.holdYaw = Math.PI / 2;
  if (a === 'mid') b.wps = [copy(MAP.anchors.mid)];
  else if (a === 'conn') { const conn = MAP.anchors.conn[Math.floor(match.rng() * MAP.anchors.conn.length)]; b.wps = [copy(conn)]; }
  else b.wps = [siteSpot(match, a)];
}
/** A copy of the list in an order drawn with the seeded rng (Fisher-Yates). */
export function shuffled<T>(match: Match, a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(match.rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
/** Each round's bot plans, drawn with the seeded rng. Attackers: the sniper holds first; the others split into
 *  two groups, lane and mid, and each stops at its route's last waypoint before the site (its staging point,
 *  the site spot kept in `after`) until the group is there. Defenders: the sniper holds mid; the others draw
 *  the anchors A, B and the connector (a site anchor is a random cell of the site). */
export function planRound(match: Match) {
  match.attackSite = match.rng() < 0.5 ? 'A' : 'B';
  const bots = match.players.filter(p => !p.human);
  const first = match.rng() < 0.5 ? 'lane' : 'mid', second = first === 'lane' ? 'mid' : 'lane';
  shuffled(match, bots.filter(b => sideOf(match, b) === 'att' && b.role !== 'sniper')).forEach((b, i) => {
    routeTo(match, b, i % 2 === 0 ? first : second);
    b.after = [b.wps.pop()];
  });
  const anchors = shuffled(match, ['A', 'B', 'conn']);
  bots.filter(b => sideOf(match, b) === 'def' && b.role !== 'sniper').forEach((b, i) => anchorTo(match, b, anchors[i % anchors.length]));
  for (const b of bots) {
    if (b.role !== 'sniper') continue;
    if (sideOf(match, b) === 'att') routeTo(match, b, 'hold'); else anchorTo(match, b, 'mid');
  }
}
