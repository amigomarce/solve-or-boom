# Story 011: Heights in the rules

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
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

*From the brief's Feature 24, first half: the rules, and the map data, learn about heights. The two-floor map itself is story 012.*

- [ ] A map can say that parts of its floor are on a first floor (a height level per floor area in `data/maps/*.json`) and where stairs or ramps join the levels; a map without that information loads exactly as before, so the four existing maps do not change.
- [ ] A player and a bot move up and down a stair or ramp smoothly and cannot walk through the edge of a higher floor, nor stand on a level they cannot reach; jumping and crouching still work on both levels.
- [ ] A shot does not pass through a floor or ceiling: a player on the first floor cannot be hit from below through the floor, and a shot from above hits what is below only through an opening (stairwell, edge, rail gap).
- [ ] Bots plan routes that include the stairs or ramps, move between levels to reach a site, and take cover and peek with the height in mind; they do not freeze or walk into the void on a map with two levels.
- [ ] The height of every player and of the bomb is part of the match state and of the network messages (positions in snapshots carry it; the protocol version goes up), so a student on the first floor is seen at the right height by the others and predicts their own movement correctly.
- [ ] Plant, defuse and bomb carrying work on either level.
- [ ] The map checks in `src/game/map.ts` report, in sentences, a stair or ramp that leads nowhere, a spawn or site on an unreachable level, or a level with no way up.
- [ ] The same-seed replay against the last accepted run is `match yes` (the existing maps are untouched), `npx tsc --noEmit` has 0 errors, and `npm run smoke` and the existing tests pass.
- [ ] A headless run of a room (two students, six bots) on a test two-level map plays a full match with no server or page error, and the driver output is retained as evidence.

---

## Implementation Notes

- Today the map is a flat grid (`grid`: 0 wall, 1 floor, 2 crate) with positions in x and z; there is no height. The rules live in `src/game/` (player movement and collision in `player.ts`, shooting in `combat.ts`, routes in `bots.ts`, the map in `map.ts`) and run in Node on the server, so this must stay free of any browser code.
- How heights are stored (a level per cell, ramps as cells with a slope, stairs as steps) is the programmer's call: state it and keep the map format simple to author by hand in `data/maps/`.
- Network: positions travel in snapshots (`src/net/snapshot.ts`, `protocol.ts`); a height field means a new protocol version and a rebuild of the class build. Read the stories 004, 005 and 006 notes about what the server and the teacher page rely on.
- The test two-level map used by the headless run can live in a scratch folder; the playable two-floor map is story 012.
- Node and `ws` are not covered by `docs/engine-reference/web/`: verify against the installed packages and say what was checked.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 012: the two-floor map to play, its look and the minimap per floor.
- Story 010: how floors and walls look.
- More than two levels, ladders, falling damage and jumping between levels: not built.

---

## Files

- src/game/map.ts (two-layer height model, ramps, helpers, bfs3 and canStep, shared ramp-side rule, height map checks)
- src/game/player.ts, combat.ts, bomb.ts, rounds.ts, state.ts (feet height, 3D shots, bomb height, plant and defuse by level)
- src/game/bots.ts, plans.ts (routes, cover and hearing across levels)
- src/net/protocol.ts (version 4), snapshot.ts, mirror.ts (heights over the network and in prediction)
- src/server/profesor.html (version 4)
- src/main.ts (camera and models at height, stand-in slab and ramps, testMap dev hook behind ?manual=1)
- data/config.json, data/config-notes.md (level_height, step_height, ramp_max_slope, bomb_reach_y, bot_hear_floor_mult, scn_slab_thick)
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. The same-seed replay (`one-shot-grow.sh replay`) must be `match yes`, and the retained headless run on a two-level test map is kept in `production/qa/evidence/story-011-heights-in-the-rules/`. A person plays it and says what felt wrong.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None (the classroom stories 002 to 007 are done)
- Unlocks: `production/epics/solve-or-boom/story-012-two-floor-map.md`

## Completion Notes
**Completed**: 2026-11-13
**Criteria**: 7/9 passing (2 deferred to your play: jumping and crouching on the first floor, and one student seen at the right height by another in a class match)
**Deviations**: advisory. The height correction reaches 0.13 to 0.14 m on the ground and 0.11 m on a ramp (target 0.1 m), and larger corrections happen only when a student dies, because the prediction runs a step or two past the death. Two `need_hello` client errors (14 refusals) appeared once in an interim 100 ms run and not in the final runs; the cause is not proven. The bomb blast is still a flat 14 m radius through floors. The engine check did not read `coverSearch3`, the callers of `bfs3` or the rest of the bots code, did not grep the three.js reference pages, and Node and `ws` behaviour is NOT SOURCEABLE from the reference docs. One bot run (`bots-new.txt`) predates the final bot fixes. The floor and ramps are drawn as a provisional stand-in; their look and the playable map are story 012.
**Test Evidence**: waived at qa.level minimal for tests; production/qa/evidence/story-011-heights-in-the-rules/ (3 screenshots, the two-level test map, the rules results, the bot runs, the map comparison and the room runs; stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (the four flat maps take the old code path)

## Calls beyond the design
- Two layers per cell (`grid` for the ground, `grid1` for the first floor); stairs are smooth ramps entered only along their axis, one level rise, slope at most 0.6 so at least 2 cells; the first floor at 3 m (`level_height`), steps of at most 0.5 m, a larger drop is a fall with no damage; ground walls rise through every level and first-floor cover is a crate with a third number; ramp cells take no spawns, sites or waypoints (`src/game/map.ts`, `data/config.json`) · kept 2026-11-13
- Bomb pickup and defuse need a height gap under 1.5 m (`bomb_reach_y`); the blast is still a flat 14 m radius through floors; more than half a level counts as level 1 (`src/game/bomb.ts`, `player.ts`, `map.ts`) · kept 2026-11-13
- Bots drop off an edge only when their path chose it and hear across floors at half the range unless a clear line joins the points (`bot_hear_floor_mult`); a waypoint with no level takes the lowest walkable level (`src/game/bots.ts`, `plans.ts`, `combat.ts`) · kept 2026-11-13
- Humans, bots and the prediction share the ramp-side rule (only by the ramp's ends; a body already on a side can step out); protocol version 4 sends feet and bomb heights in cm only on maps with heights; the prediction measures body height, walks the blend with `moveBody` and takes the server's state when the blended point cannot be reached (`src/game/map.ts`, `src/net/`) · kept 2026-11-13
- The floor and ramps drawn as a provisional stand-in with the wall texture (`scn_slab_thick` 0.25 m), and a `testMap` dev hook behind `?manual=1` (`src/main.ts`, `data/config.json`) · kept 2026-11-13
