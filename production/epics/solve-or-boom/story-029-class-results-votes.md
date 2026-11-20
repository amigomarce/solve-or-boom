# Story 029: Results countdown and room votes (class)

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: —

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 41`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request: at the end of a match a timer beside the results so the group decides to change mode, map or continue; if it runs out, the game restarts in the same mode and map. Decided with the person: each room votes; class and single player in two stories.*

- [ ] When a teacher room's match ends by itself (time, score or the waves lost), its students see a countdown beside their results, taken from the server's clock (their own clocks do not matter); its length is `rematch_vote_s` in `data/aula.json` (default 30) with a note. When the teacher ends the room with "Terminar" or removes it, there is no vote and no automatic restart: the room waits as it does today.
- [ ] Each student of the room can vote for the next mode and for the next map (the same choices and order as story 028's) and press "Continuar"; the screen shows the tally (e.g. "Bomba 2 · Free for All 1") and the student's own vote. Only explicit votes count; "Continuar" is a ready mark, not a vote.
- [ ] The most voted mode and the most voted map win, each on its own; a tie or no votes keeps the mode and map just played. A mode whose seats for students are fewer than the room's students cannot be voted (Oleadas takes 4 students: it shows disabled, with the reason, in a room of 5 or more).
- [ ] When the countdown reaches 0, or every connected student pressed "Continuar", the room starts the next match by itself with the winning mode and map, the same students in their seats (teams as the mode asks, no team in Free for All and Oleadas) and the session's other options unchanged; for the students it is a new `begin` (match + 1), as when the teacher presses Iniciar today. A student who left or lost connection during the vote is not counted and not seated.
- [ ] The teacher page shows on each room's card its mode and map, and during the vote the countdown and the tally; a vote changes only that room, so rooms may have different modes and maps, and "Repartir automáticamente" goes back to the session's mode and map. The page has a switch "Reinicio automático" (on by default): off, a room whose match ends waits for Iniciar as it does today and nothing is voted.
- [ ] The server checks every vote: only a student seated in a room that is in its vote window, only known mode and map ids, only modes that fit the room; anything else is refused with the usual error and counts as a strike like any other bad message. A student who reloads during the vote comes back to the same screen with the same countdown and tally.
- [ ] If the wire changes, `PROTOCOL_VERSION` goes up to 20 and the teacher page's version is the served one (it already is); the class build is rebuilt; a bounded headless room run (a short `rematch_vote_s`, a room of bots with 2 students) shows: a restart on timeout in the same mode and map, a restart by vote into a different mode and map, a restart when everybody pressed Continuar, no restart after "Terminar" and none with the switch off, and no server error. The game is unchanged: the four mode replays stay identical, `npm run typecheck` has 0 errors, `npm run smoke` passes.
- [ ] All text is in Spanish. Retained screenshots: a student's results with the countdown and the tally in Bomba and in Oleadas (the disabled mode), the teacher's room card during the vote and after the restart with another mode, the switch off, and the page after a restart.

---

## Implementation Notes

- Rooms: a teacher room (`managed`) already goes back to `waiting` with the same students when its match ends (`reopen` in `src/server/rooms.ts`) and its next start is a new `begin`. The vote window is a state between the end and that reopening; the restart is the teacher's `start` done by the server, with the room's match rebuilt by `rebuildMatch` (`src/server/room.ts`) when the mode or map changes.
- Seats: `takeSeat` and `lobby.move` already know the seats of each mode (`MODE_INFO` traits: `teams`, `coop`); reuse them to check that a mode fits the room and to seat the students after a rebuild.
- Wire: a student message for the vote and the ready mark, and the countdown and the tally on the results the students already get (or the room view); new keys go in the validators in `src/net/protocol.ts` (`parseClientMessage`), with the protocol history comment for version 20. The teacher's `tstate` rooms carry the vote state, `tinfo` or the session the switch; `src/server/profesor.html` takes the traits from `info.modes` (`modeOf`).
- Draw the student's choices with story 028's functions (`src/session-screen.ts`); in class mode the results scene in `src/main.ts` today waits for the next `begin` or the student's Enter: it keeps doing that, with the countdown on top.
- The tally is a pure function (votes in, winners out): easy to test, and the place to keep the tie rule in one spot.
- Decisions taken with the person: votes per room; the countdown is for teacher rooms only; the teacher's switch is an addition to keep the teacher in control.

---

## Out of Scope

- The single-player countdown (story 028).
- Votes on the subject, contents, level, buy time or any other option; the teacher still sets those for the whole session.
- Changing a room's size or moving students between rooms because of a vote.

---

## Files

- `src/net/protocol.ts`
- `src/net/client.ts`
- `src/server/room.ts`
- `src/server/rooms.ts`
- `src/server/lobby.ts`
- `src/server/net.ts`
- `src/server/teacher.ts`
- `src/server/profesor.html`
- `src/session-screen.ts`
- `src/main.ts`
- `data/aula.json`
- `data/config-notes.md`
- `tests/unit/votes.test.ts` (planned for the pure tally, although tests are waived at this tier)
- `production/qa/evidence/story-029-class-results-votes/`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory, never "must exist and pass").*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/` OR a playtest note; here the bounded headless room run and the screenshots in `production/qa/evidence/story-029-class-results-votes/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-028-results-countdown.md`
- Unlocks: None
