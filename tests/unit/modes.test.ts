// Vitest: each game mode played from a fixed seed with bots only, in Node with no browser.
// The fingerprint of the end state is kept as a snapshot, so a refactor of the modes (TD-017,
// docs/tech-debt-register.md) must replay exactly the same matches. A real rule change updates
// the snapshot on purpose (`npx vitest run -u`), never by accident.
import { describe, expect, it } from 'vitest';
import { createMatch, step, STEP, type GameMode, type Match } from '../../src/game/match';

/** The modes as createMatch takes them (state.ts GameMode). */
const MODES: GameMode[] = ['bomb', 'ffa', 'duel', 'waves'];
/** One flat map and the two-floor one, so the stairs and heights are in the replay too. */
const MAPS = ['pequeno', 'dospisos'];
/** Seconds of play per run: long enough for kills, respawns, a round end or a wave. */
const SECONDS = 240;
const SEED = 7;

/** Plays `seconds` of a bots-only match and returns it with how many of each event it pushed. */
function play(mode: GameMode, map: string, seconds: number): { match: Match; events: Record<string, number> } {
  const match = createMatch({ seed: SEED, subject: 'matematicas', level: 'medio', topics: ['arith'], custom: [], customName: '', map, mode, humans: [] });
  const events: Record<string, number> = {};
  const count = (): void => { for (const e of match.events) events[e.type] = (events[e.type] ?? 0) + 1; match.events.length = 0; };
  count();
  for (let i = 0; i < Math.round(seconds / STEP) && !match.over; i++) { step(match, {}, STEP); count(); }
  return { match, events };
}

/** What must stay the same: the clock, the score, every player's state, and the events by type. */
function fingerprint({ match, events }: { match: Match; events: Record<string, number> }): string {
  const players = match.players.map(p => [p.id, p.squad, p.alive ? 1 : 0, p.hp, p.kills, p.deaths, p.money, p.x.toFixed(4), p.z.toFixed(4)].join(' '));
  return JSON.stringify({ t: match.t.toFixed(4), round: match.round, score: match.score, phase: match.phase, over: match.over, players, events }, null, 1);
}

describe('game modes: same seed, same match', () => {
  for (const map of MAPS) {
    for (const mode of MODES) {
      it(`${mode} on ${map} replays exactly`, () => {
        const a = fingerprint(play(mode, map, SECONDS));
        expect(fingerprint(play(mode, map, SECONDS))).toBe(a); // the run itself is deterministic
        expect(a).toMatchSnapshot();
      });
    }
  }
});
