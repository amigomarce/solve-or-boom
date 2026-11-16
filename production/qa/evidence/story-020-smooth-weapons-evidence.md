# Test Evidence: Smooth weapon models

> **Story**: `production/epics/solve-or-boom/story-020-smooth-weapons.md`
> **Story Type**: Visual/Feel
> **Date**: 2026-11-16
> **Tester**: Claude, with the project owner's review of the retained screenshots
> **Build / Commit**: working tree on top of `e0a3b7b`, before the story's commit

---

## What Was Tested

The five guns (pistol, SMG, rifle, sniper and the Rifle dorado) in first person from the hip and aimed, in close-up, in a bot's hands and on the phone layout, before and after, driven in a real Chrome with a GPU through the game's own hooks (`?manual=1`), from the repo's build. Criteria covered: AC-1 to AC-8 of the story.

**Acceptance criteria covered**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8

---

## Acceptance Criteria Results

| # | Criterion (from story) | Result | Notes |
|---|----------------------|--------|-------|
| AC-1 | All five guns modelled with rounded shapes | PASS | `03-de-cerca.png`, `04-modelos.png`: round barrels, bevelled edges, shaped grips, curved magazines and stocks, round sniper scope |
| AC-2 | Metal with shine and wood, accents, the Rifle dorado gold | PASS | `04-modelos.png` |
| AC-3 | Each gun keeps its silhouette and colour | PASS | `01-primera-persona-cadera.png`, `04-modelos.png` |
| AC-4 | Aimed, the front sight lands on the crosshair; the muzzle keeps its place | PASS | `02-primera-persona-apuntando.png` |
| AC-5 | The same model, smaller, in every player's and bot's hands | PASS | `05-en-manos-de-un-bot.png` |
| AC-6 | Built once and reused; smooth on a school PC and a phone | DEFERRED | Frame time on the real GPU (Apple M1): 0.65 to 0.69 ms per frame, +6.9 %. Not measured on a phone or a school PC: the owner checks it when playing |
| AC-7 | Same-seed replay, types, smoke and tests | PASS | State rows identical, `errors 0`, replay `match no` only for the new gun pixels (accepted); `tsc` 0 errors; smoke and tests pass |
| AC-8 | Retained screenshots, before and after | PASS | 6 sheets, stamped (`stamp.txt`) |

---

## Screenshots / Video

| # | Filename | What It Shows | Acceptance Criterion |
|---|----------|--------------|----------------------|
| 1 | `01-primera-persona-cadera.png` | each gun from the hip, before and after | AC-1, AC-3 |
| 2 | `02-primera-persona-apuntando.png` | each gun aimed, before and after | AC-4 |
| 3 | `03-de-cerca.png`, `04-modelos.png` | close-ups and the models from the side, three-quarters and held | AC-1, AC-2 |
| 4 | `05-en-manos-de-un-bot.png` | a bot holding each gun, before and after | AC-5 |
| 5 | `06-movil.png` | the phone layout, before and after | AC-5 |

All under `production/qa/evidence/story-020-smooth-weapons/`.

---

## Test Evidence Status

- [x] Screenshots captured and stamped (`story-020-smooth-weapons/stamp.txt`)
- [ ] Frame rate on a real phone or a school PC (deferred to a playtest)

---

## Sign-Off

| Role | Name | Result | Date |
|------|------|--------|------|
| Lead programmer (checks) | Claude | [x] Approved | 2026-11-16 |
| Project owner (how the guns look) | the person | [x] Approved | 2026-11-16 |
