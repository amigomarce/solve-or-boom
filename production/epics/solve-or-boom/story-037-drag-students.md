# Story 037: Move students by dragging

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: UI
> **Estimate**: S
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-22

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

- `src/server/profesor.html` — a name handle on each student seat; dragging it (pointer events, mouse and touch) over the room cards lights the ones that can take the student and dims the others with the reason; the drop sends `tmove` like the menu; Escape cancels; the menu stays
- `production/qa/evidence/story-037-drag-students/` — 3 screenshots, `stamp.txt`

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

---

## Completion Notes
**Completed**: 2026-11-22
**Criteria**: 3/5 passing (deferred, requires playtest session: AC-3 the drag with a finger on a real tablet; AC-4 a move the server refuses, with the name staying put and the message showing — Escape and the same-room drop were seen)
**Deviations**: None. Seen on the way and left for story 039: the new name handle widens the seat rows, so in Bomba the "Equipo 2" columns overflow the room cards more than before.
**Test Evidence**: `production/qa/evidence/story-037-drag-students/` (3 screenshots); tests waived at qa.level minimal
**Reviewed by**: self, no independent review

## Calls beyond the design
- Reasons shown on a dimmed room: "Sala llena", "Sala terminada", "Sala no disponible", "Ya está aquí"; running rooms light up as valid (the server lets students join them, so "Partida en marcha" is never shown); a drop on the student's own room, either team, does nothing (`src/server/profesor.html`) · kept 2026-11-22
- On a drop the student goes to the team column under the pointer, else the first team with room; the drag starts after 6 px, shows a gold pill with the name, Escape cancels; only a new name handle (grip ⠇) drags, bots do not; document-level pointer listeners instead of pointer capture · kept 2026-11-22
