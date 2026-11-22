# Story 038: Live result charts

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

- `src/server/profesor.html` — two bar charts on the Resultados tab (by topic, by student: right and wrong stacked, the numbers printed), built from the same filtered and sorted rows as the tables, kept as stable elements so each answer animates the bars in place
- `production/qa/evidence/story-038-live-result-charts/` — 3 screenshots, `stamp.txt`

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

---

## Completion Notes
**Completed**: 2026-11-22
**Criteria**: 5/6 passing (deferred, requires playtest session: AC-5 pressing "Exportar CSV" and "Borrar resultados" with the charts shown (their code is untouched); also unchecked: the bar animation on a live screen and the student list scrolling with about 40 students)
**Deviations**: None.
**Test Evidence**: `production/qa/evidence/story-038-live-result-charts/` (3 screenshots); tests waived at qa.level minimal
**Reviewed by**: self, no independent review

## Calls beyond the design
- Right answers in blue (`#4fb3d9`), wrong in amber with diagonal stripes (`#f2a33a`); each bar is labelled "3 ✓ · 2 ✗ · 60 %" on its right; its length follows the answer total against the largest in that chart, not a fixed 100% bar; bars 20 px high, text 14 px (`src/server/profesor.html`) · kept 2026-11-22
- Charts above the tables and side by side from 1100 px; long names clipped with the full name in the title; each list scrolls past 360 px; one shared legend; the chart block hidden with no answers; students with the same name in different rooms get separate bars; the width animation lasts 0.4 s and is off with reduced motion · kept 2026-11-22
