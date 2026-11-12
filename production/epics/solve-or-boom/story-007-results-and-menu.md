# Story 007: Results per student and the two-mode main menu

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: [set by /dev-story when implementation begins]

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

*Planned. `/dev-story` replaces this list with the files it changed.*

- `src/server/` (counters, export) and the teacher page
- `src/main.ts` (main menu, student results)
- `.gitignore` (the results folder, if there is one)

---

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
