// Who plays each seat during a match: a person or a bot. A classroom room (src/server/room.ts) seats a student in
// a running match and gives the seat back to a bot when they leave or their connection stops; a client's copy of the
// match (src/net/mirror.ts) sets which player it views. No browser in here.
import { anchorTo, routeTo } from './plans';
import { botFresh, closeDesk, freshStance, isFfa, sideOf, ROSTER, type Match } from './state';

/**
 * A person takes seat `id` where its player stands, keeping its health, guns, money and the bomb. `name` is
 * shown to the others (display only).
 * @example seatHuman(room.match, 2, 'Ana');
 */
export function seatHuman(match: Match, id: number, name: string): void {
  const p = match.players[id];
  p.name = name;
  if (p.human) return;
  p.human = true; p.target = null; p.defusing = false; p.moving = false; p.plantT = 0;
  if (match.bomb.defuser === p) match.bomb.defuser = null;
  Object.assign(p.st, freshStance());
}

/**
 * A bot takes seat `id` where its player stands (the person left or stopped sending). Mid-round it gets a fresh
 * plan: an attacker heads for the attacked site, a defender anchors on a site or the connector by seat.
 * @example seatBot(room.match, 2);
 */
export function seatBot(match: Match, id: number): void {
  const p = match.players[id];
  p.name = 'Bot ' + ROSTER[id].name;
  if (!p.human) return;
  closeDesk(match, p); // the student's open card closes: its question is their next draw if they come back
  if (match.bomb.defuser === p) match.bomb.defuser = null;
  p.human = false; p.scoped = false; p.hidden = false; p.hideT = 0; // story 021: a bot is never invisible
  if (!p.cur) p.cur = 'pistol';
  Object.assign(p, botFresh());
  Object.assign(p.st, freshStance());
  if (match.bomb.carrier === p && match.phase === 'live') match.plantT = 0;
  if (isFfa(match)) return; // story 019: a roaming bot needs no plan
  if (sideOf(match, p) === 'att') routeTo(match, p, 'site');
  else anchorTo(match, p, ['A', 'B', 'conn'][id % 3]);
}

/** The player a screen views (null for none): `match.human` and `match.me` point at it. */
export function setViewer(match: Match, id: number | null): void {
  match.human = id === null ? null : match.players[id];
  match.me = (match.human ?? match.players[0]).st;
}
