# Story 026: Teacher page layout and class status

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: UI
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-20

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 38`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the teacher's request: tidy up and improve the teacher page. Used on a normal PC screen: what matters is at the top, the rest scrolls.*

- [ ] The session panel is split into collapsible sections (Preguntas, Mapa y partida) with one open by default and the CSV help text folded away; whether each section is open is remembered in the browser (never required: the page works without storage).
- [ ] A bar fixed at the top shows the state of the class: students connected and disconnected, rooms waiting, running and paused, the chosen mode and map, the address the students type, and the buttons "Iniciar todas", "Terminar todas", "Repartir automáticamente" and "Añadir sala".
- [ ] A notice inside the page (no browser dialog) appears when a student disconnects or comes back, and goes away by itself after a few seconds.
- [ ] The layout on a 1366 × 768 screen: the session on the left, the rooms top right, the students and the results below, with no horizontal scroll; "Alumnos" and "Resultados" are reachable without scrolling past the session settings.
- [ ] All text is in Spanish; the page keeps working on a narrower window without overlapping elements.
- [ ] No protocol change and no server logic change; the server still limits the page to the teacher's own PC; `npx tsc --noEmit` has 0 errors and `npm run smoke` passes; the page loads with no console errors and a teacher can still set the session, add and start rooms and export the CSV.
- [ ] Retained screenshots: the whole page at 1366 × 768, the sections folded and open, the status bar, the disconnect notice, and a narrower window.

---

## Implementation Notes

- Everything is in `src/server/profesor.html` (styles, the session panel ~l.94-122, the students panel, the results panel, `render()`); the header and the action buttons ("all-start", "all-end", "split", "add") move into the status bar, keeping their ids so the handlers stay.
- The address the students type is the one `npm run aula` prints; use what the page already knows (the page's own origin on the server's address) and do not send anything new.
- Remember folded sections with `localStorage` inside try/catch.
- The notice compares the students list between two `tstate` messages (connected flag), nothing is added on the wire.

---

## Out of Scope

- Moving students from the room cards, naming rooms and the results filters (story 027), a tablet or phone layout, a new protocol, and any change to the game.

---

## Files

- src/server/profesor.html (collapsible session sections, the fixed class status bar with the room buttons, the connect and disconnect notices, the layout for a laptop screen)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: UI
**Required evidence**: retained screenshots of the teacher page in `production/qa/evidence/story-026-teacher-page-layout/`.

**Status**: [ ] Screenshots retained

---

## Dependencies

- Depends on: None
- Unlocks: `production/epics/solve-or-boom/story-027-teacher-students-rooms-results.md`

## Completion Notes
**Completed**: 2026-11-20
**Criteria**: 7/7 passing
**Deviations**: None. Outside the story: in the test a student who left the page and entered again from the same browser came back as a new student ("Beto (2)") instead of taking their seat back; behaviour from before this story, not investigated.
**Test Evidence**: production/qa/evidence/story-026-teacher-page-layout/ (6 screenshots, stamp unchanged); the "ha vuelto" notice was triggered by marking the student away in the page's memory
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke

## Calls beyond the design
- On the teacher's PC the page is on localhost and cannot know the network address: the bar says the students type the address the program prints at start; the real address waits for story 027, which changes the protocol (`src/server/profesor.html` `renderBar`) · kept 2026-11-20
- "Preguntas" open by default, "Mapa y partida" and the CSV help folded, each remembered under `profesor.sec.*`; notices at the bottom right, amber "X se ha desconectado." and green "X ha vuelto.", 5 s, at most 4 (`src/server/profesor.html`) · kept 2026-11-20
- The Alumnos panel moved under the rooms; the repeated "Tiempo de compra" line removed; a smaller title row; the bar shows the student and room counts and "Modo · Mapa" (`src/server/profesor.html`) · kept 2026-11-20
