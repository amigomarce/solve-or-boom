# Story 038: Live result charts

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
**Requirement**: `Brief MVP feature 50`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request (a dynamic teacher page): live results with charts.*

- [ ] On the "Resultados" tab: a bar chart by topic (right and wrong answers stacked, the % right) and another by student, beside or above today's tables.
- [ ] The bars update as each answer arrives, with a short animation, without reloading.
- [ ] Today's room and student filters and the "weakest first" order apply to the charts too.
- [ ] Drawn by the page itself (no library from the internet: the classroom network may have none), readable on a projector, with colours that do not rely on red and green alone.
- [ ] "Exportar CSV" and "Borrar resultados" work as today.
- [ ] Retained screenshots: the charts with answers from two rooms, and after new answers arrive.

---

## Implementation Notes

- The results reach the page in the `tstate` push and are shown by `renderResults()` in `src/server/profesor.html` (story 027: filters, sorting by a header); the export is the server's (`src/server/results.ts`, story 030 added "Materia").
- Inline SVG or CSS bars are enough; animate width/height with a CSS transition.

---

## Out of Scope

- Per-match history over time, new result data on the server, printing.

---

## Files

- `src/server/profesor.html`
- `production/qa/evidence/story-038-live-result-charts/`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory), but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**:
- UI: a retained screenshot of each screen touched, in `production/qa/evidence/story-038-live-result-charts/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-036-teacher-tabs.md`
- Unlocks: None
