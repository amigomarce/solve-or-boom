# Story 021: Free for All map and spawn changes

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-16

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 33`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 33, requested by the person after playing Free for All: the mode should not look or play like a team map.*

- [ ] In Free for All the map is shown and played without the team start zones, the bomb sites A and B and the start gates, the minimap too; no rule ties a player to a zone; in Bomba the maps look and play exactly as today.
- [ ] Players start the match and respawn on any walkable cell of the map (not only the bases and the bots' routes), at least `ffa_spawn_dist` from every living player, else on the farthest cell; the first floor of the two-floor map counts as walkable.
- [ ] A player buying at the start of the match or at a respawn is invisible and untouchable until the shop is closed or its time runs out: not drawn for others (no model, name or minimap dot), cannot be hurt by shots or anything else, cannot move or shoot; then they appear, visible and vulnerable.
- [ ] Bots buy and appear at once, and are never invisible; bots and people alike cannot target or shoot an invisible player.
- [ ] The shop can be opened at any time in Free for All with the buy key or the touch button (it asks its question as always); that purchase leaves the player visible and vulnerable, and the match goes on while it is open.
- [ ] The class server decides who is invisible and untouchable and hides those players from every other student's snapshot; the protocol version goes up, the teacher page constant `V` matches, the class build is rebuilt; a bounded headless room run ends with no server error.
- [ ] Works in single player and in class, on the five maps; the Bomba same-seed replay is `match yes`, `npx tsc --noEmit` has 0 errors, and `npm run smoke` and the existing tests pass.
- [ ] Retained screenshots: a Free for All map without bases, sites or gates, the minimap, a spawn in the middle of the map, the invisible player's shop (seen by the player and by another student), and the phone layout.

---

## Implementation Notes

- The zones are the `zone` array and the base and site floor rectangles of `src/game/map.ts` (`att_base`, `def_base`, `site_a`, `site_b`, gates through `gatesClosed`); the drawing of bases, A/B marks and gates, and the minimap are in `src/main.ts`. In Free for All the match already sets `gatesClosed` false (`src/game/ffa.ts`): hide the zone drawing and the minimap marks when `isFfa(match)`, and keep every bot plan that uses `zone`/`siteCells` off in ffa (`src/game/bots.ts`, `plans.ts`).
- Spawn: `pickSpawn` and `spawnPool` in `src/game/ffa.ts` use the bases, the bots' route waypoints and anchors; replace the pool with every walkable cell (`walkable`, with the first floor on a map with heights) and keep the distance rule.
- Invisible and untouchable: a hidden per-player flag on the desk or player (like `healT`) set by `ffa.ts` at the start and on respawn while the shop's menu or card is open, cleared when it closes or `ffa_buy_menu_time` ends. `canSee` and the bots' target search (`src/game/bots.ts`), `humanShoot`/`botShoot`/`applyDamage` (`src/game/combat.ts`) must skip a hidden player; `playerRow` in `src/net/snapshot.ts` must not send a hidden player to others (position, name flag), so a modified browser cannot see them; the mirror hides them in the drawing and the minimap.
- Shop at any time in ffa: today the shop key in ffa shows "La tienda se abre cuando reapareces" (`src/game/player.ts`, `inp.shop`); allow it during the live match like the buy phase, without the base check (`inOwnBase`), the player stays visible and vulnerable and keeps moving while the menu is open only if that is how the menu works today (report what you do).
- Protocol: a hidden player must be absent or flagged in the snapshot rows; the own row says "you are hidden" (`src/net/protocol.ts`, `snapshot.ts`, `mirror.ts`); bump the version and `V` in `src/server/profesor.html`.
- All player text in Spanish; every number in `data/config.json` with a line in `config-notes.md`. Tests are waived at `qa.level: minimal`; bounded headless runs only.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- New maps made for Free for All, changes to the Bomba mode, and invisibility outside the shop (no hiding while playing).
- A kill limit, teams inside Free for All and saving options between sessions.

---

## Files

- src/game/ffa.ts (spawn from every walkable cell, the hidden-while-buying clock, the shop at any time, bots roaming the whole map)
- src/game/state.ts, combat.ts, bots.ts, player.ts, match.ts, seats.ts (hidden/hideT fields; no damage, no targeting and no shots on a hidden player; the shop key in ffa)
- src/server/room.ts (the hidden start shop for seated students)
- src/net/protocol.ts, snapshot.ts, mirror.ts (protocol 13: a hidden player's row is blank for the others, the own row says hidden), src/server/profesor.html (V = 13)
- src/main.ts (the map and minimap without bases, sites and gates in Free for All; hidden players not drawn; the shop's visible/invisible line)
- data/config-notes.md (ffa_spawn_dist and ffa_buy_menu_time lines)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots of each screen touched and the bounded headless room run in `production/qa/evidence/story-021-ffa-map-and-spawn/`; a person plays a Free for All match on each map.

**Status**: [x] Screenshots and the rules run retained

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-019-free-for-all.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-16
**Criteria**: 8/8 passing (a person plays Free for All on each of the five maps: the screenshots show grande and dos pisos, the rules check covers spawn and hiding on all five)
**Deviations**: advisory. The class run's screenshot of the second student does not show the first one because they were not in each other's view: the proof that a hidden student is not sent is the second student's received state and the blank snapshot row in the rules check. On the small map 22 of 60 spawns could not be 30 m from everybody and used the farthest cell. The programmer agent hit its turn limit twice: the lead checked the copy, re-ran the rules check, the Bomba same-seed run, the types and the screenshots. Not part of this story: `index.html` `lang="es"` (separate request). The class server must be rebuilt and students must reload the page (protocol 13).
**Test Evidence**: waived at qa.level minimal; production/qa/evidence/story-021-ffa-map-and-spawn/ (14 screenshots, the rules run, stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (Bomba mode, match yes)

## Calls beyond the design
- The invisibility has its own fixed clock of `ffa_buy_menu_time` that keeps running with a buy question open, and ends when the menu closes even with a question open (`src/game/ffa.ts`) · kept 2026-11-16
- The shop opened mid-match also closes by itself after `ffa_buy_menu_time` and freezes the player, as the menu always did (`src/game/ffa.ts`, `src/game/player.ts`) · kept 2026-11-16
- Other students see a hidden player as a dead one, greyed in the Tab table; the own row carries the hidden flag (`src/net/snapshot.ts`, `src/net/protocol.ts`, `src/net/mirror.ts`) · kept 2026-11-16
- A student who reconnects mid-match gets no hidden shop; a hidden player's own shot makes no sound or flash (`src/server/room.ts`, `src/main.ts`) · kept 2026-11-16
- The shop texts "Eres invisible y nadie te puede dañar mientras compras" (green) and "Te pueden ver y dañar mientras compras" (red) (`src/main.ts`) · kept 2026-11-16
- The spawn distance is measured flat (above or below counts as near), ramps are not spawn points, and Free for All walls are not tinted near the bases (`src/game/ffa.ts`, `src/main.ts`) · kept 2026-11-16
