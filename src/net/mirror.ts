// A classroom client's copy of the match (no browser in here, so Node runs it too). The server owns the match;
// this copy is what the screen draws, in the same shape as the single-player match (src/game/state.ts), so the
// drawing code reads `mirror.match` like it reads a local match:
//
//   const m = createMirror(begin);                    // on `begin`
//   every step:  const inp = readInput(); const seq = predict(m, inp, STEP); conn.sendInput(seq, inp);
//   on `snap`:   const events = applySnapshot(m, snap, nowMs);   // play them like the single-player events
//   every frame: interpolate(m, nowMs);                // the other players, net_interp_ms in the past
//
// Prediction: the own player walks at once with the same rules the server runs (stanceStep + moveStep, src/game/
// player.ts); every snapshot says which input the server played last (`a`), and the client restarts from the
// server's position and replays the inputs it sent after that. A small difference is blended out
// (net_correct_blend per snapshot); one over net_snap_m metres is taken at once.
import { blankMatch, feed, say, sideOf, uiOpen, SHOP, STEP, type Match } from '../game/state';
import { loadMap, MAP_ID, mapState } from '../game/map';
import { stanceStep, moveStep, type PlayerInput } from '../game/player';
import { angDiff, lerp } from '../game/rules';
import type { Level } from '../game/types';
import { tune } from '../game/tune';
import { FLAG, SCALE, STANCES, WEAPON_IDS, BOMB_STATES, type BeginMessage, type SnapMessage, type SeatView } from './protocol';

/** The client's copy of the match. */
export interface Mirror {
  /** Draw this like a single-player match: `match.human` is the own player, `match.me` its stance. */
  match: Match;
  /** The own seat (player id). */
  seat: number;
  /** The own name on the server (events name players by it). */
  name: string;
  /** The next input seq. */
  seq: number;
  /** Inputs sent and not yet played by the server, with the aim they were walked with. */
  unacked: { seq: number; input: PlayerInput; yaw: number; pitch: number }[];
  /** The latest snapshots, oldest first, for interpolation. */
  snaps: SnapMessage[];
  /** The client time (ms) of server step 0, smoothed: maps a snapshot's step `k` to the client clock. */
  base: number | null;
  /** How far the last correction moved the own player, in metres (for a debug readout). */
  lastError: number;
}

/**
 * A copy of a new match for the seat in `begin`: the map loaded, the roster named, the own player the viewer.
 * @example conn = connect({ ..., onBegin: b => { mirror = createMirror(b); } });
 */
export function createMirror(begin: BeginMessage): Mirror {
  if (MAP_ID !== begin.map) loadMap(begin.map);
  const match = blankMatch(0, [begin.seat]);
  match.classroom = true; match.opts.map = begin.map; match.opts.subject = begin.subject; match.opts.level = begin.level as Level;
  begin.names.forEach((n, i) => { match.players[i].name = n; });
  match.players[begin.seat].name = 'Tú';
  return { match, seat: begin.seat, name: begin.names[begin.seat], seq: 0, unacked: [], snaps: [], base: null, lastError: 0 };
}

/** Names the players again from a `room` message (a student joined or left); the own player stays "Tú". */
export function setNames(m: Mirror, seats: SeatView[]): void {
  for (const s of seats) if (s.index !== m.seat && s.kind === 'human') m.match.players[s.index].name = s.name;
}

/** Runs the own player's stance, aim and walk for one input, as the server will (no shots, no bomb, no noises; no walk while the menu or a card is open). */
function walk(m: Mirror, inp: PlayerInput, dt: number): void {
  const match = m.match, p = match.players[m.seat];
  if (!p.alive) { p.moving = false; return; }
  mapState.gatesClosed = match.gatesClosed;
  stanceStep(match, p, dt, inp, true);
  if (uiOpen(match)) { p.moving = false; return; }
  moveStep(match, p, dt, inp, true);
}

/**
 * One client step: applies the input to the own player at once (prediction), keeps it until the server plays
 * it, advances the local clocks the screen reads (HUD timers), and returns the seq to send it with.
 * @example const seq = predict(m, inp, STEP); conn.sendInput(seq, inp);
 */
