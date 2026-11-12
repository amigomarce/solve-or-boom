# Story 006: Teacher screen

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: UI
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: [set by /dev-story when implementation begins]

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

*Planned. `/dev-story` replaces this list with the files it changed.*

- `src/server/` (teacher role and room control) and the teacher page (new)
- `src/main.ts` if the page shares the game's scenes

---

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
