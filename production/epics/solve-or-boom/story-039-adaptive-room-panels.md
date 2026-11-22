# Story 039: Room panels that adapt and reorder

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: UI
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: —

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 51`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request (a dynamic teacher page): panels that adapt to the screen and can be reordered.*

- [ ] On the "Salas" tab the teacher picks the cards' view: grid, list or compact.
- [ ] The teacher drags room cards to change their order; the order and the view are remembered in the browser.
- [ ] The page uses the width: more columns on a projector, one on a tablet, never a horizontal scroll bar.
- [ ] Each card can fold to one line (name, state, time left, number of students).
- [ ] Nothing changes on the server.
- [ ] All text is in Spanish. Retained screenshots: the three views, a folded card, and the page at 1024 px and at 1920 px.

---

## Implementation Notes

- The room cards are built in `render()` of `src/server/profesor.html` (`.rooms` grid, `auto-fill, minmax(min(100%, 340px), 1fr)`); each `tstate` push repaints them, so the order, view and folded state are applied on every repaint (kept by room id in `localStorage`, wrapped in try/catch).
- Story 037's student drag and this story's card drag must not get in each other's way (e.g. the card drags by its header only).

---

## Out of Scope

- Resizing single cards by hand, panels other than the room cards, server changes.

---

## Files

- `src/server/profesor.html`
- `production/qa/evidence/story-039-adaptive-room-panels/`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory), but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**:
- UI: a retained screenshot of each screen touched, in `production/qa/evidence/story-039-adaptive-room-panels/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-036-teacher-tabs.md`
- Unlocks: None
