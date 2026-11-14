// The server's side of a snapshot: what one student may see of the match, built from the rules' state and
// events. Shared code (no browser, no Node): src/server/ builds snapshots with it; the browser reads them with
// src/net/mirror.ts. Never in a snapshot: another player's health, armour, money, ammo or question card, nor which choice is right.
import { FLAG, PICKUP_KINDS, PROTOCOL_VERSION, SCALE, STANCES, WEAPON_IDS, BOMB_STATES, type SnapMessage } from './protocol';
import { deskOf, sideOf, type Match } from '../game/state';
import { hasHeights } from '../game/map';
import type { Loose } from '../game/types';

/** Events only the player in their `p` field gets (their own hits, hurts, reloads, empty clicks, pickups and medkits used, and their menu and card's: unlock, click, answer, buy, say). */
const OWN_EVENTS = new Set(['hurt', 'killmark', 'hit', 'empty', 'lowAmmo', 'reload', 'unlock', 'click', 'answer', 'buy', 'say', 'pickup']);
/** Events everybody in the room gets. 'shot' and 'melee' are sent by distance. */
const ROOM_EVENTS = new Set(['kill', 'plant', 'defused', 'beep', 'boom', 'gate', 'round', 'roundEnd', 'matchEnd', 'match']);

const r2 = (n: number): number => Math.round(n * 100) / 100;
const q = (n: number, k: number): number => Math.round(n * k);

/**
 * The events of `events` that seat `seat` needs: its own personal ones, the room's, and the shots within
 * `rangeM` metres of it (or its own), and the same for melee strikes (story 016). Copies, with `shot.human` and `melee.human`
 * true only for its own (the client already played those on the trigger) and `round.side` its side.
 */
export function eventsFor(match: Match, seat: number, events: Loose[], rangeM: number): Record<string, unknown>[] {
  const me = match.players[seat], out: Record<string, unknown>[] = [];
  for (const e of events) {
    if (OWN_EVENTS.has(e.type)) { if (e.p === seat) out.push({ ...e }); continue; }
    if (e.type === 'shot') {
      if (e.by !== seat && Math.hypot(e.x - me.x, e.z - me.z) > rangeM) continue;
      out.push({ type: 'shot', human: e.by === seat, by: e.by, w: e.w, x: r2(e.x), z: r2(e.z), from: e.from.map(r2), to: e.to.map(r2), spark: e.spark });
      continue;
    }
    if (e.type === 'melee') {
      const by = match.players[e.p];
      if (e.p !== seat && Math.hypot(by.x - me.x, by.z - me.z) > rangeM) continue;
      out.push({ type: 'melee', p: e.p, hit: e.hit, human: e.p === seat });
      continue;
    }
    if (!ROOM_EVENTS.has(e.type)) continue;
    if (e.type === 'round') out.push({ ...e, side: sideOf(match, me) });
    else if (e.type === 'beep' || e.type === 'boom') out.push({ ...e, x: r2(e.x), z: r2(e.z) });
    else out.push({ ...e, ...(Array.isArray(e.score) ? { score: [...e.score] } : {}) });
  }
  return out;
}

/** One player as everybody sees it (protocol PlayerRow; with the feet height last on a map with heights). */
function playerRow(match: Match, p: Loose): number[] {
  const flags = (p.alive ? FLAG.alive : 0) | (p.human ? FLAG.human : 0) | (p.moving ? FLAG.moving : 0) | (p.defusing || match.bomb.defuser === p ? FLAG.defusing : 0)
    | (p.flashT > 0 ? FLAG.flash : 0) | (p.scoped ? FLAG.scoped : 0) | (match.t - p.spotT < 1.5 ? FLAG.spotted : 0);
  const row = [p.id, q(p.x, SCALE.pos), q(p.z, SCALE.pos), q(p.yaw, SCALE.ang), q(p.pitch, SCALE.ang), flags, Math.max(0, WEAPON_IDS.indexOf(p.cur)),
    p.human ? Math.max(0, STANCES.indexOf(p.st.stance)) : 0, p.human ? q(p.st.jumpY, SCALE.pos) : 0, p.kills, p.deaths, q(Math.min(p.deadT, 9), SCALE.time)];
  if (hasHeights) row.push(q(p.st.y, SCALE.pos)); // protocol 4: the feet height, only where there are heights
  return row;
}

/**
 * The snapshot for seat `seat`: every player's public row, its own private row, the bomb, the pickups, the round and the
 * events it needs. `ack` is the last input seq played for it, `tick` the room's step count.
 * @example const snap = buildSnapshot(room.match, 2, 517, room.stats.steps, room.pending, 100); ws.send(JSON.stringify(snap));
 */
export function buildSnapshot(match: Match, seat: number, ack: number, tick: number, events: Loose[], rangeM: number): SnapMessage {
  const me = match.players[seat], a = me.ammo[me.cur] ?? { mag: 0, res: 0 }, b = match.bomb, st = me.st, d = deskOf(match, me), c = d.card;
  const T = SCALE.time, P = SCALE.pos;
  return {
    v: PROTOCOL_VERSION, t: 'snap', k: tick, a: ack, ph: match.phase, pt: q(match.phaseT, T), rt: q(match.roundT, T),
    r: match.round, s: [...match.score], as: match.attSquad, g: match.gatesClosed ? 1 : 0, pl: q(match.plantT, T),
    b: [BOMB_STATES.indexOf(b.state), q(b.x, P), q(b.z, P), q(b.timer, T), b.carrier ? b.carrier.id : -1, b.site === 'A' ? 1 : b.site === 'B' ? 2 : 0, b.defuser ? b.defuser.id : -1, ...(hasHeights ? [q(b.y ?? 0, P)] : [])],
    p: match.players.map(p => playerRow(match, p)),
    y: [Math.ceil(me.hp), Math.ceil(me.armor), me.money, a.mag, a.res, q(me.reloadT, T), WEAPON_IDS.indexOf(me.primary),
      st.prone ? 1 : 0, q(st.proneT, T), q(st.jumpY, P), q(st.vy, P), q(st.eye, P), q(me.recoil, SCALE.ang), q(me.cool, T),
      st.aimGun === '' ? 0 : st.aimGun === '!' ? 2 : 1, me.medkits, q(me.healT, T)],
    // The dropped medkits and ammo (story 016): the same list for everybody, the height only where there are heights.
    d: match.pickups.map(k => [k.id, PICKUP_KINDS.indexOf(k.kind), q(k.x, P), q(k.z, P), ...(hasHeights ? [q(k.y, P)] : [])]),
    e: eventsFor(match, seat, events, rangeM),
    m: d.menu ? 1 : 0,
    // The card without its answer index: the student learns right or wrong only from the server's verdict.
    c: c ? { k: c.kind, i: c.item ?? '', lv: c.level ?? '', q: c.q.q, o: [...c.q.choices], tp: c.q.topic, pk: c.picked, w: q(c.wrongT, T), wt: q(c.wrongTotal, T), ok: q(c.okT, T), g: c.got } : null,
  };
}
