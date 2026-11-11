# Grow record: solve-or-boom

Grown on 2026-11-11 from `prototypes/solve-or-boom/` at commit `b605866` (tag `one-shot/solve-or-boom`).
The one-shot folder is untouched.

| Step | What | Result |
|---|---|---|
| 1 Reference | Same-seed run of the one-shot: buy the SMG by answering, walk to site A, plant | `exact yes` (two runs identical), errors 0 |
| 2 Copy | Web scaffold + the game as JavaScript; three.js 0.186.1 pinned from npm, `questions.js` as a module; `data/config.json` (69 values) | `match yes`, errors 0 |
| 3 TypeScript | Split into `src/game/` (map, rules: pay, hit chance, armour, ramp, angles), `audio.ts`, `input.ts`, `screen.ts`, `config.ts`, `questions.ts`; `main.ts` keeps scenes, 3D world, bots, loop | `match yes`, errors 0, `tsc --noEmit` strict: 0 errors |
| 4 Rules under test | Vitest: 10 tests on `src/game/` (rule broken once, test failed, restored). Playwright: `@boot`, and a scripted SMG buy repeated from seed 7 | 12 of 12 pass |
| 5 Checks | `npm run build` (exit 0), `test-run.sh web` (`rule web:pass`), `npm run smoke` (1 passed) | pass |

Seen in: `typescript.png`, matching `reference.png` frame for frame (same kill feed, money $350, SMG 25 / 75, bomb planted at A).

NOT ASSESSED: nothing.

Still `Loose` (typing still to do): players and bots, the match state (`MatchState`'s index signature), the bomb, the question card, the session's custom questions in `deck()`'s pool.

Notes: `npm run build` warns that the main chunk is over 500 kB (three.js); it builds and runs.