export function predict(m: Mirror, inp: PlayerInput, dt: number): number {
  const match = m.match, p = match.players[m.seat], seq = m.seq++;
  p.px = p.x; p.pz = p.z;
  if (inp.lookYaw || inp.lookPitch) { p.yaw += inp.lookYaw; p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch + inp.lookPitch)); }
  m.unacked.push({ seq, input: inp, yaw: p.yaw, pitch: p.pitch });
  walk(m, inp, dt);
  p.recoil *= Math.exp(-dt * 7);
  match.t += dt; match.msgT -= dt;
  match.flashT = Math.max(0, match.flashT - dt); match.hitT = Math.max(0, match.hitT - dt);
  match.killT = Math.max(0, match.killT - dt); match.boomT = Math.max(0, match.boomT - dt);
  for (const h of match.hurt) h.t -= dt;
  match.hurt = match.hurt.filter(h => h.t > 0);
  for (const f of match.feed) f.t -= dt;
  match.feed = match.feed.filter(f => f.t > 0);
  if (match.gateT > 0) match.gateT += dt;
  for (const q of match.players) if (!q.alive) q.deadT += dt;
  // The card's clocks run on until the next snapshot, stopping just short of 0 so the server's new question or close comes first.
  const c = match.card;
  if (c) { c.anim = Math.min(1, c.anim + dt * 5); if (c.wrongT > 0) c.wrongT = Math.max(0.001, c.wrongT - dt); if (c.okT > 0) c.okT = Math.max(0.001, c.okT - dt); }
  return seq;
}

const T = SCALE.time, P = SCALE.pos, A = SCALE.ang;

/**
 * Takes a snapshot in: the round, the bomb, every player (the others into the interpolation buffer), the own
 * player's private values, then reconciles the prediction. Returns the snapshot's events for the screen to play,
 * after updating the HUD state they imply (hurt marker, hit and kill marks, kill feed, messages, banner, results).
 * @example const events = applySnapshot(m, snap, performance.now()); for (const e of events) play(e);
 */
export function applySnapshot(m: Mirror, snap: SnapMessage, nowMs: number): SnapMessage['e'] {
  const match = m.match, me = match.players[m.seat];
  const base = nowMs - snap.k * STEP * 1000;
  m.base = m.base === null || base < m.base ? base : m.base + (base - m.base) * 0.05; // follows the earliest arrival, drifts slowly
  m.snaps.push(snap);
  while (m.snaps.length > 2 && m.snaps[1].k * STEP * 1000 < nowMs - m.base - tune.net_interp_ms - 1000) m.snaps.shift();
  if (m.snaps.length > 30) m.snaps.shift();
  const newRound = snap.r !== match.round;
  match.phase = snap.ph; match.phaseT = snap.pt / T; match.roundT = snap.rt / T; match.round = snap.r;
  match.score = snap.s; match.attSquad = snap.as; match.gatesClosed = snap.g === 1; match.plantT = snap.pl / T;
  match.t = Math.max(match.t, snap.k * STEP);
  const [bs, bx, bz, bt, carrier, site, defuser] = snap.b;
  Object.assign(match.bomb, { state: BOMB_STATES[bs], x: bx / P, z: bz / P, timer: bt / T, carrier: carrier >= 0 ? match.players[carrier] : null,
    site: site === 1 ? 'A' : site === 2 ? 'B' : undefined, defuser: defuser >= 0 ? match.players[defuser] : null });
  for (const r of snap.p) {
    const p = match.players[r[0]];
    const wasAlive = p.alive;
    p.alive = !!(r[5] & FLAG.alive); p.human = !!(r[5] & FLAG.human); p.defusing = !!(r[5] & FLAG.defusing);
    p.flashT = r[5] & FLAG.flash ? 0.05 : 0; p.scoped = !!(r[5] & FLAG.scoped); p.spotT = r[5] & FLAG.spotted ? match.t : -99;
    p.cur = WEAPON_IDS[r[6]] ?? 'pistol'; p.kills = r[9]; p.deaths = r[10];
    if (!p.alive && wasAlive) p.deadT = r[11] / T;
    if (p === me) continue;
    p.moving = !!(r[5] & FLAG.moving); p.st.stance = STANCES[r[7]] ?? 'stand'; p.st.jumpY = r[8] / P;
  }
  // The own player's private values.
  const y = snap.y;
  me.hp = y[0]; me.armor = y[1]; me.money = y[2];
  me.ammo = { [me.cur]: { mag: y[3], res: y[4] } }; me.reloadT = y[5] / T; me.primary = y[6] >= 0 ? WEAPON_IDS[y[6]] : null;
  me.recoil = y[12] / A; me.cool = y[13] / T;
  // The own menu and card, as the server has them (the card's question object is kept while it is the same question).
  match.menu = snap.m === 1;
  const c = snap.c, old = match.card;
  const sameQ = !!old && !!c && old.q.q === c.q && old.q.choices.join('\n') === c.o.join('\n');
  match.card = c ? { kind: c.k, item: c.i || undefined, level: c.lv || undefined, q: sameQ ? old.q : { q: c.q, choices: c.o, answer: -1, topic: c.tp },
    picked: c.pk, wrongT: c.w / T, wrongTotal: c.wt / T, okT: c.ok / T, anim: old ? old.anim : 0, got: c.g } : null;
  // Reconcile: the server's position and stance at the last input it played, then the inputs since, replayed.
  const row = snap.p.find(r => r[0] === m.seat)!;
  const shownX = me.x, shownZ = me.z, keepYaw = me.yaw, keepPitch = me.pitch;
  me.x = row[1] / P; me.z = row[2] / P;
  Object.assign(me.st, { prone: y[7] === 1, proneT: y[8] / T, jumpY: y[9] / P, vy: y[10] / P, eye: y[11] / P });
  m.unacked = m.unacked.filter(u => u.seq > snap.a);
  for (const u of m.unacked) { me.yaw = u.yaw; me.pitch = u.pitch; walk(m, u.input, STEP); }
  if (newRound || !me.alive) { me.yaw = row[3] / A; me.pitch = row[4] / A; m.unacked.length = 0; } // a new round faces the spawn's way
  else { me.yaw = keepYaw; me.pitch = keepPitch; }
  const err = Math.hypot(me.x - shownX, me.z - shownZ);
  m.lastError = newRound ? 0 : err;
  if (err < tune.net_snap_m && !newRound) { me.x = lerp(shownX, me.x, tune.net_correct_blend); me.z = lerp(shownZ, me.z, tune.net_correct_blend); }
  if (newRound) { me.px = me.x; me.pz = me.z; }
  match.events.length = 0;
  for (const e of snap.e) hudFor(m, e);
  return snap.e;
}

