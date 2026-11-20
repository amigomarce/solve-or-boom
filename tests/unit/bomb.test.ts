// Vitest: a defender bot at a planted bomb (src/game/bots.ts bombPlan), with its values from data/config.json
// (TD-018, docs/tech-debt-register.md): it defuses only within bot_defuse_reach, and its wrong answer sets the
// same panic time as a student's (bomb_panic_time).
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { createMatch, sideOf, STEP, type Match } from '../../src/game/match';
import { botUpdate } from '../../src/game/bots';
import type { Loose } from '../../src/game/types';

const v = (k: keyof typeof config): number => (config[k] as { value: number }).value;

/** A Bomba match in its live phase with the bomb planted beside one defender bot `dist` m away; everybody else is down. */
function plantedBeside(dist: number): { match: Match; bot: Loose } {
  const match = createMatch({ seed: 7, subject: 'matematicas', level: 'medio', topics: ['arith'], custom: [], customName: '', map: 'pequeno', mode: 'bomb', humans: [] });
  const bot = match.players.find(p => sideOf(match, p) === 'def')!;
  for (const p of match.players) if (p !== bot) p.alive = false;
  match.phase = 'live';
  Object.assign(match.bomb, { state: 'planted', carrier: null, x: bot.x + dist, z: bot.z, y: bot.st.y, defuser: null, panicT: 0 });
  return { match, bot };
}

describe('a defender bot at a planted bomb', () => {
  it('starts defusing within bot_defuse_reach', () => {
    const { match, bot } = plantedBeside(v('bot_defuse_reach') - 0.1);
    botUpdate(match, bot, STEP);
    expect(bot.defusing).toBe(true);
  });
  it('does not defuse from just beyond bot_defuse_reach', () => {
    const { match, bot } = plantedBeside(v('bot_defuse_reach') + 0.1);
    bot.wps = []; bot.path = []; bot.guarding = true; // already heading there: this step only checks the distance
    botUpdate(match, bot, STEP);
    expect(bot.defusing).toBe(false);
  });
  it('sets the same panic time as a student after a wrong answer', () => {
    const { match, bot } = plantedBeside(0.5);
    match.rng = () => 0.99; // above bot_defuse_right: every answer is wrong
    botUpdate(match, bot, STEP); // starts defusing and draws its thinking time
    for (let i = 0; i < 60 * 10 && bot.wrong === 0; i++) botUpdate(match, bot, STEP);
    expect(bot.wrong).toBeGreaterThan(0);
    expect(match.bomb.panicT).toBe(v('bomb_panic_time'));
  });
});
