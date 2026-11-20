// The game modes as the match loop sees them: one entry per mode, so src/game/match.ts picks the
// mode's rules from this table instead of an `if` chain per call site (TD-017, docs/tech-debt-register.md).
// A new mode adds its file (like ffa.ts, teamduel.ts, waves.ts) and one entry here.
import { checkRound, startRound } from './rounds';
import { ffaTick, startFfa } from './ffa';
import { duelTick, startDuel } from './teamduel';
import { startWaves, wavesTick } from './waves';
import type { GameMode, Match } from './state';

/** What a game mode plugs into the match loop. Each mode ends itself from its own tick (endRound/afterRound, endFfa, endDuel, endWaves). */
export interface ModeRules {
  /** Sets up the first round, wave or spawn of a new match (createMatch). */
  start(match: Match): void;
  /** The mode's own rules for one step, after the players, the bots and the bomb have moved (step). */
  tick(match: Match, dt: number): void;
}

/** Every mode's rules, by the id createMatch stores in match.opts.mode. */
export const MODE_RULES: Record<GameMode, ModeRules> = {
  bomb: { start: startRound, tick: match => checkRound(match) }, // Bomba (the original game): rounds, bomb, halftime
  ffa: { start: startFfa, tick: ffaTick }, // Free for All (story 019)
  duel: { start: startDuel, tick: duelTick }, // Duelo por equipos (story 024)
  waves: { start: startWaves, tick: wavesTick }, // Oleadas cooperativas (story 025)
};

/** The rules of `match`'s mode. */
export const modeRules = (match: Match): ModeRules => MODE_RULES[match.opts.mode];
