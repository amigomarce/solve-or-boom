# Story 031: Change subject from the pause menu (single player)

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
**Requirement**: `Brief MVP feature 43`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request, raised when story 028 closed: in single player the subject can be changed from the pause menu, with a "Cambiar asignatura" option (it has to run the empty-CSV checks). Proposed here: it applies to the next match.*

- [ ] The single-player pause menu has a "Cambiar asignatura" button (the class pause menu is unchanged); it opens a chooser with the four subjects and, only when a CSV is loaded, "Mis preguntas (CSV)"; the current subject is lit, and a back button returns to the pause menu without changing anything.
- [ ] Choosing a subject applies from the next match: the match in progress keeps its questions (they are already dealt); the pause menu then reads "Asignatura: X · Próxima partida: Y" (just "Asignatura: X" when they are the same).
- [ ] The next match, however it starts (Continuar on the results screen, the results countdown reaching 0, or "Empezar partida" on the session screen), uses the subject chosen: the session's `subject` is the one the next match is built from, and the session screen shows it selected.
- [ ] The contents of the chosen subject are the ones already selected for it in the session (all of them by default, as on the session screen); a subject with no contents selected is refused with a Spanish message in the chooser.
- [ ] "Continuar" on the results screen and the restart at 0 of story 028 run the same checks as "Empezar partida" (an empty or missing CSV, or a subject with no questions): when one fails, the match does not start, the player goes to the session screen and a Spanish message says why. (Story 028 skipped them because the subject could not change; with this story it can.)
- [ ] It works in all four modes, with the keyboard and the mouse, and on a phone (touch buttons, no keyboard hints); the chooser fits the same screen sizes as the pause menu.
- [ ] All text is in Spanish. The game's rules are untouched: the four mode replays stay identical, `npm run typecheck` has 0 errors and `npm run smoke` passes.
- [ ] Retained screenshots: the pause menu with the new button, the chooser, the pause menu after choosing (Asignatura / Próxima partida), the next match started from the results countdown with the new subject, and the refused start (a CSV subject with no CSV loaded, or a failed check) with its message.

---

## Implementation Notes

- The pause scene is `scenes.pause` in `src/main.ts` (buttons `resume`, `controls`, `quit`; it draws `Asignatura: ${state.subjectLabel}`). The session is `session.subject`, `session.topics[subject]`, `session.custom` and `customName` (`src/main.ts`); `SUBJECT_LIST` and the session screen's own checks at Start (empty CSV: "Primero sube un CSV o elige una asignatura", no questions) are the ones to reuse.
- `startMatch()` builds the next match from `session` (`src/main.ts`), as story 028's Continuar and countdown do; today they call it directly. Put the Start checks in one function the session screen, Continuar and the countdown all call.
- The running match's deck is dealt at `createMatch` (`match.deck`), which is why the change applies to the next match; the pause text compares `state.subjectLabel` with the label the session would build.
- Decisions proposed with the story, to confirm: it applies to the next match (not at once), the chooser lists a CSV only when one is loaded, and the checks move to a shared function.

---

## Out of Scope

- Class mode (story 030 rotates subjects per room there; the class pause menu is unchanged).
- Changing the level, the contents or any other option from the pause menu, and changing the questions of a match in progress.

---

## Files

- `src/main.ts`
- `src/session-screen.ts`
- `production/qa/evidence/story-031-change-subject-pause/`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory), but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**:
- UI: a retained screenshot of each screen touched, in `production/qa/evidence/story-031-change-subject-pause/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-028-results-countdown.md`
- Unlocks: None
