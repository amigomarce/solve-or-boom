# Story 025: Cooperative waves mode

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-19

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 37`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the request: a new game mode, "oleadas cooperativas". Chosen rules: all players are one team against waves of enemy bots; a fallen player is revived between waves by answering a question; the team loses when everyone is down.*

- [ ] "Oleadas cooperativas" is a mode option on the teacher screen and on the single-player session screen; `GAME_MODES`, the session settings, the protocol and `V` in `src/server/profesor.html` know it (the protocol version goes up by one) and the class build is rebuilt.
- [ ] All players (students in class, you plus teammate bots in single player) form one team; no rival humans, no friendly fire, no bomb, no sites, no bases and no gates; the map is played like Free for All without zones.
- [ ] Enemy bots arrive in numbered waves: each wave has more bots and a higher level than the last, with a start count, growth and a cap in `data/config.json` (each with a line in `data/config-notes.md`); a wave ends when all its bots are dead, then a pause with the shop (with its question) and an on-screen "Oleada N" notice.
- [ ] A player who falls waits until the wave ends; at the start of the next wave they respawn if they answer a multiple-choice question from the bank correctly (a wrong answer gives another question after a short wait). Money comes from kills and is spent in the shop as always.
- [ ] The team loses when every player is down at the same time; the end screen shows the waves survived, each player's kills and their right and wrong answers; in class the results per student are still exportable to CSV.
- [ ] The HUD shows the current wave, the enemies left and the players still standing; the teacher page shows each room's wave and how many players stand; no team headings anywhere (players only, as in Free for All).
- [ ] The enemy bots can neither target nor hurt a hidden or dead player; in class the server runs the enemy bots and the match runs a bounded headless room run with no server error.
- [ ] Works in single player and in class, on the five maps, and on phones; Bomba, Free for All and Team duel are unchanged: Bomba same-seed replay `match yes`, `npx tsc --noEmit` has 0 errors, `npm run smoke` and the existing tests pass.
- [ ] Retained screenshots: the session screen with the mode, a wave in progress, the pause with the shop and the wave notice, the defeat screen with the waves survived, the teacher page and the phone layout.

---

## Implementation Notes

- Build on `src/game/ffa.ts` (respawn with a question, bot respawn, the map without zones) and `src/game/bots.ts` (enemy roles and skill); add the mode id and keep its rules in a new file like `ffa.ts`. Enemy bots are on the opposing side; players and teammate bots on the other.
- Wave size, level scaling and the cap are numbers in `data/config.json`; the bots' skill uses the same knob style as `ffa_bot_skill`.
- Class: `src/server/room.ts` runs the match with several students on one side; `teacher.ts`, `lobby.ts`, `profesor.html` for the options and the wave line; waiting room, Tab table and results in `src/main.ts` without team headings.
- Reuse the shop, the question cards, the streak rewards and the results per student that exist already.

---

## Out of Scope

- Team duel (story 024), a defended objective, boss waves, saving a best score between sessions, and changes to the other modes.

---

## Files

- src/game/waves.ts (new: the mode's rules), src/game/ffa.ts, match.ts, state.ts, bots.ts, combat.ts, player.ts (shared pieces)
- src/net/protocol.ts, snapshot.ts, mirror.ts, src/server/teacher.ts, lobby.ts, room.ts, profesor.html
- src/main.ts (session screen option, HUD, wave notice, Tab table, results), data/config.json, data/config-notes.md
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots of each screen touched and a bounded headless room run in `production/qa/evidence/story-025-cooperative-waves/`; a person plays a few waves on each map.

**Status**: [ ] Screenshots and the rules run retained

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-019-free-for-all.md`, `production/epics/solve-or-boom/story-023-mode-aware-rooms.md`
- Unlocks: None
