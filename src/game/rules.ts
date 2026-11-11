// The rules with no browser in them: angles, money, hit chances, armour and the bots' ramp.
// The game calls these; Vitest runs them in Node.

/** The yaw that faces along (dx, dz): forward is (-sin yaw, -cos yaw). */
export const yawTo = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** The signed difference a - b, wrapped into (-PI, PI]. */
export const angDiff = (a: number, b: number): number => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Linear blend from a to b by k. */
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** How far the bots' skill has ramped, 0 to 1: full after rampRounds rounds. */
export function levelFor(round: number, rampRounds: number): number {
  return rampRounds <= 0 ? 1 : Math.min(1, (round - 1) / rampRounds);
}

/** The money a player gets at a round's end: the win pay, or the loss pay plus the bonus for losses in a row. */
export function roundPay(won: boolean, lossStreak: number, winMoney: number, lossMoney: number, lossBonus: number): number {
  return won ? winMoney : lossMoney + lossBonus * Math.min(4, lossStreak - 1);
}

/** A bot shot's chance to hit: skill by ramp level, the gun's accuracy, falloff with distance, and a moving target. */
export function hitChance(level: number, accStart: number, accEnd: number, gunAcc: number, dist: number, range: number, moving: boolean): number {
  const distK = Math.max(0.15, Math.min(1, 1.15 - dist / range));
  return lerp(accStart, accEnd, level) * gunAcc * distK * (moving ? 0.8 : 1);
}

/** Splits a hit between armour and health: returns the damage left for health and the armour left. */
export function armourHit(dmg: number, armor: number, absorb: number): { dmg: number; armor: number } {
  if (armor > 0) { const a = dmg * absorb; return { dmg: dmg - a, armor: Math.max(0, armor - a) }; }
  return { dmg, armor };
}

/** Seconds as m:ss, rounded up, never below 0:00. */
export function fmtTime(s: number): string { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
