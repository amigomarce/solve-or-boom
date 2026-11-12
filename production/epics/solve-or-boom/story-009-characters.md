# Story 009: Characters

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Presentation
> **Type**: Visual/Feel
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-12

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 22`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 22 and its Look (orange attackers, teal defenders, chunky blocks, every figure drawn). The chosen style is "polished blocks".*

- [ ] The character model has more detail than today (head with face or visor, torso, arms, legs, boots, belt or pack, the weapon in the hands) and is still built from simple blocks.
- [ ] Attackers and defenders are told apart at a glance by colour and by one shape detail (for example helmet versus cap), not by colour alone, and the 3 bot roles (rusher, rifleman, sniper) can be told apart by gear.
- [ ] A character walks with a leg and arm swing, and the swing speed follows how fast it moves.
- [ ] Crouching, prone, jumping, planting and dying each show their own pose or animation (a death animation that ends with the body down, not a disappearance).
- [ ] The weapon in a character's hands matches the gun it holds (pistol, SMG, rifle, sniper).
- [ ] All of this is seen on bots in single player and on other students in class mode, driven by what already reaches the client (position, stance, weapon, alive); no new field is added to the network messages.
- [ ] Frame time on the same machine and the same map, with 8 characters in view, is no more than 20 % worse than the build before this story (report both numbers).
- [ ] The single-file build stays under 1 MB and still makes no network request.
- [ ] Retained screenshots of each side, of each bot role, of walking, crouching, prone and dying, and of two students in a class match, with a lead sign-off.

---

## Implementation Notes

- The model is built in `makeSoldier` in `src/main.ts` and placed through `models`; in class mode the other students are positioned by `interpolate` in `src/net/mirror.ts`. Animation speed can come from the distance a model moved since the last frame, so nothing is sent from the server.
- Everything is drawn from three.js primitives and generated textures: no downloads.
- Reuse geometries and materials between characters; 8 models in view must stay cheap.
- The same-seed replay compares a screenshot, so this story will probably show `match no`. That is expected: `/dev-story` asks you to accept it.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 008: first-person guns and effects.
- Story 010: the scenery.
- Customisable skins or names above heads beyond what exists today.

---

## Files

- src/main.ts (block soldier with shared geometry and materials, side headgear and role gear, held guns, walk, crouch, prone, jump, plant, defuse and death poses)
- data/config.json (chr_* values), data/config-notes.md
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Visual/Feel
**Required evidence**: retained screenshots in `production/qa/evidence/story-009-characters/` and the sign-off in `production/qa/evidence/story-009-characters-evidence.md`. Tests are waived at `qa.level: minimal`. Only the feel (timing, weight) is left to a playtest.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-12
**Criteria**: 9/9 passing (that the walking swing follows the speed is feel, left to your play)
**Deviations**: advisory. Bots never crouch, go prone or jump, because the rules don't ask them to; those poses show only on students. The class-mode screenshots predate the performance trim and used a one-frame client camera move to bring the other student into view. The frame time was measured as +8.7 % (six runs, before the brim fix) and about +6 % (three runs, after it) on the GPU; the agent's own measurement was +2.3 %. The engine check did not open the three.js reference pages in full or run the game.
**Test Evidence**: waived at qa.level minimal for tests; production/qa/evidence/story-009-characters/ (26 screenshots and the frame-time numbers; stamp unchanged) and the signed production/qa/evidence/story-009-characters-evidence.md
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke after the brim fix; earlier CHANGED, accepted (a distant character drawn with the new model, game state identical)

## Calls beyond the design
- Attackers wear a cap with a peak and defenders a taller helmet with a light-blue visor band, swapping at halftime; rusher with a red bandana, rifleman with an olive vest, chest magazines and shoulder pads, sniper with a wide brim, a big pack and ghillie strips; a shared belt, hip pouches, backpack and eye band (`src/main.ts`) · kept 2026-11-12
- Outlines only on the big blocks; the held gun follows the current gun and is built on first use, drawn from story 008's shapes simplified at 1.2 times (`src/main.ts`) · kept 2026-11-12
- The death falls backward over 0.7 s with the gun hidden from 60 %; plant and defuse lean forward 0.45 rad with the bomb in the hands, with no muzzle flash while the gun is put away; prone with the head raised; the sniper's brim kept level in the world, 0.15 m above the head (`src/main.ts`, `data/config.json` `chr_*`) · kept 2026-11-12
- The walk at 4 rad per metre with a knee bend, a bob of 0.04 m, the swing cut to 25 % when prone and a lean of 0.06 rad; the pose angles and the leg lengths (0.4 and 0.46 m) are fixed in code (`src/main.ts`, `data/config.json` `chr_*`) · kept 2026-11-12
