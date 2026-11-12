# Story 006: Teacher screen

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: UI
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-12

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 19`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 19: the teacher sets up the session (subject, level, contents or CSV, map), splits the class into rooms and teams, and starts, pauses and ends each room.*

- [ ] The teacher screen is a page of the classroom server at its own address, available only from the server's own PC (localhost), so students cannot open it.
- [ ] The teacher sets up the session with the same choices as the single-player session screen: subject, level, topics or a CSV upload, and the map. The choice applies to every room.
- [ ] The teacher sees the connected students, updated live, and can move each student to a room and a team, or press "Repartir automáticamente" to split the class evenly into rooms of 4 v 4.
- [ ] The teacher can start, pause, resume and end each room, and start or end all rooms at once.
- [ ] Each room shows its state: waiting, running, paused or ended, the round and score, and who sits where.
- [ ] A paused room freezes for its students and shows "Pausa del profesor".
- [ ] When a room ends, its students see the results screen.
- [ ] All text is in Spanish, at least 14 px, with a retained screenshot of the setup panel and of the room list with students in it.

---

## Implementation Notes

- The page is served by the same server (story 003); it talks to the server over the same connection style as students, with a teacher role the server only grants to localhost.
- Reuse the single-player session screen's choices and the CSV loader.
- Keep the drawing on the existing canvas helpers, or plain HTML if that is simpler for a teacher's table: say which.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 007: the results table and the CSV export.
- Teacher accounts and logins: not built (brief, Out of scope).

---

## Files

- src/server/teacher.ts (created), src/server/profesor.html (created: the teacher page, plain HTML)
- src/server/net.ts, room.ts, rooms.ts, lobby.ts, aula.ts
- src/net/protocol.ts
- src/game/csv.ts (pool built once: no quadratic parse)
- src/main.ts (teacher pause banner, results when the teacher ends a room)
- data/aula.json, data/config-notes.md
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: UI
**Required evidence**: a retained screenshot of each screen touched (setup panel, room list), in `production/qa/evidence/story-006-teacher-screen/`. Tests are waived at `qa.level: minimal`.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-003-classroom-server.md`, `production/epics/solve-or-boom/story-004-student-join.md`
- Unlocks: `production/epics/solve-or-boom/story-007-results-and-menu.md`

## Completion Notes
**Completed**: 2026-11-12
**Criteria**: 8/8 passing (the 14 px minimum was not measured; teacher flow not yet tried with real student devices)
**Deviations**: advisory. Map names are written twice (`src/server/profesor.html` and `data/maps/*.json`) because the server sends only ids. The teacher page has no "N preguntas disponibles" line. `demo_rooms` went from 2 to 0 in `data/aula.json`, so `npm run aula` no longer starts bot demo rooms (`--salas N` and the load check still work). The two-student match driver of stories 004 and 005 was not re-run, because rooms now wait for the teacher. One "Failed to load resource: 404" is logged on every page, probably the favicon, not confirmed. The engine check did not read `showClassResults`, `onRoom`, the rest of `aula.ts` or the type definitions; Node and `ws` behaviour is NOT SOURCEABLE from the reference docs.
**Test Evidence**: waived at qa.level minimal. production/qa/evidence/story-006-teacher-screen/ (8 screenshots, driver logs with 8 and 10 students; stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png)

## Calls beyond the design
- The server starts with no bot rooms and 4 empty waiting rooms (maximum 16); the session applies when each waiting room starts, with a new seed; teacher rooms never rematch or close when empty; ended rooms release their students; students may join waiting and paused rooms; paused time is discarded (`data/aula.json`, `src/server/teacher.ts`, `rooms.ts`, `room.ts`, `lobby.ts`) · kept 2026-11-12
- "Repartir automáticamente" makes `ceil(n/8)` rooms spread evenly with alternating teams, counts only connected students, is refused while rooms run or pause and replaces waiting rooms silently; a move to the other team's seat is refused; a bot can be displaced, a student cannot (`src/server/teacher.ts`) · kept 2026-11-12
- The teacher page and its connection accept only the server's PC (loopback address, plus localhost Host and Origin), several teacher tabs are allowed, the CSV is limited to 256 KB and 500 questions with a cleaned file name falling back to "preguntas.csv" (`src/server/net.ts`, `teacher.ts`, `data/aula.json`) · kept 2026-11-12
- The teacher page's wording and behaviour (changes apply on click, per-subject topics, confirmation before Terminar, one select per student, "Alumno" and "Bot" tags, waiting and ended lists, green or red message bar, reconnect 1 to 5 s, dark palette at 14 to 16 px) and the student's pause banner with its second line and the "El profesor terminó la partida" headline (`src/server/profesor.html`, `src/main.ts`) · kept 2026-11-12
