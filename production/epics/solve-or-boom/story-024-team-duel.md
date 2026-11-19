# Story 024: Team duel mode

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-19

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 36`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the request: a new game mode, "duelo por equipos". Chosen rules: the team with more kills wins; dying is not final, the player answers a question to respawn.*

- [ ] "Duelo por equipos" is a third option of the mode choice, on the teacher screen and on the single-player session screen; `GAME_MODES`, the session settings, the protocol and `V` in `src/server/profesor.html` know it (protocol 15) and the class build is rebuilt.
- [ ] Two teams of 4 (single player: you and 3 bots against 4 bots; class: students seated by team, free seats bots). No bomb, no bomb sites, no start gates and no halftime; the map is shown and played without bomb sites and bases like Free for All.
- [ ] The match lasts a set time; the team with more kills wins, a tie says "Empate". Time and values are in `data/config.json` with a line each in `data/config-notes.md`.
- [ ] Dying is not final: the player answers a multiple-choice question from the bank to respawn, with the wrong-answer wait of Free for All; they respawn near their team and away from rivals; the buy menu (with its question) opens at the respawn; money comes from kills. Bots respawn by themselves after a set time.
- [ ] Friendly fire follows the existing option; streak rewards work as in the other modes.
- [ ] Teams are shown as in Bomba: waiting room, Tab table, kill feed and results show Equipo 1/2, the team kills score and the winning team; the teacher page shows the team kills in each room and the move menu keeps "sala y equipo".
- [ ] Works in single player and in class, on the five maps, and on phones; Bomba and Free for All are unchanged: Bomba same-seed replay `match yes`, `npx tsc --noEmit` has 0 errors, `npm run smoke` and the existing tests pass; a bounded headless room run ends with no server error.
- [ ] Retained screenshots: the session screen with the mode, a match in progress with the team score, the respawn question, the results with the winning team, the teacher page and the waiting room, and the phone layout.

---

## Implementation Notes

- Build on `src/game/ffa.ts` (respawn with a question, bots respawning, spawn picking, the map without zones) and `src/game/match.ts` / `state.ts` (`opts.mode`, `isFfa`): add a mode id, keep the mode rules in one new file like `ffa.ts`, and keep `src/game/bots.ts` plans that need zones off in this mode.
- Spawn near the team: each team starts apart and respawns at a walkable cell near living teammates, at least `ffa_spawn_dist`-style distance from living rivals (add its own key).
- Teacher and class: `src/server/teacher.ts`, `lobby.ts`, `room.ts`, `profesor.html`; spread of students keeps teams alternating like Bomba. Mode labels and texts in Spanish.
- Mode choice on the single-player session screen is in `src/main.ts`; results and the Tab table need a team variant of the Free for All ones.
- Hidden player rules of story 021 (invisible only during the start and respawn shop) apply as in Free for All.

---

## Out of Scope

- Oleadas cooperativas (story 025), new maps, a kill limit that ends the match early, and changes to Bomba or Free for All.

---

## Files

- src/game/teamduel.ts (new: the team duel rules: start, spawn near the team, respawn, scoring, end)
- src/game/state.ts, match.ts, combat.ts, ffa.ts, player.ts, seats.ts, plans.ts, bots.ts (the duel mode beside Free for All: isRoam checks, team kill score and money, no bomb plans)
- src/net/protocol.ts, snapshot.ts, mirror.ts (protocol 15, mode duel, the duel end and the kill feed team)
- src/server/teacher.ts, lobby.ts, profesor.html (the mode option, the duel summary line, V = 15)
- src/main.ts (session option, map without zones, HUD score, Tab table, kill feed chip, results table, waiting room line)
- data/config.json, data/config-notes.md (7 duel_ keys)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots of each screen touched and a bounded headless room run in `production/qa/evidence/story-024-team-duel/`; a person plays a match on each map.

**Status**: [ ] Screenshots and the rules run retained

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-019-free-for-all.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-19
**Criteria**: 8/8 passing
**Deviations**: None. The class server must be rebuilt and students must reload the page (protocol 15). Outside the story: the session screen subtitle still says "desactivar la bomba" in every mode, and the waiting room backdrop shows the B site.
**Test Evidence**: waived at qa.level minimal; production/qa/evidence/story-024-team-duel/ (13 screenshots, the rules run on five maps, stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke

## Calls beyond the design
- A kill pays $300 and scores for the team; a friendly-fire kill neither scores nor pays; no first-kill bonus; respawn 2–12 m from a living teammate and at least 25 m from rivals, else the farthest cell; the wrong-answer wait and the shop time are Free for All's (`src/game/teamduel.ts`, `src/game/combat.ts`, `data/config.json`) · kept 2026-11-19
- 300 s match, bots back after 6 s, bot skill 0.5; each team starts on the old attack and defence spawn cells, the bases not drawn (`data/config.json`, `src/game/teamduel.ts`) · kept 2026-11-19
- Equipo 1 orange and Equipo 2 teal; texts "Tu equipo gana a - b" / "Los rivales ganan a - b" / "Empate a - b", "Gana el Equipo N"; teacher "Equipo 1 a – b Equipo 2 · Quedan m:ss" / "Ganó el Equipo N"; HUD "DUELO POR EQUIPOS"; an "Equipo N" chip on each kill line; the mode button at 18 px (`src/main.ts`, `src/net/mirror.ts`, `src/server/teacher.ts`) · kept 2026-11-19
