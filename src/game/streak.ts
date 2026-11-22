// Streak rewards (story 018, brief feature 30): a person's right answers in a row during a match earn rewards.
// streak_shield_at (3): the Escudo, +streak_shield armour at once; streak_hunter_at (5): the ability Cazador, kept
// until used (hunter_time seconds of enemies on the minimap and +hunter_speed speed); streak_gold_at (8): the Rifle
// dorado, which replaces the primary until death, and the streak starts again at 0. A wrong answer sets the streak to
// 0, dying does not. Bots never earn. With the match option off nothing here does anything.
// The fields live on the player, hidden (state.ts newPlayer): p.streak, p.kept, p.hunterT. No browser in here.
import { tune } from './tune';
import type { Loose } from './types';
import { tell, replacePlace, type Match } from './state';

/** True when `p` can earn streak rewards in this match: the option is on and a person plays it. */
const earns = (match: Match, p: Loose): boolean => match.opts.streakRewards && !!p.human;

/** The reward a streak count gives, or '' for none. */
export function rewardAt(n: number): '' | 'shield' | 'hunter' | 'gold' {
  return n === tune.streak_gold_at ? 'gold' : n === tune.streak_hunter_at ? 'hunter' : n === tune.streak_shield_at ? 'shield' : '';
}
/** The reward names as the screens show them. */
export const REWARD_NAME: Record<string, string> = { shield: 'Escudo', hunter: 'Cazador', gold: 'Rifle dorado' };

/** The next reward after a streak of `n`: its id and the streak count that gives it (null when none is left). */
export function nextReward(n: number): { id: 'shield' | 'hunter' | 'gold'; at: number } | null {
  const all = (['shield', 'hunter', 'gold'] as const).map(id => ({ id, at: Number(tune['streak_' + id + '_at']) })).filter(r => r.at > n);
  all.sort((a, b) => a.at - b.at);
  return all[0] ?? null;
}

/** `p` answered right (a buy or a defuse card): the streak goes up, and a reward is given at its count. */
export function streakRight(match: Match, p: Loose): void {
  if (!earns(match, p)) return;
  p.streak++;
  const r = rewardAt(p.streak);
  if (r === 'shield') {
    p.armor = Math.min(100, p.armor + tune.streak_shield); // capped like bought armour
    tell(match, p, `¡Racha de ${p.streak}! Escudo: +${tune.streak_shield} de blindaje`, 3);
  } else if (r === 'hunter') {
    // One kept at most: reaching it again with one kept keeps one.
    if (p.kept) tell(match, p, `¡Racha de ${p.streak}! Ya tienes un Cazador guardado`, 3);
    else { p.kept = true; tell(match, p, `¡Racha de ${p.streak}! Cazador guardado: úsalo cuando quieras`, 3.5); }
  } else if (r === 'gold') {
    const had = p.primary === 'gold' || p.secondary === 'gold';
    p[p.primary === 'gold' ? 'primary' : p.secondary === 'gold' ? 'secondary' : replacePlace(p)] = 'gold'; p.cur = 'gold'; p.reloadT = 0; p.scoped = false; p.st.aimGun = '';
    p.ammo.gold = { mag: tune.gold_mag, res: tune.gold_reserve };
    p.streak = 0; // the streak starts again
    tell(match, p, had ? `¡Racha de ${tune.streak_gold_at}! Rifle dorado recargado` : `¡Racha de ${tune.streak_gold_at}! Arma secreta: Rifle dorado`, 4);
  }
}
/** `p` answered wrong: the streak goes back to 0 (the kept Cazador and the Rifle dorado stay). */
export function streakWrong(p: Loose): void { p.streak = 0; }

/**
 * `p` pressed the ability control: a kept Cazador starts (hunter_time seconds). Refused, with a message, when none is
 * kept or one is already running (the server's check for a student's press; a press of a bot never comes here).
 * Returns true when it started.
 */
export function useAbility(match: Match, p: Loose): boolean {
  if (!p.human || !p.alive) return false;
  if (p.hunterT > 0) { tell(match, p, 'El Cazador ya está activo', 2); return false; }
  if (!p.kept) { tell(match, p, match.opts.streakRewards ? `No tienes habilidad: se gana con ${tune.streak_hunter_at} aciertos seguidos` : 'Los premios por racha están desactivados', 2.5); return false; }
  p.kept = false; p.hunterT = tune.hunter_time;
  tell(match, p, `¡Cazador! Ves a los rivales en el mapa durante ${tune.hunter_time} s`, 2.5);
  return true;
}
/** The running Cazador's clock, one step. */
export function hunterTick(p: Loose, dt: number): void { if (p.hunterT > 0) p.hunterT = Math.max(0, p.hunterT - dt); }
/** The speed multiplier the Cazador gives `p` now (1 when not running). */
export const hunterSpeed = (p: Loose): number => (p.hunterT > 0 ? 1 + tune.hunter_speed : 1);
