# Story 003: Classroom server

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-11

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

- src/server/aula.ts, settings.ts, log.ts, room.ts, rooms.ts, net.ts (created)
- src/net/protocol.ts (created)
- src/game/map.ts, match.ts, rounds.ts, state.ts (map and gates per match)
- data/aula.json (created), data/config-notes.md
- package.json, package-lock.json (ws 8.22.2, @types/ws 8.18.2, @types/node 22.20.5; typecheck and aula scripts)
- tsconfig.json, tsconfig.server.json (created), vite.config.ts
- .gitignore (dist-server/)
- No test files: tests are waived at qa.level minimal; the existing 12 still pass

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

## Completion Notes
**Completed**: 2026-11-11
**Criteria**: 4/8 passing (4 deferred to your play: a second device opening the address, the server as authority, one room's error not stopping the others, the full 5-minute load check)
**Deviations**: advisory. Ctrl+C can wait up to 30 s for a frozen client (`ws` `closeTimeout`); `max_message_bytes` counts characters, not bytes; an HTTP error is logged twice; `uncaughtException` keeps the server running; Node, `ws` and Vite server builds are NOT SOURCEABLE from the reference docs (checked against the installed packages and a real build). Fixed here: `tsconfig.server.json` was skipping the server files.
**Test Evidence**: waived at qa.level minimal. production/qa/evidence/story-003-classroom-server/aula-run.txt
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png)

## Calls beyond the design
- Server settings in `data/aula.json`: port 3000 with fallback, AULA_PORT and --puerto, listening on every network address, 2 demo rooms of bots playing Matemáticas at Medio, a rebuild and repack of the server at every start, and `npm run build` type-checking the server (`data/aula.json`, `src/server/aula.ts`, `package.json`) · kept 2026-11-11
- Connection rules: messages `hello`, `input` and `ping`, 2048 characters, 120 messages per second with a burst of 60, 30 refused messages before closing, names up to 20 characters, 200 connections, a ping every 15 s, a loop step every 8 ms dropping more than 30 steps of lag (`src/net/protocol.ts`, `src/server/net.ts`, `data/aula.json`) · kept 2026-11-11
- Rooms: 8 seats with seats 0 to 3 as one team, a room closes after 30 s empty once it has had a student, a finished room restarts with a new seed, names in memory only and logs with room ids and counts only, seat 0 idle until story 005 (`src/server/room.ts`, `src/server/rooms.ts`) · kept 2026-11-11

## Known limits for the next stories
- Inputs from a connection that said hello are validated and held but not played, and `takeSeat` is not called by anything yet (story 005).
- The rules still have exactly one human player per match (`match.human`, `match.me`).
- The student join screen and the teacher page do not exist yet; the server serves only the single-file game build, and `startNet` takes a map of pages so story 006 can add the teacher page.