/** The HUD state an event implies on the client's copy (what the rules set on the server only for a viewer). */
function hudFor(m: Mirror, e: Record<string, unknown>): void {
  const match = m.match, me = match.players[m.seat];
  switch (e.type) {
    case 'hurt': match.flashT = 0.35; match.hurt.push({ yaw: e.yaw, t: 1.0 }); break;
    case 'hit': match.hitT = 0.15; break;
    case 'killmark': match.killT = 0.4; break;
    case 'boom': match.boomT = 1.2; break;
    case 'say': say(match, String(e.text), Number(e.t) || 3.5); break;
    case 'buy': feed(match, `Compraste: ${SHOP.find(s => s.id === e.item)?.name ?? ''}`, true); break;
    case 'gate': match.gateT = 0.01; say(match, sideOf(match, me) === 'att' ? '¡Puertas abiertas: adelante!' : '¡Puertas abiertas: defiende los sitios!', 2.5); break;
    case 'kill': {
      const mine = e.by === m.name || e.who === m.name;
      feed(match, `${e.by || 'La bomba'} ${e.by === m.name ? 'eliminaste a' : 'eliminó a'} ${e.who === m.name ? 'ti' : e.who}`, mine);
      break;
    }
    case 'plant': say(match, `¡Bomba plantada en ${e.site}! ${tune.bomb_time} segundos`, 4); break;
    case 'defused': feed(match, 'La bomba fue desactivada', false); break;
    case 'round':
      match.banner = null; match.gateT = 0;
      say(match, e.side === 'att' ? `Ronda ${match.round}: ATAQUE. Planta la bomba en A o B` : `Ronda ${match.round}: DEFENSA. Evita que planten`, 5);
      break;
    case 'roundEnd': {
      const win = e.win as number;
      match.banner = { text: `${win === me.squad ? 'Tu equipo gana' : 'Los rivales ganan'} la ronda`, reason: e.reason, mine: win === me.squad };
      break;
    }
    case 'matchEnd': {
      const s = match.score, mineWon = s[me.squad] > s[1 - me.squad];
      match.gained = `${mineWon ? 'Tu equipo gana' : 'Los rivales ganan'} ${s[me.squad]} - ${s[1 - me.squad]}`;
      match.answered = ''; // the answers per student are story 007
      match.over = true;
      break;
    }
  }
}

/**
 * Places the other players for a frame: between the two snapshots around (now - net_interp_ms), or at the latest.
 * Sets x, z, px, pz (the same: the screen's own blend has nothing left to do), yaw and pitch.
 * @example interpolate(mirror, performance.now()); drawFrame();
 */
export function interpolate(m: Mirror, nowMs: number): void {
  if (m.base === null || !m.snaps.length) return;
  const k = (nowMs - m.base - tune.net_interp_ms) / (STEP * 1000);
  let i = m.snaps.length - 1;
  while (i > 0 && m.snaps[i - 1].k > k) i--;
  const b = m.snaps[i], a = i > 0 ? m.snaps[i - 1] : b;
  const f = b.k === a.k ? 1 : Math.max(0, Math.min(1, (k - a.k) / (b.k - a.k)));
  for (let j = 0; j < b.p.length; j++) {
    const rb = b.p[j], ra = a.p.find(r => r[0] === rb[0]) ?? rb, p = m.match.players[rb[0]];
    if (rb[0] === m.seat) continue;
    p.x = p.px = lerp(ra[1], rb[1], f) / P; p.z = p.pz = lerp(ra[2], rb[2], f) / P;
    p.yaw = ra[3] / A + angDiff(rb[3] / A, ra[3] / A) * f; p.pitch = lerp(ra[4], rb[4], f) / A;
  }
}
