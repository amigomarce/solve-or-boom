# Story 037: Move students by dragging

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: UI
> **Estimate**: S
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: —

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 49`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request (a dynamic teacher page): move a student from one room to another by dragging.*

- [ ] On the "Salas" tab the teacher drags a student's name from one room card and drops it on another: the student moves exactly as with today's menu (the same rules: a full room, a running room, a finished room).
- [ ] While dragging, the rooms that can take the student light up and the ones that cannot are dimmed with the reason.
- [ ] It works with the mouse and with a finger on a tablet; today's menu stays as the alternative (and for the keyboard).
- [ ] A refused move puts the name back where it was, with the server's message in Spanish.
- [ ] Retained screenshots: dragging over a room that takes the student and over one that does not.

---

## Implementation Notes

- Today a student is moved from their own room card through a menu on the name (story 027), which sends the teacher's move message to the server (`src/server/teacher.ts`, `src/net/protocol.ts`); the drag sends the same message: no server change.
- Pointer events (`pointerdown`/`pointermove`/`pointerup`) cover mouse and touch with one code path; the room cards are repainted by each `tstate` push, so the drag state must survive a repaint.

---

## Out of Scope

- Moving several students at once, reordering students inside a room, server changes.

---

## Files

- `src/server/profesor.html`
- `production/qa/evidence/story-037-drag-students/`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory), but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**:
- UI: a retained screenshot of each screen touched, in `production/qa/evidence/story-037-drag-students/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-036-teacher-tabs.md`
- Unlocks: None
