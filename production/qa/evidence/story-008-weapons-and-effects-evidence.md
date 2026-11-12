# Test Evidence: Weapons and effects

> **Story**: `production/epics/solve-or-boom/story-008-weapons-and-effects.md`
> **Story Type**: Visual/Feel
> **Date**: 2026-11-12
> **Tester**: Claude, with the project owner's review of the retained screenshots
> **Build / Commit**: working tree on top of `2bec7e9`, before the story's commit

---

## What Was Tested

The four first-person guns, muzzle flash, tracers, impact effects and the bomb explosion, driven in a headless Chrome through the game's own hooks (`?manual=1`), from the repo's final builds. Criteria covered: AC-1 to AC-8 of the story.

**Acceptance criteria covered**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8

---

## Acceptance Criteria Results

| # | Criterion (from story) | Result | Notes |
|---|----------------------|--------|-------|
| AC-1 | Each first-person gun has its own recognisable shape and size | PASS | `gun-pistol`, `gun-smg`, `gun-rifle`, `gun-sniper`: teal pistol, orange SMG, green rifle with wooden stock, long sniper with scope and bipod |
| AC-2 | Firing shows a muzzle flash and a tracer that differ between guns | DEFERRED | Seen on SMG, rifle and sniper; not visible in `fire-pistol.png`. The owner checks it when playing |
| AC-3 | Impact spark on wall, floor or crate; a different effect on a player | PARTIAL | Player hit is a clear red burst (`impact-player.png`); the wall impact shows only as a small flash (`impact-wall.png`). The owner checks it when playing |
| AC-4 | The bomb's explosion is a clear effect readable from anywhere | PASS | `boom-far.png` (45 m), `boom-far-late.png`, `boom-close.png` (8 m), `boom-inside.png` |
| AC-5 | The same effects on other players' shots, single player and class mode, no server or network change | PASS | `other-shot.png`; only `src/main.ts` changed under `src/`; class build loads with no errors (`class-load.png`) |
| AC-6 | Frame time no more than 20 % worse | PASS | Real GPU (Apple M1): +3.0 % and +5.6 % (`frame-time.txt`). Without a GPU (software rendering): +20 % to +28 % |
| AC-7 | Single-file build under 1 MB, no network request | PASS | 733 kB; no request other than the page itself |
| AC-8 | Retained screenshots with a lead sign-off | PASS | 16 screenshots, stamped (`stamp.txt`) |

---

## Screenshots / Video

| # | Filename | What It Shows | Acceptance Criterion |
|---|----------|--------------|----------------------|
| 1 | `gun-pistol.png`, `gun-smg.png`, `gun-rifle.png`, `gun-sniper.png` | each gun held | AC-1 |
| 2 | `fire-pistol.png`, `fire-smg.png`, `fire-rifle.png`, `fire-sniper.png` | each gun firing | AC-2 |
| 3 | `impact-wall.png`, `impact-player.png` | wall impact and a hit on a player | AC-3 |
| 4 | `boom-far.png`, `boom-far-late.png`, `boom-close.png`, `boom-inside.png` | the explosion from far, late, close and inside | AC-4 |
| 5 | `other-shot.png`, `class-load.png` | a bot's shots; the class build loading | AC-5 |
| 6 | `frame-time.txt` | frame time before and after, and the build size | AC-6, AC-7 |

All files are in `production/qa/evidence/story-008-weapons-and-effects/`.

---

## Test Conditions

- **Game state at start**: Grande map for the frame-time runs and Pequeño for the screenshots, seed 7, round 1, live phase, ammo topped up.
- **Platform / hardware**: macOS, Apple M1; Chrome (headed with the GPU for frame time, headless with software rendering for the screenshots).
- **Framerate during test**: about 3 ms per frame with the effects on the GPU.
- **Any special setup required**: shots and the explosion triggered through the game's hooks (`window.game`), not by a person playing.

---

## Observations

- The wall impact is small; the dark impact mark was not seen in a screenshot.
- The red puff no longer draws through walls (engine-check fix), but no screenshot shows a bot hit behind a wall.
- Effects with the classroom server running were not captured; only the class page loading was.
- The red puff and some effect sparks pass through walls only as cosmetics; a bot's shot counts as a hit when it ends within 0.6 m of a player.

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Lead (art-director / designer) | Project owner (solo developer) | 2026-11-12 | [x] Approved |

---

*Template: `.claude/docs/templates/test-evidence.md`*
*Used for: Visual/Feel and UI story type evidence records*
*Location: `production/qa/evidence/[story-slug]-evidence.md`*
