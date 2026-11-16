# Story 020: Smooth weapon models

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Presentation
> **Type**: Visual/Feel
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-16

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 32`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 32, requested by the person: the guns should stop looking like polygons made of boxes.*

- [ ] All five guns (pistol, SMG, rifle, sniper and the Rifle dorado) are modelled in code with rounded shapes instead of flat boxes: round barrels and muzzles, bevelled edges, a shaped grip, a curved magazine and stock, a round scope on the sniper.
- [ ] Materials read as metal (with shine) and wood, each gun keeps its accent colour, and the Rifle dorado keeps its gold look.
- [ ] Each gun keeps its recognisable silhouette and colour: they can be told apart at a glance.
- [ ] First person: the held gun uses the new model; aimed, the front sight still lands on the crosshair, and the muzzle stays where the flash and the tracer start.
- [ ] Every player's and bot's hands carry the same model, smaller, with the team colour kept.
- [ ] The models are built once and reused; play stays smooth on a school PC and on a phone, and the game still works offline.
- [ ] The same-seed replay is `match yes`, `npx tsc --noEmit` has 0 errors, and `npm run smoke` and the existing tests pass.
- [ ] Retained screenshots: each gun in first person, aimed and from the hip, before and after; a character holding each gun; the phone layout.

---

## Implementation Notes

- The first-person guns are `makeViewGun(kind)` in `src/main.ts` (blocks through `gb`/`box`, with an outline per block, plus a `muzzle` and a `sight` height used by the aimed view and the flash): rebuild each with rounded parts (`THREE.CylinderGeometry`, `CapsuleGeometry`, bevelled or rounded boxes, `LatheGeometry` for curved parts, `ExtrudeGeometry` with a bevel for grips and magazines) and keep `muzzle` and `sight` so aiming and the flash still line up (`viewGuns`, the aimed position in the first-person draw).
- The guns on the characters are built where `makeSoldier` and the held gun are made (search `GUN_FX`, `aim` group and `mergeBlocks` in `src/main.ts`); `mergeBlocks` merges same-material blocks per soldier for speed: new parts must keep the one-geometry-per-gun reuse (build once, share the geometry) so 8 soldiers cost no more than now.
- Keep `GUN_FX` colours and the gold look of `gold` (`gold_color`, `gold_dark_color` in `data/config.json`); any new colour or size goes in `data/config.json` with a line in `config-notes.md`.
- Check `docs/engine-reference/web/threejs.md` before using a three.js geometry or material API (three.js 0.186.1).
- Tests are waived at `qa.level: minimal`; the retained screenshots are the evidence. The feel of the models is for the person's eyes.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Imported 3D model files, new gun animations (reload, recoil and swing stay as they are), new sounds, and changes to damage, range or any gun number.
- Characters and scenery (their own features).

---

## Files

- src/main.ts (the smooth gun builder buildGun for the first-person guns and the guns in every player's and bot's hands; materials GM)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Visual/Feel
**Required evidence**: retained screenshots under `production/qa/evidence/story-020-smooth-weapons/` and the sign-off in `production/qa/evidence/story-020-smooth-weapons-evidence.md`; tests are waived at `qa.level: minimal`.

**Status**: [x] Screenshots and the sign-off retained

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-019-free-for-all.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-16
**Criteria**: 8/8 passing (the frame rate on a real phone or a school PC is for your play: on the real GPU it went from 0.65 to 0.69 ms per frame, +6.9 %)
**Deviations**: advisory. The criterion asked for the same-seed replay `match yes`; it gave `match no` only because the gun in the final frame is the new rounded one (the game state rows are identical, `errors 0`) and the person accepted it. The glass colour of the sniper scope and the hand and sleeve colours are written in the code, not in `data/config.json`. The programmer agent hit its turn limit once: the lead checked the copy and took the frame-time measurement. Not part of this story: `index.html` `lang="es"` (separate request). The single-file build grew from 805 kB to 842 kB.
**Test Evidence**: waived at qa.level minimal; production/qa/evidence/story-020-smooth-weapons/ (6 sheets, stamp unchanged) and the sign-off in production/qa/evidence/story-020-smooth-weapons-evidence.md
**Reviewed by**: self, no independent review
**Same-seed run**: CHANGED, accepted — game state identical, only the rounded pistol in the final frame

## Calls beyond the design
- Dark outlines dropped; a shiny but light material (Phong, not physically based) with a slightly lighter steel (`src/main.ts`, `GM`) · kept 2026-11-16
- Rounded parts with 16 sides in first person and 10 in the characters' hands, bevelled edges and curved magazines (`src/main.ts`, `buildGun`) · kept 2026-11-16
- New details: pistol trigger guard and sights, SMG wire stock and curved accent magazine, rifle round accent handguard and muzzle brake, sniper scope with accent lens rings, bolt knob and round bipod (`src/main.ts`, `buildGun`) · kept 2026-11-16
- The sight height and the muzzle position are as before, and the guns in the hands no longer go through `mergeBlocks` (`src/main.ts`) · kept 2026-11-16
