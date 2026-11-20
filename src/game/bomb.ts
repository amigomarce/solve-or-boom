// The bomb: carried, dropped, planted, defused or exploded. No browser in here:
// the beep, the blast and the model on the floor are drawn from the state and the events.
import { zoneAt, cellOf } from './map';
import { tune } from './tune';
import type { Loose } from './types';
import { kill } from './combat';
import { routeTo } from './plans';
import { endRound } from './rounds';
import { feed, say, sideOf, type Match } from './state';

export function plantBomb(match: Match, p: Loose): void {
  const b = match.bomb;
  b.state = 'planted'; b.x = p.x; b.z = p.z; b.y = p.st.y; b.carrier = null; b.timer = tune.bomb_time;
  b.site = zoneAt(cellOf(p.x), cellOf(p.z), p.st.y) === 3 ? 'A' : 'B';
  p.money = Math.min(tune.max_money, p.money + tune.plant_money);
  p.plantT = 0; match.plantT = 0;
  b.yaw = p.yaw; // the way the bomb lies on the floor, for the screen
  say(match, `¡Bomba plantada en ${b.site}! ${tune.bomb_time} segundos`, 4);
  for (const q of match.players) { q.guarding = false; q.fetching = false; }
  match.events.push({ type: 'plant', site: b.site });
}
export function defuseBomb(match: Match, p: Loose): void {
  match.bomb.state = 'defused'; match.bomb.defuser = null; match.events.push({ type: 'defused' });
  feed(match, p === match.human ? 'Desactivaste la bomba' : `${p.name} desactivó la bomba`, p === match.human);
  endRound(match, 'def', 'La bomba fue desactivada');
}
export function updateBomb(match: Match, dt: number): void {
  const b = match.bomb;
  b.panicT = Math.max(0, b.panicT - dt);
  if (b.state === 'carried' && b.carrier) { b.x = b.carrier.x; b.z = b.carrier.z; b.y = b.carrier.st.y; }
  if (b.state === 'dropped') {
    for (const p of match.players) {
      if (p.alive && sideOf(match, p) === 'att' && Math.hypot(p.x - b.x, p.z - b.z) < tune.bomb_pickup_reach && Math.abs(p.st.y - b.y) < tune.bomb_reach_y) {
        b.state = 'carried'; b.carrier = p; p.fetching = false;
        if (!p.human) routeTo(match, p, 'site');
        if (p === match.human) say(match, 'Recogiste la bomba'); break;
      }
    }
  }
  if (b.state === 'planted' && match.phase === 'live') {
    b.timer -= dt; b.beepT -= dt;
    if (b.beepT <= 0) {
      b.beepT = Math.max(0.12, (b.timer / tune.bomb_time) * 1.0);
      match.events.push({ type: 'beep', x: b.x, z: b.z, panic: b.panicT > 0 });
    }
    if (b.timer <= 0) {
      b.state = 'exploded'; match.boomT = 1.2; match.events.push({ type: 'boom', x: b.x, z: b.z });
      for (const p of match.players) if (p.alive && Math.hypot(p.x - b.x, p.z - b.z) < 14) kill(match, p, null);
      endRound(match, 'att', 'La bomba explotó');
    }
  }
}
