# Story 003: Classroom server

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
**Requirement**: `Brief MVP feature 16`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 16: a program the teacher opens on their PC that serves the game on the school network and runs several 4 v 4 rooms at once, with the server as the authority.*

- [ ] `npm run aula` starts a Node server that needs no internet, serves the built game and accepts WebSocket connections, and prints in the terminal the address (the PC's local-network address and port) students type in their browser.
- [ ] A second device on the same network opens that address and loads the game.
- [ ] The server creates rooms of 4 v 4 (8 seats) and runs several rooms at the same time, each with its own match simulation (story 002) at the fixed step.
- [ ] The server is the authority: it owns each match; a client may only send inputs and answers, never positions, money or results.
- [ ] A room is cleaned up when it is ended or empty; an error inside one room is caught and logged and does not stop the other rooms.
- [ ] Load check: 4 rooms of bots only, running 5 minutes, end with no errors, and the terminal reports the average step time per room.
- [ ] Nothing leaves the school network: the server makes no outbound internet request and stores no personal data.
- [ ] Ctrl+C stops the server and says so.

---

## Implementation Notes

- Node 22.12 or later is required, as for the rest of the project. A WebSocket library is a new dependency: pin its exact version, and check its API against its installed type definitions.
- NOT SOURCEABLE — `docs/engine-reference/web/` does not cover Node servers, WebSocket or a networking library; the programmer verifies those APIs against the installed packages and says what was checked.
- Serve the single-file build (`dist-single/`) so students need nothing else.
- The teacher's screen (story 006) will be a page of this same server; leave room for it.
- Bind to the local-network interface; show every address the PC has when it has several.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 004: the student join screen.
- Story 005: playing the match over the connection.
- Story 006: the teacher screen.

---

## Files

*Planned. `/dev-story` replaces this list with the files it changed.*

- `src/server/aula.ts` and its modules (new)
- `package.json` (the `aula` script and the pinned library)

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. A person confirms the second-device check and the load-check output.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-002-simulation-split.md`
- Unlocks: `production/epics/solve-or-boom/story-004-student-join.md`, `production/epics/solve-or-boom/story-005-networked-play.md`, `production/epics/solve-or-boom/story-006-teacher-screen.md`
