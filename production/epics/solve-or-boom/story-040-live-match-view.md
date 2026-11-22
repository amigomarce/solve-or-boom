# Story 040: Watch a match live

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
**Requirement**: `Brief MVP feature 52`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request (a dynamic teacher page): watch a room's match live from the teacher page.*

- [ ] Every running room card has "Ver en directo": it opens a panel with that room's map seen from above, every player a dot in their team colour with their name.
- [ ] The dots move live (several times a second; the rate in `data/aula.json`, with a note), with the bomb, the fallen marked, and the match time.
- [ ] The server sends positions only for the room being watched and only while the panel is open; with the panel closed nothing is sent.
- [ ] Several rooms at once and an 8-player match do not make the students' game worse.
- [ ] `PROTOCOL_VERSION` goes up by one over its value when the story starts, with its history entry; the class build is rebuilt.
- [ ] The game's rules are untouched: the four mode replays stay identical, `npm run typecheck` has 0 errors, `npm run smoke` passes; a bounded class run with the panel open shows no server error.
- [ ] All text is in Spanish. Retained screenshot: the live panel with a running room.

---

## Implementation Notes

- The teacher page today gets only room state as text (`tstate`, `src/server/teacher.ts`); it has no map data and no positions. A watch request (`twatch {room}` / stop) and a compact positions message for one room are new teacher messages in `src/net/protocol.ts`; the server sends them at the rate from `data/aula.json` (range-checked in `src/server/settings.ts`) while the teacher watches.
- The map's walkable cells and sites are in the game's map data (`src/game/map.ts`, `loadMap`); send the room's map outline once when watching starts.
- Draw on a `<canvas>` in `src/server/profesor.html`; no library from the internet.

---

## Out of Scope

- A first-person view of a student, replays, recording, controlling players from the teacher page.

---

## Files

- `src/net/protocol.ts`
- `src/server/teacher.ts`
- `src/server/room.ts`
- `src/server/settings.ts`
- `src/server/profesor.html`
- `data/aula.json`
- `data/config-notes.md`
- `production/qa/evidence/story-040-live-match-view/`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory, never "must exist and pass").*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/` OR a playtest note; here the bounded class run and the screenshot in `production/qa/evidence/story-040-live-match-view/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-036-teacher-tabs.md`
- Unlocks: None
