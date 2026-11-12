# Story 004: Student join

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: UI
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: [set by /dev-story when implementation begins]

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 17`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 17: a student types a name, enters the room the teacher assigned and sees their team; empty seats are filled with bots. Students enter with a name only: no accounts, no personal data.*

- [ ] A student who opens the teacher's address sees a join screen in Spanish with a name field (at most 20 characters) and an "Entrar" button; an empty or blank name is refused with a message.
- [ ] After joining, the student sees a waiting screen with their name, their room and team, and the names of the others in the room; empty seats show as bots.
- [ ] Until the teacher assigns someone (story 006), the server puts each new student in the first room with a free seat, balancing the two teams.
- [ ] Two students with the same name get a suffix, e.g. "Ana (2)".
- [ ] When a match starts, the empty seats are filled with bots, named as bots.
- [ ] A student who reloads the page or loses the connection can enter again with the same name and gets their seat back while the match runs.
- [ ] A student who leaves in the middle of a match is replaced by a bot in that seat.
- [ ] All text is in Spanish, at least 14 px, nothing outside the 1280x720 frame, with a retained screenshot of the join screen and of the waiting screen.

---

## Implementation Notes

- The join and waiting screens are new scenes in the game, drawn with the existing screen helpers.
- Store nothing about the student except the name, and only in the server's memory.
- The teacher screen (story 006) will move students between rooms and teams; keep the seat model simple enough for that.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 005: playing the match.
- Story 006: the teacher assigning students to rooms and teams.
- Student accounts and passwords: not built (brief, Out of scope).

---

## Files

*Planned. `/dev-story` replaces this list with the files it changed.*

- `src/main.ts` (new scenes) and `src/server/` (seat and room model)

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: UI
**Required evidence**: a retained screenshot of each screen touched (join, waiting), in `production/qa/evidence/story-004-student-join/`. Tests are waived at `qa.level: minimal`.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-003-classroom-server.md`
- Unlocks: `production/epics/solve-or-boom/story-005-networked-play.md`, `production/epics/solve-or-boom/story-006-teacher-screen.md`
