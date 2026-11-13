# Story 015: Shooting fixes

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-13

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 27`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 27, taken from a classroom playtest: the aimed shot left from the shoulder, bullets were too big and hit crate edges when close, and the guns scattered far more than players expect.*

- [ ] A shot and its tracer leave from the muzzle when not aiming and from the sights (the centre line) when aiming, never from the shoulder when aimed.
- [ ] The tracer starts at a point that is never inside a wall or crate when the shooter stands against one, and the visible tracers and impact marks are thinner (widths in `data/config.json`).
- [ ] A shot is no longer stopped by a crate's edge when the shooter stands close to it and the crosshair is clear of it, on the ground and on the first floor.
- [ ] The spread of every gun, standing, moving and aimed, is tightened: a headless check reports the group size at 20 m for each gun before and after, and the new numbers are in `data/config.json`.
- [ ] The game plays the same when nothing is shot: the same-seed replay against the last accepted run is `match yes` (or the change is shown and accepted), `npx tsc --noEmit` has 0 errors, and `npm run smoke` and the existing tests pass.
- [ ] A bounded headless room run (two students, six bots, a student shooting from close to crates) ends with no server error.
- [ ] Retained screenshots of an aimed shot from each of the four guns, a shot next to a crate edge, and the thinner tracers.

---

## Implementation Notes

- A human's shot is `shoot` in `src/game/combat.ts`: the `shot` event's `from` is built with a fixed 0.6 m forward, 0.18 m sideways and 0.18 m down offset from the eye (line ~72), whatever the aim; the wall test is `solidSight` stepped every 0.2 m from the player's own position, or `rayStop` on maps with heights. The tracer and the muzzle flash are drawn in `src/main.ts` (`tracer`, `GUN_FX`, the `fx_*_tracer_w` values in `data/config.json`).
- Spread is `tune[gun + '_spread']` plus `move_spread` (0.035) when moving; aimed values are `*_aim_spread` (story 013). Bots shoot with their own accuracy (`bot_acc_*`): leave them alone.
- Decide, and say, what the numbers mean in play: the new spread for each gun, standing and moving, is the programmer's call. Report the group size at 20 m before and after, and keep a sniper's unaimed shot inaccurate and its aimed shot precise.
- The rules in `src/game/` run in Node on the server: no browser code. If the `shot` event or the snapshot changes, the protocol version goes up and the class build is rebuilt.
- Tests are waived at `qa.level: minimal`. A bounded headless room run: stop it as soon as the shooting has been shown to work, do not play a full match.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 016: melee, medkits, pickups, the kill counter and the first-kill bonus.
- Story 017: friendly fire, bot difficulty, the buy time and the left-button binding.
- Other guns' recoil patterns, new weapons and bullet drop.

---

## Files

- src/game/combat.ts (the shot leaves from the muzzle, or the sights when aimed, pulled back when a wall or crate is close; one ray on every map; crates as drawn)
- src/game/map.ts (CRATE_FILL and CRATE_TOP, crateTop per cell, a tight flag on solidSight / solidAt / rayStop for players' shots)
- src/main.ts (crate models sized from CRATE_FILL; the sniper's own tracer through the scope starts further out and thinner)
- data/config.json, data/config-notes.md (spread, move_spread and aimed spread per gun; tracer widths; spark, puff and mark sizes; muzzle_* and sights_down; fx_scope_tracer_*)
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots and the bounded headless room run in `production/qa/evidence/story-015-shooting-fixes/`; a person plays and says how the shooting feels.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None
- Unlocks: `production/epics/solve-or-boom/story-016-combat-and-economy.md`, `production/epics/solve-or-boom/story-017-match-options.md`

## Completion Notes
**Completed**: 2026-11-13
**Criteria**: 7/7 passing (the feel of the new spread and tracers is for your play)
**Deviations**: advisory. In class mode the server fires from its own copy of the student's position, which can be a few cm off on a slow network, so a shot right at an edge can still be stopped occasionally. A player can shoot over sandbags that bots cannot see over (bots' sight still treats a crate cell as a full block). Only the tracer's start point is tested, not the path from the eye to it, so a tracer can clip a crate corner; a hit very close to the shooter draws a tracer of almost zero length; the 0.05 m pull-back margin is a literal in `combat.ts`. The room runs and bot behaviour used bounded runs, no full match. No Vite, TS or three.js API in the diff is covered in `docs/engine-reference/web/`.
**Test Evidence**: waived at qa.level minimal for tests; production/qa/evidence/story-015-shooting-fixes/ (10 screenshots, the spread, crate-edge, playtest-peek and over-the-top checks, the bounded room run, notes and stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: CHANGED, accepted — the game state is identical; the last 2 s are drawn with thinner tracers and smaller impact marks on the bots' shots

## Calls beyond the design
- Spread (standing) pistol 0.009, SMG 0.013, rifle 0.007, sniper 0.04; `move_spread` 0.008 (was 0.035); aimed spread 0.003 / 0.005 / 0.002 / 0.0005 (`data/config.json`) · kept 2026-11-13
- Tracer widths 0.02 / 0.025 / 0.035 / 0.06 m, spark 0.07, puff 0.4, impact mark 0.25; the own sniper tracer through the scope starts 4 m out at 0.025 m wide (`data/config.json`, `src/main.ts`) · kept 2026-11-13
- The shot leaves from the muzzle (0.6 m ahead, 0.18 m right, 0.18 m down from the eye) or, aimed, from the centre line 0.08 m under the eye, with no blend, pulled back toward the eye near a wall or crate (`src/game/combat.ts`, `data/config.json`) · kept 2026-11-13
- A player's shot sees a crate as drawn: 92 % of its cell and up to its height (crate 2.2, barrel 2.62, pallet 2.12, sandbags 1.5 m), so it flies over a crate's top; one ray for flat and two-floor maps (`src/game/map.ts`, `src/game/combat.ts`) · kept 2026-11-13
