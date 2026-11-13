# Story 012: Two-floor map

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
**Requirement**: `Brief MVP feature 24`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 24, second half: a map to play with a ground floor and a first floor. The rules for heights are story 011.*

- [ ] A new map in `data/maps/` with a ground floor and a first floor joined by at least two stairs or ramps, two bases, two bomb sites (A and B) and lanes on both levels, passing the map checks in `src/game/map.ts`.
- [ ] The map appears in the map selector of the single-player session screen and of the teacher screen, with its name in Spanish and its own round time.
- [ ] The first floor is drawn with a visible floor slab, edges or rails, and stairs or ramps that read as such; you can see down from the first floor and up from below through the openings.
- [ ] The minimap shows the level you are on (and which level each marker is on, such as the bomb, the sites and teammates), so you can tell up from down at a glance.
- [ ] Bots play full matches on it: they buy, take both levels, plant on and defuse at both sites, and do not get stuck on the stairs.
- [ ] In class mode, students in a room play the map with the teacher's choice of map, seeing each other on both levels.
- [ ] A full match against bots on the new map ends with no page error, and a headless room run (two students, six bots) ends with no server error.
- [ ] Retained screenshots of the ground floor, the first floor, a stair or ramp, the minimap on each level, and the map in both selectors.

---

## Implementation Notes

- Build on story 011's height format and checks; the map is data only, plus whatever drawing the first floor needs in `buildWorld` (`src/main.ts`) and the minimap.
- Keep it within the size of the other maps (around 162 x 108 m) and with a round time like theirs, so a class match lasts about as long.
- Follow story 010's look for walls, floors and props if it is done first.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 011: the rules for heights, the network field and the bots' height-aware routes.
- More than one two-floor map, more than two levels.

---

## Files

- data/maps/dospisos.json (new map "Dos pisos", 54x36 cells, 162 x 108 m: ground floor and first floor, 3 stairs, site A on the ground, site B on the first floor)
- src/game/map.ts (the map in MAPS; a drop off the first floor only into open air)
- src/game/bots.ts (re-plan near a level change, give a waypoint up when stuck, no corner cut across a ramp's side)
- src/main.ts (first floor drawn: slab, rails, stairs with steps, crates; minimap per level; map selector spacing)
- data/config.json, data/config-notes.md (default_map option, bot_stuck_give_up, scn_rail_height, scn_stair_steps_per_cell)
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots and the headless room run in `production/qa/evidence/story-012-two-floor-map/`; a person plays a full match on it.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-011-heights-in-the-rules.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-13
**Criteria**: 8/9 passing (1 deferred to your play: a person plays a full match on the map)
**Deviations**: advisory. 8 of 10 bot matches ended in 3 rounds, so the map may favour one side. The room runs and the class screenshots predate the one-line bot fix (corner cutting across a ramp's side, maps with floors only). A late `need_hello` refusal after a room closes (story 005 code) may show "Primero hay que presentarse (hello)." on the student page. The engine check left three advisories: the minimap redraws every cell every frame, two bot numbers (0.8 s stuck time, 0.5 m arrival distance, both older than this story) are written in `bots.ts`, and the crate height 1.1 m appears in three places; most three.js calls are NOT SOURCEABLE in `docs/engine-reference/web/`. In the class screenshots one student is a Node-driven client and Ana's camera was placed by script for that frame.
**Test Evidence**: waived at qa.level minimal for tests; production/qa/evidence/story-012-two-floor-map/ (14 screenshots, the 10-match bot run, the two class room runs, the map as text, notes and stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (the four flat maps take the old code path)

## Calls beyond the design
- Map "Dos pisos" 54 x 36 cells (162 x 108 m), round time 150 s, site A on the ground and B on the first floor, 3 stairs (west, east, centre with a bridge), defenders anchored on the first floor for balance (`data/maps/dospisos.json`) · kept 2026-11-13
- First floor drawn with 1.0 m rails, 6 steps per stair cell with yellow nosings and crates stacked two high (`src/main.ts`, `data/config.json` `scn_rail_height`, `scn_stair_steps_per_cell`) · kept 2026-11-13
- Minimap per level: ground dimmed to 35 % on the first floor, stairs in yellow, other-level markers at half opacity with an up or down arrow, labels "Planta baja" and "Piso 1" (`src/main.ts`) · kept 2026-11-13
- Bots give a waypoint up after 3 stuck checks (`bot_stuck_give_up`) and never cut a corner across a ramp's side (`src/game/bots.ts`, `data/config.json`) · kept 2026-11-13
