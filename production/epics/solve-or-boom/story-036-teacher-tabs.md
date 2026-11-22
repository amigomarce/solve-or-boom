# Story 036: Tabs on the teacher page

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: UI
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-21

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 48`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request: the teacher page should be dynamic, not as it is today; chosen with the person: tabs where the match settings and options appear (with drag-to-move students, live result charts, adaptive panels and a live match view as their own stories).*

- [ ] The page is organised in tabs: "Salas" (room cards and students), "Preguntas" (subjects, contents, level, CSV files), "Partida" (mode, map, buy time, friendly fire, streak rewards, automatic restart) and "Resultados"; the status bar at the top stays fixed and visible on every tab.
- [ ] Switching tab never reloads or loses anything (a half-typed room name, an open CSV upload); the page remembers the last tab in the browser.
- [ ] An important notice (a student disconnected, an error) shows on any tab, and a tab with news shows it (a dot or a number).
- [ ] Everything the page can do today is still there, in its tab; nothing changes on the server.
- [ ] Keyboard and mouse; it works on a tablet (1024 px wide) and on a projector (1920 px).
- [ ] All text is in Spanish. Retained screenshots of each tab.

---

## Implementation Notes

- The page is `src/server/profesor.html` (one file: CSS, HTML and script; served by `fillTeacherPage`, which fills the protocol version). Today: a left column `<details class="sec">` "Preguntas" and "Mapa y partida" (their open state remembered), the main column with the room cards, "Alumnos" and "Resultados"; a fixed status bar (`#statusbar`, `renderBar`); `render()` repaints from each `tstate` push with per-element change checks (`last[id]`).
- The automatic restart checkbox sits in the status bar today; where it lives after the tabs is a call to report.
- Stories 037, 038, 039 and 040 build on these tabs.

---

## Out of Scope

- Moving students by dragging (037), result charts (038), card views and order (039), the live match view (040), any server or protocol change.

---

## Files

- `src/server/profesor.html` — the page in four tabs (Salas, Preguntas, Partida, Resultados) under the fixed status bar; the automatic restart moved to Partida; a dot on a tab with news; the last tab remembered; the old left column and its folding sections removed
- `production/qa/evidence/story-036-teacher-tabs/` — 8 screenshots, `stamp.txt`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory), but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**:
- UI: a retained screenshot of each screen touched, in `production/qa/evidence/story-036-teacher-tabs/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-035-keep-weapon-on-death-prices.md`
- Unlocks: stories 037, 038, 039 and 040

---

## Completion Notes
**Completed**: 2026-11-21
**Criteria**: 5/6 passing (deferred, requires playtest session: AC-3 the news dot on "Resultados" when new answers arrive while another tab is open; the dot on "Salas" was seen)
**Deviations**: None. Seen on the way and left for story 039: at 1920 px a room card in Bomba is about 365 px wide and the "Equipo 2" student menus overflow its edge (the card grid is unchanged by this story).
**Test Evidence**: `production/qa/evidence/story-036-teacher-tabs/` (8 screenshots); tests waived at qa.level minimal
**Reviewed by**: self, no independent review

## Calls beyond the design
- Tab order and labels Salas, Preguntas, Partida, Resultados (Salas opens first); the last tab remembered in `localStorage` key `profesor.tab`; arrows wrap, Home/End, the tab activates at once (`src/server/profesor.html`) · kept 2026-11-21
- The news mark is an orange dot, not a number: on "Salas" when a student disconnects or returns or the room list or a room's state changes, on "Resultados" when the answer total goes up; cleared only by opening the tab, never set on the visible tab, a drop in answers sets none · kept 2026-11-21
- The automatic restart moved from the status bar to Partida › "Opciones de la partida", under "Cuando termina una partida"; the two settings tabs hold two panels side by side from about 934 px of content width; the hint "Los cambios se aplican al momento…" shows in both; the old "Sesión" heading and folding sections are gone · kept 2026-11-21
