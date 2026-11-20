# Story 028: Results countdown (single player)

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: UI
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-20

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 40`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request: at the end of a match, a timer beside the results so the group decides to change mode, map or continue; if it runs out, the game restarts in the same mode and map.*

- [ ] When a single-player match ends, the results screen shows a countdown in seconds beside the results; its length is `results_countdown_s` in `data/config.json` (default 30) with a line in `data/config-notes.md`; it counts only while the results are on screen and runs on the game's fixed step, so `?manual=1` runs and checks can step it.
- [ ] Beside the countdown are three choices: "Modo: <name>" and "Mapa: <name>", each press going to the next one (the same order as the session screen), and "Continuar (Enter)", which starts the next match now. Changing the mode or the map does not restart the countdown, and the map behind the results follows the choice.
- [ ] When the countdown reaches 0, a new match starts with the chosen mode and map (by default the ones just played) and the session's other options unchanged (subject, contents or CSV, level, buy time, friendly fire, bot level, streak rewards); it is the same as pressing Start on the session screen.
- [ ] "Volver a la pantalla de sesión" stays as a button and stops the countdown, so the subject and the other options can still be changed; Enter now means Continuar.
- [ ] It works in all four modes (Bomba, Free for All, Duelo por equipos, Oleadas cooperativas), on a phone (touch buttons, no keyboard hints) and at the narrow sizes the results screen already fits.
- [ ] All text is in Spanish. The game's rules are untouched: the four mode replays (`tests/unit/modes.test.ts`) stay identical, `npm run typecheck` has 0 errors and `npm run smoke` passes.
- [ ] Retained screenshots: the results screen with the countdown in Bomba and in Free for All, after changing the mode and the map, and the new match started at 0 (a bounded run: step the countdown in `?manual=1`, never a full match).

---

## Implementation Notes

- The results screen is `drawResults` in `src/session-screen.ts` and the `results` scene in `src/main.ts` (today Enter or the button go to the title). The mode and map choices are the session's (`session.mode`, `session.map`, `nextMode()` and `pickMap()`, `useMap` for the map behind), and the restart is what the session screen's Start does (`startMatch()`).
- Count down in `STEP` units from the scene's update, not from `performance.now`, so it is deterministic under `?manual=1`.
- Draw the mode and map choices as small functions of their own: story 029 reuses them on the class results screen.
- Kept simple on purpose: Enter changes meaning (it used to go back to the session screen); the countdown keeps running when a choice changes.

---

## Out of Scope

- Class mode: the vote per room, the server and the teacher page (story 029).
- Changing the subject, contents or any other option from the results screen (the session screen stays for that).

---

## Files

- `src/main.ts` — `resultsCountdown` set on `matchEnd`; the single-player results scene counts it down on the fixed step and handles Modo, Mapa, Continuar (Enter) and the restart at 0
- `src/session-screen.ts` — `drawModeChoice`, `drawMapChoice` (exported, for story 029) and the countdown column `drawResultsChoices`; the single-player back button lost its "(Enter)"
- `data/config.json` — `results_countdown_s` (30, 5..120)
- `data/config-notes.md` — its note
- `production/qa/evidence/story-028-results-countdown/` — 7 screenshots and `stamp.txt`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory), but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**:
- UI: a retained screenshot of each screen touched, in `production/qa/evidence/story-028-results-countdown/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None
- Unlocks: `production/epics/solve-or-boom/story-029-class-results-votes.md`

---

## Completion Notes
**Completed**: 2026-11-20
**Criteria**: 7/7 passing (deferred to a playtest: AC-3, the session's other options kept on restart; AC-5, Duelo por equipos, Oleadas cooperativas and narrow screens — Bomba, Free for All and the phone were seen)
**Deviations**: None
**Test Evidence**: `production/qa/evidence/story-028-results-countdown/` (7 screenshots, stamp unchanged)
**Reviewed by**: self, no independent review (QL-TEST-COVERAGE skipped — Solo mode; LP-CODE-REVIEW skipped — Solo mode)
**Same-seed run**: CHANGED, accepted — frame 3481's hash moved (f788bc96 → 960eeaf4), final screenshot pixel-identical; introduced by TD-008 (7afcb0e, minimap cache), not by this story

## Calls beyond the design
- The countdown sits in a column right of the results table, with "Siguiente partida en", "N s" and "Elige el modo y el mapa" (`src/session-screen.ts` drawResultsChoices) · kept 2026-11-20
- Modo lights gold when the mode is not Bomba, as on the session screen; Continuar is orange like "Empezar partida" (`src/session-screen.ts`) · kept 2026-11-20
- The seconds are rounded up: 30 s at the start, 1 s in the last second (`src/session-screen.ts`) · kept 2026-11-20
- In single player "Volver a la pantalla de sesión" no longer shows "(Enter)"; class mode unchanged (`src/session-screen.ts`) · kept 2026-11-20
- Esc and Space do nothing on the results screen, as before (`src/main.ts`, results scene) · kept 2026-11-20
- Continuar and the restart at 0 skip the session screen's empty-CSV checks, since the subject did not change (`src/main.ts`) · kept 2026-11-20, with the person's note: in single player, changing the subject goes in a new "Cambiar asignatura" on the pause menu (a new story, which must run those checks)

## Requests raised at close (for /create-stories)
- The teacher assigns several subjects (CSV ones included) that rotate from one match to the next; with a single subject chosen at the start it never changes.
- In single player, a "Cambiar asignatura" option on the pause menu.
