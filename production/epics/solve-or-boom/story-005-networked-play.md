# Story 005: Networked play

> **Epic**: Solve or Boom
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: [set by /dev-story when implementation begins]

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 18`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 18: each student sends their inputs and gets the match state back; each student answers their own buy and defuse questions, and the server checks the answers and keeps the money.*

- [ ] Each student's browser sends its inputs (move, look, shoot, reload, buy, use, stance) every step and draws the state the server sends back, in first person, seeing the other students and the bots.
- [ ] A client cannot change the rules: the server accepts only inputs and answers, never positions, money, health or results.
- [ ] Each student has their own question deck from the session's subject, level and topics; the question card is shown only to that student, and the server checks the answer and applies the wrong-answer lockout and retry rules from `design/gdd/question-bank.md`.
- [ ] The server keeps each student's money and the buy and defuse outcomes.
- [ ] Empty seats are played by bots with the same AI as single player.
- [ ] The round flow works in a room as in single player: buy phase, gates, plant and defuse, halftime swap, first to 4 round wins and the final score.
- [ ] Students in the same room see each other's shots, kills, sounds and the bomb.
- [ ] A student who disconnects does not stop the room; a bot takes the seat.
- [ ] Your own movement does not wait for the server: the view is predicted locally and corrected, and the game plays acceptably with about 100 ms of simulated delay.
- [ ] Two clients and the server played one full match without a page error or server error.

---

## Implementation Notes

- NOT SOURCEABLE — `docs/engine-reference/web/` does not cover WebSocket, binary message formats or networking code; the programmer verifies the APIs against the installed packages and says what was checked.
- This is the largest story in the epic. If it is too big for one sitting, split it at `/dev-story`: first inputs and state (movement, shooting), then the questions and the economy, and say so.
- A local build cannot show how the game feels under real network conditions: the "100 ms" check is simulated, and a person plays it on the real classroom network.
- Send compact snapshots of the visible state and only the events a client needs; keep the message format in one module both sides share.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 004: the join screen.
- Story 006: the teacher's controls.
- Story 007: results per student.
- Playing over the internet: not built (brief, Out of scope).

---

## Files

*Planned. `/dev-story` replaces this list with the files it changed.*

- `src/server/` (rooms, inputs, snapshots) and `src/net/` (client connection, shared message format)
- `src/main.ts`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. A person plays one full match with at least two devices and says what felt wrong.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-002-simulation-split.md`, `production/epics/solve-or-boom/story-003-classroom-server.md`, `production/epics/solve-or-boom/story-004-student-join.md`
- Unlocks: `production/epics/solve-or-boom/story-007-results-and-menu.md`
