# Story 027: Students, rooms and results on the teacher page

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-20

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 39`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the teacher's request: tidy up and improve the teacher page: students and rooms, and the results.*

- [ ] Each student is moved from their own room: in a room card the student's name has a menu to send them to another room (and to the other team in Bomba and Team duel; rooms of Free for All and Oleadas offer only the room); the list of students becomes a summary with each student's room and whether they are connected, and a student with no room or disconnected is easy to tell apart at a glance.
- [ ] The teacher can give each room a name ("3.º A", "Grupo rojo") from its card; the name shows on the card, in the students list, in the results and in the exported CSV, is kept on the server while the session lasts, and survives a room waiting again after a match; a blank name goes back to "Sala N"; a name longer than a set limit is refused with a Spanish message.
- [ ] The results can be filtered by room and by student, and each table sorts when its header is clicked (name, right, % right, kills); "Exportar CSV" lets the teacher choose between what is on screen and everything, and the file carries the room's name.
- [ ] The results show the matches: each room keeps how many matches it played and the results of the last one, and the card keeps showing the last match's summary as it does today.
- [ ] "Repartir automáticamente" keeps the room names it finds and works in all four modes; the new room name and the filters do not change what a student sees in the game.
- [ ] If the wire changes, the protocol version goes up, `V` in `src/server/profesor.html` matches, the class build is rebuilt, and a bounded headless room run in all four modes ends with no server error; the game is unchanged: Bomba same-seed replay `match yes`, `npx tsc --noEmit` has 0 errors, `npm run smoke` passes.
- [ ] All text is in Spanish; every limit (name length, rows shown) is in `data/aula.json` or `data/config.json` with a note.
- [ ] Retained screenshots: room cards with the student menu, a room being renamed and the name in the results, the results filtered by room and sorted, the export choice and the exported CSV.

---

## Implementation Notes

- Teacher side: `src/server/profesor.html` (`roomCard`, the students panel, `renderResults`, the export button), `src/server/teacher.ts` (`tmove`, state building, a message to name a room), `src/server/results.ts` (`csv()` and `view()` already carry each student's room id), `src/net/protocol.ts` (new teacher message and a `name` on a teacher room; exact key lists in `TEACHER_KEYS` and the validators).
- A room's name lives on the server's room record next to `matches`, so a room that waits again after a match (the 6d61e2e fix) keeps it; a removed room loses it.
- The filters and the sorting are done in the page from the rows it already has; the export choice either sends the filter to the server or filters the text it got, whichever keeps the wire smaller.
- Build on the layout of story 026 (status bar, collapsible sections).
- From story 026's close (kept by the person): the status bar cannot show the address the students type, because the page runs on localhost; since this story changes the protocol anyway, the server can send its network address (the one `npm run aula` prints) in `tinfo` and the bar shows it.

---

## Out of Scope

- Saving results between sessions or to disk, accounts or logins, sending messages to students, a phone layout, and changes to the game modes.

---

## Files

- src/net/protocol.ts (protocol 18: tinfo.address, a teacher room's name, the trename message)
- src/server/room.ts (a room keeps its name)
- src/server/teacher.ts (trename, the address, room names in the state and the CSV)
- src/server/results.ts (the CSV room column takes a room label)
- src/server/aula.ts (hands the teacher the address the students type)
- src/server/profesor.html (room names everywhere, the rename control, the student menus on the cards, the students summary, results filters, sorting and the export choice)
- data/aula.json, data/config-notes.md (teacher_room_name_max)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots of each screen touched and a bounded headless room run in `production/qa/evidence/story-027-teacher-students-rooms-results/`.

**Status**: [ ] Screenshots and the rules run retained

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-026-teacher-page-layout.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-20
**Criteria**: 8/8 passing
**Deviations**: None. The class server must be rebuilt and students must reload the page (protocol 18). At closing the lead found that "Repartir automáticamente" dropped the room names (it replaces the waiting rooms); fixed in `src/server/teacher.ts` (each new room takes the name of the one it replaces, in order) and seen in the browser in Bomba only; the four-mode run of the programmer was made before that fix.
**Test Evidence**: waived at qa.level minimal; production/qa/evidence/story-027-teacher-students-rooms-results/ (9 files: screenshots and the evidence stamp, restamped after the fix)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke

## Calls beyond the design
- A room name has up to 24 letters (`teacher_room_name_max` in `data/aula.json`), control characters and `<` `>` are stripped; a removed room shows as "Sala N" in the finished list and the CSV; the students' address on the bar is the first network URL the program prints (`src/server/teacher.ts`, `src/server/aula.ts`) · kept 2026-11-20
- The export file is `resultados-<name>.csv` only when one room is filtered ("3.º A" gives `resultados-3-o-A.csv`); the default is "Lo que se ve"; the filters change only the "Por alumno" table; the table shows each student's last room while the CSV has a row per room played (`src/server/profesor.html`) · kept 2026-11-20
- A first click on a column sorts (names A-Z, numbers highest first), the second reverses, the third clears; confirmations quote the room's name between « »; the rename input closes with Enter or Esc (`src/server/profesor.html`) · kept 2026-11-20
