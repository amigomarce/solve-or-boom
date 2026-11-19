# Story 023: Rooms and student view follow the game mode

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-19

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 35`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the teacher's request: with Free for All chosen, rooms and students still show teams.*

- [ ] With "Free for All" chosen, the teacher page shows no "Equipo 1 / Equipo 2" anywhere: rooms list their players in one group, the "mover alumno" menu offers only the room, and the score line "Equipo 1 a – b Equipo 2" is replaced by the kills leader or the time left; Bomba keeps teams exactly as today.
- [ ] Spreading the class into rooms in Free for All does not alternate teams or reserve team seats; students fill the room's seats in order (the room size is unchanged), the free seats are bots.
- [ ] A student in a Free for All room sees no "Tu equipo", "Equipo 1/2", "cambian de lado" or "Marcador final: tu equipo" text: the waiting room lists players only, the Tab table and the final results show Jugador, Bajas, Muertes (and Bien/Mal) without a team column, and the end text names the place and the kills.
- [ ] Changing the mode on the teacher page while students are in rooms updates the teacher view at once and each student's waiting room on their next snapshot; nobody is dropped from a room and a started match is not affected.
- [ ] The class protocol version goes up (14), `V` in `src/server/profesor.html` matches, `dist-class` is rebuilt, and a bounded headless room run in both modes ends with no server error.
- [ ] Works on the five maps; Bomba same-seed replay is `match yes`, `npx tsc --noEmit` has 0 errors, `npm run smoke` and the existing tests pass.
- [ ] Retained screenshots: the teacher page in Free for All and in Bomba, a student's waiting room and Tab table in Free for All, and the phone layout of the waiting room.

---

## Implementation Notes

- Teacher side: `src/server/profesor.html` (rooms `.teams` grid ~line 253, score line ~260, move menu `Equipo` options ~line 235, `tmove` ~line 323) and `src/server/teacher.ts` (spread at ~line 74 alternates `team = j % 2`; `tmove` at ~line 153).
- Student side in `src/main.ts`: waiting room ~lines 2057-2087, results table columns ~lines 2221 and 2297, end text ~lines 96 and 2212. Free for All is `isFfa(match)` / the room's mode (`src/game/ffa.ts`); decide on what the snapshot or room info already carries and add a field only if needed.
- The room's seats keep their internal `team` values; only what is shown and how students are placed changes in Free for All.
- Bump `PROTOCOL_VERSION` and `V` together if any message changes; students must reload. All text in Spanish.

---

## Out of Scope

- Changing Free for All rules, team sizes, new modes, and single player (it has no rooms).

---

## Files

- src/net/protocol.ts (protocol 14: the room view and the teacher room carry the mode; the teacher room carries a Free for All summary)
- src/server/lobby.ts (the mode in the room view; moving into a Free for All room takes any free seat)
- src/server/teacher.ts (spread without teams in Free for All; waiting rooms follow a mode change; the Free for All summary)
- src/server/profesor.html (V = 14; one Jugadores list, the summary line and a room-only move menu in Free for All)
- src/main.ts (the waiting room without teams in Free for All; the end text fallback)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots of each screen touched and a bounded headless room run in `production/qa/evidence/story-023-mode-aware-rooms/`.

**Status**: [ ] Screenshots and the rules run retained

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-019-free-for-all.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-19
**Criteria**: 7/7 passing
**Deviations**: None. The class server must be rebuilt and students must reload the page (protocol 14).
**Test Evidence**: waived at qa.level minimal; production/qa/evidence/story-023-mode-aware-rooms/ (9 screenshots, stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke

## Calls beyond the design
- Teacher Free for All line "Va primero NAME con N bajas · Quedan m:ss" / "Sin bajas todavía · Quedan m:ss" / "Ganó NAME con N bajas"; one "Jugadores" column; the move menu shows the room only (`src/server/teacher.ts`, `src/server/profesor.html`) · kept 2026-11-19
- Moving a student into a Free for All room takes the first free seat ("Esa sala no tiene sitio libre."); the spread fills seats 0, 1, 2…; a student who joins by name still gets a balanced seat (`src/server/lobby.ts`, `src/server/teacher.ts`) · kept 2026-11-19
- A mode change rebuilds the waiting rooms and students keep their seats, so after Free for All to Bomba they can all be on Equipo 1 until the teacher spreads again (`src/server/teacher.ts` followMode) · kept 2026-11-19
- Student waiting room "Modo: Free for All" with one "Jugadores" list and "Todos contra todos, sin equipos…"; end text fallback "Terminaste con N bajas" (`src/main.ts`) · kept 2026-11-19
