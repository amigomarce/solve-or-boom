// Vitest: the rules in src/game/, run in Node with no browser. Values come from data/config.json.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { angDiff, armourHit, hitChance, levelFor, roundPay } from '../../src/game/rules';
import { bfs, losClear, center, mapState, SITE } from '../../src/game/map';

const v = (k: keyof typeof config): number => (config[k] as { value: number }).value;

describe('roundPay: the money at the end of a round', () => {
  it('pays the winners the win money', () => {
    expect(roundPay(true, 0, v('win_money'), v('loss_money'), v('loss_bonus'))).toBe(v('win_money'));
  });
  it('pays the losers more for each loss in a row, capped after 5', () => {
    const pay = (streak: number): number => roundPay(false, streak, v('win_money'), v('loss_money'), v('loss_bonus'));
    expect(pay(1)).toBe(v('loss_money'));
    expect(pay(2)).toBe(v('loss_money') + v('loss_bonus'));
    expect(pay(9)).toBe(pay(5)); // the bonus stops growing at 4 bonuses
  });
});

describe('armourHit: armour takes its share of a hit', () => {
  it('splits a hit by armor_absorb while there is armour', () => {
    const r = armourHit(40, 100, v('armor_absorb'));
    expect(r.dmg).toBeCloseTo(40 * (1 - v('armor_absorb')), 6);
    expect(r.armor).toBeCloseTo(100 - 40 * v('armor_absorb'), 6);
  });
  it('lets the whole hit through with no armour', () => {
    expect(armourHit(40, 0, v('armor_absorb'))).toEqual({ dmg: 40, armor: 0 });
  });
});

describe('levelFor and hitChance: the bots ramp up', () => {
  it('starts at 0 in round 1 and is full after ramp_rounds', () => {
    expect(levelFor(1, v('ramp_rounds'))).toBe(0);
    expect(levelFor(1 + v('ramp_rounds'), v('ramp_rounds'))).toBe(1);
  });
  it('hits more often once ramped, less at range, less on a moving target', () => {
    const at = (lvl: number, dist: number, moving: boolean): number =>
      hitChance(lvl, v('bot_acc_start'), v('bot_acc_end'), 1, dist, 60, moving);
    expect(at(1, 10, false)).toBeGreaterThan(at(0, 10, false));
    expect(at(1, 50, false)).toBeLessThan(at(1, 10, false));
    expect(at(1, 10, true)).toBeLessThan(at(1, 10, false));
  });
});

describe('the map', () => {
  it('keeps the base shut while the gates are closed (buy time)', () => {
    mapState.gatesClosed = true;
    expect(bfs(3, 11, SITE.A.cx, SITE.A.cy)).toEqual([]);
  });
  it('has a walkable path from the attacker base to both bomb sites once the gates open', () => {
    mapState.gatesClosed = false;
    expect(bfs(3, 11, SITE.A.cx, SITE.A.cy).length).toBeGreaterThan(0);
    expect(bfs(3, 11, SITE.B.cx, SITE.B.cy).length).toBeGreaterThan(0);
    mapState.gatesClosed = true;
  });
  it('blocks sight through walls', () => {
    expect(losClear(center(3), center(11), center(3), center(5))).toBe(false); // the base wall
  });
  it('wraps angle differences into (-PI, PI]', () => {
    expect(angDiff(3 * Math.PI / 2, 0)).toBeCloseTo(-Math.PI / 2, 9);
  });
});
