# Test Evidence: Scenery

> **Story**: `production/epics/solve-or-boom/story-010-scenery.md`
> **Story Type**: Visual/Feel
> **Date**: 2026-11-12
> **Tester**: Claude, with the project owner's review of the retained screenshots
> **Build / Commit**: working tree on top of `4121a26`, before the story's commit

---

## What Was Tested

The new look of the arena: brick walls and slab floor, varied props, the A and B sites with their borders, letters and flags, the attacker and defender bases, the sky with sun and clouds, on the four maps, in the player's view and in the title and menu background. Driven in headless Chrome through the game's own hooks (`?manual=1`), from the repo's final builds. Criteria covered: AC-1 to AC-9 of the story.

**Acceptance criteria covered**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9

---

## Acceptance Criteria Results

| # | Criterion (from story) | Result | Notes |
|---|----------------------|--------|-------|
| AC-1 | Walls with texture and relief; a floor that is not a plain grid | PASS | `play-pequeno.png`, `play-grande.png`, `play-pasillos.png`, `siteA-near.png`: brick courses with a dark base band and a light cap; slab floor with joints, speckle and wear. `wall-floor-close.png` is too close to show the floor well |
| AC-2 | Crates and props varied (at least 3 kinds) from the map data, still blocking like crates | PASS | Barrels, pallets and sandbags (`prop-barrel.png`, `prop-pallet.png`, `prop-sandbag.png`) plus crates with corner plates (`prop-crate.png`). Each prop sits on an existing crate cell, and the map comparison shows the same grid. The sandbags read more as blocks than as bags |
| AC-3 | The A and B sites unmistakable from a distance | PASS | `siteA-near.png`, `siteB-view.png`: red and white dashed border, painted letter, tall flag, barrels and sandbags |
| AC-4 | A sky gradient instead of a single colour | PASS | `sky-sun.png`, `sky-high.png`, and the sky in every play shot: blue gradient, sun disc, blocky clouds |
| AC-5 | The bases marked in their side's colour | PASS | `base-att-in.png`, `base-att-out.png`, `play-grande.png`, `play-pasillos.png` (orange); `base-def-out.png` (teal) |
| AC-6 | All four maps and the title and menu background, in single player and in class mode | PASS | `play-pequeno.png`, `play-grande.png`, `play-patio.png`, `play-pasillos.png`; `scene-title.png`, `scene-menu.png`; `class-load.png` (the class build loads over the same flyover). No student page with the server running was captured |
| AC-7 | Walkable cells, collisions, spawns and routes unchanged; map checks pass | PASS | `map-check-before.json` and `map-check-after.json`: no problems for the four maps; grid, zones, gates, crates, spawns and routes identical. Replay: game state rows identical |
| AC-8 | Frame time no more than 20 % worse; under 1 MB; no network request | PASS | Real GPU (Apple M1): +4.2 % (three runs, `frame-time.txt`); 750 kB; no request other than the page itself |
| AC-9 | Retained screenshots of the four maps, each bomb site and the sky, with a lead sign-off | PASS | 22 screenshots, stamped (`stamp.txt`) |

---

## Screenshots / Video

| # | Filename | What It Shows | Acceptance Criterion |
|---|----------|--------------|----------------------|
| 1 | `play-pequeno.png`, `play-grande.png`, `play-patio.png`, `play-pasillos.png` | each of the four maps from the player's view | AC-1, AC-5, AC-6 |
| 2 | `siteA-near.png`, `siteA-far.png`, `siteB-far.png`, `siteB-view.png` | the A and B sites | AC-3 |
| 3 | `prop-barrel.png`, `prop-pallet.png`, `prop-sandbag.png`, `prop-crate.png`, `wall-floor-close.png` | each prop kind, and a wall and floor close up | AC-1, AC-2 |
| 4 | `base-att-in.png`, `base-att-out.png`, `base-def-out.png` | the attacker and defender bases | AC-5 |
| 5 | `sky-sun.png`, `sky-high.png` | the sky | AC-4 |
| 6 | `scene-title.png`, `scene-menu.png`, `scene-default.png`, `class-load.png` | the title and menu background, and the class build | AC-6 |
| 7 | `frame-time.txt`, `map-check-before.json`, `map-check-after.json` | frame time, build size and the map comparison | AC-7, AC-8 |

All files are in `production/qa/evidence/story-010-scenery/`.

---

## Test Conditions

- **Game state at start**: each map chosen from the title screen, seed 7, round 1, live phase.
- **Platform / hardware**: macOS, Apple M1; Chrome (headed with the GPU for frame time, headless with software rendering for the screenshots).
- **Framerate during test**: about 3.3 ms per frame with 7 bots walking on the GPU.
- **Any special setup required**: views and camera positions set through the game's hooks, not by a person playing.

---

## Observations

- The sandbags read as blocks more than as bags.
- The flag at the attacker spawn corner is large when the camera is close to it (`play-patio.png`).
- The close wall shot does not show the floor texture; the floor is visible in the play shots.
- No student page was captured with the classroom server running, only the class build loading.
- Engine check notes, no change needed: a thin seam can appear where the sky texture wraps, the map check does not reject two props on one cell, and the visible edge of barrels and pallets was not checked against the 0.92-cell crate hitbox.

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Lead (art-director / designer) | Project owner (solo developer) | 2026-11-12 | [x] Approved |

---

*Template: `.claude/docs/templates/test-evidence.md`*
*Used for: Visual/Feel and UI story type evidence records*
*Location: `production/qa/evidence/[story-slug]-evidence.md`*
