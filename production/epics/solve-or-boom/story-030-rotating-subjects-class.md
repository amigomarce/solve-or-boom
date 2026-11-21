# Story 030: Rotating subjects per room (class)

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
**Requirement**: `Brief MVP feature 42`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request: the teacher assigns several subjects, CSV files included, that rotate from one match to the next; with a single subject chosen at the start, it never changes. Decided with the person: several CSV files; in the list's order, back to the first; each room advances on its own.*

- [ ] On the teacher page the subjects of the "Preguntas" section become checkboxes: the four built-in subjects and every loaded CSV; at least one must stay marked (the page and the server refuse none, in Spanish). With one marked the game is exactly as today: that subject in every match. Each subject keeps its own contents selection (the page already remembers it per subject) and the level is shared by all.
- [ ] The teacher can upload several CSV files: each one is an entry named after its file, shows its number of questions and skipped rows, can be marked for the rotation and can be removed; every file keeps today's limits (`csv_max_bytes`, `csv_max_questions`), the number of files is limited by `csv_max_files` in `data/aula.json` (default 5, with a note), and uploading a file with a name already loaded replaces that entry.
- [ ] Each room has its own counter: its first match of the session uses the first marked entry in the page's list order (Matemáticas, Ciencias, Geografía, Lengua, then the CSV files in the order they were loaded), and each new match of that room, whether it starts by the vote restart of story 029 or by the teacher's Iniciar, uses the next marked entry, back to the first after the last. Two rooms can be on different subjects at the same time.
- [ ] A match in progress never changes: marking or unmarking subjects applies to a room's next match. When the marked set changes, a room's next match takes the marked entry that follows the one it just played in the list's order, or the first marked one if that entry is no longer marked; a CSV that is removed leaves the rotation.
- [ ] The students see which subject is next: the vote strip on the results screen and the waiting screen say "Próxima asignatura: X" and the match's own subject still shows in the results as today; the teacher's room card shows the room's current subject and the next one.
- [ ] The results keep the subject of every answer: a row of the teacher's results and of the exported CSV says which subject it belongs to (a "Materia" column), so rows of different subjects in the same room do not mix; the weakest-topics view keeps working with several subjects.
- [ ] If the wire changes, `PROTOCOL_VERSION` goes up to 21 and the teacher page's version is the served one (it already is); the class build is rebuilt; a bounded headless room run (short matches) shows: a room rotating through three entries and back to the first, two rooms on different entries, a single marked subject unchanged, a CSV removed during the session leaving the rotation, no server error. The game is unchanged: the four mode replays stay identical, `npm run typecheck` has 0 errors, `npm run smoke` passes.
- [ ] All text is in Spanish. Retained screenshots: the teacher's list with several subjects and CSV files marked, a room card with its current and next subject, a student's vote strip or waiting screen with the next subject, and the exported results with two subjects.

---

## Implementation Notes

- Today the session is one subject: `session.subject`, `session.topics`, one `custom` CSV and `customName`, in `src/server/teacher.ts` (the session object, `tsession`, `tcsv`, `make()`), and `tsession` in `src/net/protocol.ts` carries one `subject` and its `topics`. The session applies to every room built or started after it is set (`DEFAULT_MATCH` and the rooms' `match` spec in `src/server/rooms.ts`).
- A room's match spec already carries `subject`, `topics`, `custom` and `customName`, so the rotation sets them per room just before each start (the teacher's `start` and the vote restart, `onVoteDone` in `src/server/teacher.ts`), from a per-room counter.
- The teacher page selects the subject in `src/server/profesor.html` (`subjects`, `topics`, `chosen`, the CSV block and `renderBar`); `info.subjects` comes from `tinfo`. The CSV upload goes through `loadQuestionFile` (`src/game/csv.ts`), as the teacher's `tcsv` does.
- Results: `src/server/results.ts` keys answers by room, topic and level; add the subject to the key and the CSV (`csv()`), and keep `view()`'s topic list working.
- The student's strip (`drawVoteStrip` in `src/session-screen.ts`) and the waiting screen carry the next subject through the vote message of story 029 or the room view.
- Decisions taken with the person: several CSV files, list order and loop, each room on its own; the rest (limit of 5 files, the "Materia" column, the wording) are the proposal shown when the story was made.

