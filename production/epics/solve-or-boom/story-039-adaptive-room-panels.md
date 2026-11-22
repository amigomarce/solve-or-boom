# Story 039: Room panels that adapt and reorder

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: UI
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-22

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

- `src/server/profesor.html` — the Salas tab: a view picker (Cuadrícula, Lista, Compacta); room cards reordered by dragging their header or with ◀ ▶ buttons; each card folds to one line; view, order and folded rooms remembered in the browser and applied on every repaint; card and team-column widths fixed so nothing overflows from 360 to 1920 px; the Alumnos list in columns on wide screens
- `production/qa/evidence/story-039-adaptive-room-panels/` — 16 screenshots (9 from the programmer's check with a simulated connection, 7 `real-*` from the classroom server), `stamp.txt`

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

---

## Completion Notes
**Completed**: 2026-11-22
**Criteria**: 4/6 passing (deferred, requires playtest session: AC-2 dragging a room card by its header against the server (only the "Mover después" button was run there; the header drag was seen in the programmer's simulated-connection check) and with a finger on a tablet; AC-6 the phone at 360 px (measured, no screenshot))
**Deviations**: None. Seen on the way: in the "Lista" view the help text still says "botones ◀ ▶" while that view's order buttons are ▲ ▼. This story also fixed the "Equipo 2" columns overflowing the room cards in Bomba (seen in stories 036 and 037); measured 0 overflowing elements in the three views at 1024, 1366 and 1920 px.
**Test Evidence**: `production/qa/evidence/story-039-adaptive-room-panels/` (16 screenshots); tests waived at qa.level minimal
**Reviewed by**: self, no independent review

## Calls beyond the design
- Default view "Cuadrícula"; grid card minimum 500 px (one column at 1024, two at 1366, three at 1920), compact 300 px; the list view has the header on top and, from 1100 px, info, team columns and actions in three blocks; the order buttons are ◀ ▶ (▲ ▼ in the list view) and each header has a ▾ fold button; the Alumnos list runs in columns of at least 440 px; the tab bar is smaller under 480 px (`src/server/profesor.html`) · kept 2026-11-22
- A folded card shows name, state, a brief (vote seconds left, the server's summary, "Ronda N · a – b" in Bomba, or "Todavía no ha empezado"), the student count and the header buttons, and still takes a dropped student; a compact card hides the bots, team headings, tags and "Renombrar" but keeps the human students with their handle and menu; the card drag starts only from the header after 6 px, with no auto-scroll; finished rooms keep their old layout · kept 2026-11-22
