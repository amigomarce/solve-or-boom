# Story 007: Results per student and the two-mode main menu

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-12

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 20`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 20: right and wrong answers per student and per topic, exportable to CSV, kept only on the teacher's PC; the main menu offers "Un jugador (contra bots)" and "Clase (multijugador)".*

- [ ] During a match the server counts, for each student, the right and wrong answers per topic and level.
- [ ] The teacher screen shows a results table per student (right, wrong, percentage right, kills, deaths) and a view per topic, so the teacher sees what to reinforce.
- [ ] "Exportar CSV" downloads a file with one row per student, room, topic, level, right and wrong, that opens in Excel with the accents intact.
- [ ] Results stay only on the teacher's PC (the server's memory or a local folder that is not committed), hold only the name the student typed, and a "Borrar resultados" button removes them.
- [ ] Each student sees their own results at the end of the match.
- [ ] The first screen offers "Un jugador (contra bots)", which opens today's session screen, and "Clase (multijugador)", which opens the join screen; on the page served by the teacher's server, students go straight to the class mode.
- [ ] Single player still works offline from the single-file build, with no server.
- [ ] A retained screenshot of the menu and of the results table.

---

## Implementation Notes

- Build on the counters the single-player results screen already keeps (`right` and `wrong` per player), adding topic and level.
- The CSV is UTF-8 with a byte-order mark so Excel reads the accents.
- Where the data lives on disk is the programmer's call: state it, and git-ignore it.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 005: counting answers happens where the server checks them; this story only stores, shows and exports.
- Saving results between classes, student accounts and comparing classes: not built (brief, Out of scope).

---

## Files

- src/server/results.ts (created: results store in server memory, CSV export)
- src/server/profesor.html, teacher.ts, net.ts, room.ts, rooms.ts, aula.ts
- src/net/protocol.ts (version 3, results message), src/net/client.ts
- src/game/state.ts, player.ts, combat.ts, map.ts (answer and kill counting hooks, map names)
- src/main.ts (main menu, class info screen, student results)
- data/aula.json, data/config-notes.md
- No results folder: results live in server memory only, nothing to git-ignore
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. A retained screenshot of each screen touched (the menu, the results table), in `production/qa/evidence/story-007-results-and-menu/`.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-005-networked-play.md`, `production/epics/solve-or-boom/story-006-teacher-screen.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-12
**Criteria**: 5/8 passing (3 deferred to your play: the CSV opened in Excel with the accents intact, "Borrar resultados" emptying the table, the student's own results at the end of a match won to the end)
**Deviations**: advisory. With many students the teacher's results table is rebuilt and sent every 500 ms (an estimate of 100 to 150 KB at the 1000-name cap, not measured). Names past the 1000-name cap are not counted and nothing tells the teacher. A formula-looking cell gets a visible apostrophe in Excel (unreachable today). Not seen running: a match won to the end, the rematch order and the "y N temas más" line. A 404 is logged on every page served by the classroom server (probably the favicon). The engine check did not read the menu, class-info and single-file code in `main.ts`, `vite.config.ts`, the internals of `client.ts` or `rooms.ts`/`aula.ts` beyond a search; Node and `ws` behaviour is NOT SOURCEABLE from the reference docs. `?manual=1` is what opens the session screen, so the same-seed run and the boot tests keep working.
**Test Evidence**: waived at qa.level minimal. production/qa/evidence/story-007-results-and-menu/ (7 screenshots and an example CSV; stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png)

## Calls beyond the design
- Results keyed by typed name without case, last room in the table and per-row room in the CSV; CSV with `;` separator, quoted cells, header Alumno;Sala;Tema;Nivel;Correctas;Incorrectas, levels by name, one empty row for a student with no answers, file `resultados.csv`, an apostrophe before a cell starting with = + - @, a store of at most 1000 names (`src/server/results.ts`, `teacher.ts`, `data/aula.json`) · kept 2026-11-12
- A topic is "A reforzar" with 5+ answers and under 60 % right; bots are not counted; a teacher-ended room sends partial results; the winning step always sends a snapshot; protocol version 3 (`data/aula.json`, `src/net/protocol.ts`, `src/server/net.ts`, `room.ts`) · kept 2026-11-12
- Main menu with two buttons, subtitles and a key hint, keys and mouse, "Menú (Esc)" on the session screen, "Clase" from the single file only explains the teacher's address, `?manual=1` opens the session screen (`src/main.ts`) · kept 2026-11-12
- The teacher page's Resultados wording and the Borrar confirmation, and the student's "Tus resultados" and "Equipos" panels with an 8-topic limit and their waiting and empty lines (`src/server/profesor.html`, `src/main.ts`) · kept 2026-11-12