---

## Out of Scope

- Single player (story 031 changes the subject from the pause menu there).
- Voting on the subject (the vote of story 029 stays mode and map), a different level per subject, random order, a teacher button to jump to another subject, and per-student subjects.

---

## Files

- `src/net/protocol.ts` — PROTOCOL_VERSION 21 and its history entry; `tsession.subjects: {id, topics}[]`; teacher `tcsvdel {id}`; `tinfo.csvMaxFiles`; `tstate` session `marked`, `csvs`, `available` by entry; `TeacherRoom.current`/`next`; `RoomView.nextSubject`
- `src/server/teacher.ts` — marked entries and several CSV files in the session; per-room rotation (`last`, `lastLabel`, `pick`, `entry`, `syncNext`); `tsession`, `tcsv`, `tcsvdel`; starts, the vote restart, `followMode` and `make` use the room's pick
- `src/server/room.ts` — `Room.nextSubject`, `subjectLabel`, the subject passed to each answer
- `src/server/lobby.ts` — the room view sends `nextSubject`
- `src/server/results.ts` — the subject in each cell and a "Materia" column in the CSV
- `src/server/profesor.html` — subject checkboxes, one contents group per marked subject, the CSV list with "Quitar", the room card's current and next subject
- `src/server/aula.ts` — `csvMaxFiles` passed to the teacher (not in the planned list)
- `src/session-screen.ts` — "Próxima asignatura" on the vote strip and the waiting screen
- `src/main.ts` — `aula.room` carries `nextSubject`
- `data/aula.json` — `csv_max_files` (5, 1..20)
- `data/config-notes.md` — its note
- `production/qa/evidence/story-030-rotating-subjects-class/` — 8 screenshots, `resultados-exportados.csv`, `run-log.md`, `stamp.txt`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory, never "must exist and pass").*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/` OR a playtest note; here the bounded headless room run and the screenshots in `production/qa/evidence/story-030-rotating-subjects-class/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-029-class-results-votes.md`
- Unlocks: None

---

## Completion Notes
**Completed**: 2026-11-20
**Criteria**: 8/8 passing (none deferred)
**Deviations**: Advisory: the teacher page's results tables do not show the subject; only the exported CSV has the "Materia" column (accepted). Out of scope: `src/server/aula.ts` changed (one line, `csvMaxFiles`), listed under `## Files`.
**Test Evidence**: waived at qa.level minimal; the bounded class run and screenshots are in `production/qa/evidence/story-030-rotating-subjects-class/`
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png)

## Calls beyond the design
- A newly loaded CSV starts marked; the same file name replaces the entry keeping its id, position and mark; the only marked entry cannot be removed; a CSV ignores the level (`src/server/teacher.ts`: `tcsv`, `tcsvdel`) · kept 2026-11-20
- The next entry is the marked one after the room's last played entry in list order, the first marked when none or when that was a removed CSV; "Repartir" starts new rooms at the first marked; "Iniciar todas" gives each room its own pick (`teacher.ts`: `pick`, `make`, `start`) · kept 2026-11-20
- Wording: "Mis preguntas (archivo)" on the room card and "Preguntas propias (archivo)" elsewhere; "todavía ninguna · Próxima: X" before the first start; "Próxima asignatura: X" on the vote strip and the waiting screen (`profesor.html`, `session-screen.ts`) · kept 2026-11-20
- "Materia" is the third column of the exported CSV; the page's tables do not show it (`results.ts`, `profesor.html`) · kept 2026-11-20
