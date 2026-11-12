# Test Evidence: Characters

> **Story**: `production/epics/solve-or-boom/story-009-characters.md`
> **Story Type**: Visual/Feel
> **Date**: 2026-11-12
> **Tester**: Claude, with the project owner's review of the retained screenshots
> **Build / Commit**: working tree on top of `964cac7`, before the story's commit

---

## What Was Tested

The new block characters: detail, headgear by side, gear by role, the held gun, walking, crouching, prone, jumping, planting, defusing and dying, on bots in single player and on another student in a class match. Driven in headless Chrome through the game's own hooks (`?manual=1`), from the repo's final build. Criteria covered: AC-1 to AC-9 of the story.

**Acceptance criteria covered**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9

---

## Acceptance Criteria Results

| # | Criterion (from story) | Result | Notes |
|---|----------------------|--------|-------|
| AC-1 | More detail than today, still built from simple blocks | PASS | `sides.png`, `roles-attackers.png`, `roles-defenders.png`: head with eye band, vest or belt, jointed arms and legs, boots, pack |
| AC-2 | Sides told apart by colour and a shape detail; the three bot roles by gear | PASS | Attackers wear a cap with a peak, defenders a taller helmet with a light-blue visor band; rusher red bandana, rifleman vest with magazines, sniper wide brim and pack |
| AC-3 | Walking with leg and arm swing following the speed | PASS | `walk-1.png`, `walk-2.png` show the swing; that it follows the speed is feel, left to play |
| AC-4 | Crouch, prone, jump, plant and death each have their own pose | PASS | `poses.png`, `plant.png`, `prone.png`, `death-1.png` to `death-4.png`, `floor-dead-sniper.png`, `floor-prone-sniper.png`, `sniper-crouch-plant.png` |
| AC-5 | The weapon in the hands matches the gun held | PASS | `guns.png`: pistol, SMG, rifle and sniper |
| AC-6 | Seen on bots and on students in class mode, with no new network field | PASS | `class-near-prone-2.png`, `class-near-crouch.png`; only `src/main.ts` changed under `src/` |
| AC-7 | Frame time no more than 20 % worse with the characters in view | PASS | Real GPU (Apple M1): +8.7 % (six runs) for the final version before the brim fix, about +6 % after it (`frame-time.txt`). At most 7 characters are in view, since the player's own model is hidden |
| AC-8 | Single-file build under 1 MB and no network request | PASS | 741 kB; no request other than the page itself |
| AC-9 | Retained screenshots with a lead sign-off | PASS | 26 screenshots, stamped (`stamp.txt`) |

---

## Screenshots / Video

| # | Filename | What It Shows | Acceptance Criterion |
|---|----------|--------------|----------------------|
| 1 | `sides.png`, `roles-attackers.png`, `roles-defenders.png` | an attacker and a defender, and the three roles per side | AC-1, AC-2 |
| 2 | `walk-1.png`, `walk-2.png` | walking | AC-3 |
| 3 | `poses.png`, `plant.png`, `prone.png`, `sniper-crouch-plant.png` | crouch, prone, jump, plant | AC-4 |
| 4 | `death-1.png` to `death-4.png`, `floor-dead-sniper.png`, `floor-prone-sniper.png` | the death fall ending on the floor, and the sniper flat on the floor from a low angle | AC-4 |
| 5 | `guns.png` | the four held guns | AC-5 |
| 6 | `class-near-prone-1.png` to `class-near-prone-3.png`, `class-near-prone.png`, `class-near-crouch.png`, `class-near-stand.png`, `class-a-sees.png`, `class-b-view.png`, `class-crouch.png`, `class-prone.png` | two students in a class match | AC-6 |
| 7 | `frame-time.txt` | frame time before and after, and the build size | AC-7, AC-8 |

All files are in `production/qa/evidence/story-009-characters/`.

---

## Test Conditions

- **Game state at start**: Pequeño map for the screenshots and Grande for the frame-time runs, seed 7, round 1, live phase.
- **Platform / hardware**: macOS, Apple M1; Chrome (headed with the GPU for frame time, headless with software rendering for the screenshots).
- **Framerate during test**: about 3 ms per frame with 7 characters walking, on the GPU.
- **Any special setup required**: poses and deaths triggered through the game's hooks, not by a person playing. In class mode, one frame of the viewer's camera was moved next to the other student, on the client only, to bring them into view.

---

## Observations

- Bots never crouch, go prone or jump, because the rules don't ask them to: those poses show only on students.
- The class-mode screenshots come from before the performance trim; the look did not change, except that some small blocks lost their outline.
- Without a GPU (software rendering) the first version cost +20 % to +28 % in the story 008 style measurements; this story was measured on the GPU only.
- The sniper's hat brim stayed upright when he died; it was fixed in this story and now lies flat above the head (`floor-dead-sniper.png`, `death-3.png`).

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Lead (art-director / designer) | Project owner (solo developer) | 2026-11-12 | [x] Approved |

---

*Template: `.claude/docs/templates/test-evidence.md`*
*Used for: Visual/Feel and UI story type evidence records*
*Location: `production/qa/evidence/[story-slug]-evidence.md`*
