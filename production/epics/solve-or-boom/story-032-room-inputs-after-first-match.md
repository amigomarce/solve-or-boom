# Story 032: A student's inputs after a room's first match

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: —

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 44`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*A repair. Found in story 030's bounded class run: from the second match of the same teacher room, the student's buy menu opens on screen but no question card appears and no answer is recorded (`production/qa/evidence/story-030-rotating-subjects-class/08-alumno-tras-responder-en-ciencias.png`). The same happens with the vote restart (story 029), with "Terminar" then "Iniciar", and on the code before story 029 (`dac5da0`). Only a room's first match records anything.*

- [ ] In a teacher room, the 2nd and the 3rd match accept the student's inputs: they move, shoot, open the buy menu, pick an item and answer the card; whether the match starts by the vote restart, by "Terminar" then "Iniciar", or by "Iniciar todas".
- [ ] Buying in the 2nd and the 3rd match opens the question card, and the answer (right or wrong) is in the teacher's results and in the exported CSV, with rows of all three matches.
- [ ] It holds in each of the four modes (Bomba, Free for All, Duelo por equipos, Oleadas cooperativas): a second match in each, with short matches.
- [ ] The cause is stated in the Completion Notes, and the fix is where a room starts its next match, not a workaround in the student's page.
- [ ] A student who reconnects in the middle of the 2nd or the 3rd match still plays as today (their inputs are accepted).
- [ ] Several rooms at once, with students and bots: one room's new match does not touch another room's inputs.
- [ ] The game's rules are untouched: the four mode replays stay identical, `npm run typecheck` has 0 errors, `npm run smoke` passes. No protocol change (if one proves needed, `PROTOCOL_VERSION` goes up to 22 and the story says so).
- [ ] Retained screenshots: the question card open after buying in the 2nd match and in the 3rd, and the exported results with rows of the three matches.

---

## Implementation Notes

- **Hypothesis, to confirm first** (read from the code, not run): the student's page starts counting input seqs from 0 in every match (`src/net/mirror.ts`, `seq: 0` at the mirror's creation), while the server drops any input whose seq is not above the seat's `lastSeq` (`queueInput` in `src/server/room.ts`), and only `setPresent(room, index, true)` resets `lastSeq` and `ack` to -1. A room's next match would then keep the seat's old count and ignore every input of the new one: movement and shooting as well as buying.
- Find where a room starts its next match (`src/server/teacher.ts` start and the vote restart `onVoteDone`; `src/server/rooms.ts`; `src/server/room.ts`) and check how `room.inputs` is kept or rebuilt there.
- Reproduce with a bounded run first (short matches; `ffa_duration` and `rematch_vote_s` as in story 030, restored afterwards), two students, and look at what the second match's inputs do (movement included).
- The fix is general (the seat's input state starts clean with each match), not a special case for the buy menu.
- A unit test of `queueInput` across two matches is welcome but not required (tests are waived at `qa.level: minimal`).

---

## Out of Scope

- The results countdown and the votes, the rotation of subjects, and single player (they share nothing with this path).

---

## Files

- `src/server/room.ts`
- `src/server/teacher.ts`
- `src/server/rooms.ts`
- `production/qa/evidence/story-032-room-inputs-after-first-match/`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory, never "must exist and pass").*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/` OR a playtest note; here the bounded headless room run and the screenshots in `production/qa/evidence/story-032-room-inputs-after-first-match/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-029-class-results-votes.md`
- Unlocks: None
