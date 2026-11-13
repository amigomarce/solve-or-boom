# Story 017: Match options

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-13

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 29`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 29, taken from a classroom playtest: a longer time to answer at the start, Disparar on the left button, a friendly-fire option, and bot levels in single player.*

- [ ] The buy phase length can be set on the teacher screen (for all rooms) and on the single-player session screen; the default goes from 25 s to a longer one (proposal 35 s) and the range is in `data/config.json`.
- [ ] "Disparar" can be bound to the left mouse button in Controles (today the click that picks a row is left out of the choices), with the existing clash rule for keys; the default stays as it is, and the story reports whether left click also fires when "Disparar" is bound elsewhere.
- [ ] A friendly-fire option, off by default, on the teacher screen and on the single-player session screen: on, shots hurt teammates (and a teammate's death gives no kill bonus or money); off, the game is as today.
- [ ] Bot difficulty in single player on the session screen (three levels: Fácil, Normal, Difícil), using the existing `bot_react_*` and `bot_acc_*` ramps; Normal is today's game.
- [ ] The choices reach the class server and the rooms (the teacher's friendly fire and buy time), and a bounded headless room run with friendly fire on ends with no server error. If the session message changes, the protocol version goes up and the class build is rebuilt.
- [ ] On phones the new options work by touch.
- [ ] The same-seed replay with the defaults is `match yes`, `npx tsc --noEmit` has 0 errors, and `npm run smoke` and the existing tests pass.
- [ ] Retained screenshots of the session screen and the teacher screen with the new options, and of Controles with Disparar on the left button.

---

## Implementation Notes

- The buy phase is `match.phaseT = tune.buy_time` in `src/game/rounds.ts`; the session options (subject, level, topics, map) travel as `session` from the teacher page (`src/server/profesor.html`, `tsession`) to the rooms (`src/server/rooms.ts`, `settings.ts`) and into `createMatch`: add the new options there.
- Left button: `inp.fire = down.has('Mouse0') || held('shoot')` in `src/main.ts`, and the Controles capture ignores `Mouse0` because it is the click that picked the row (`src/main.ts`, search `ctl.capture`): make the capture wait for the next input after the row is picked, or take the click after a short delay, and keep the clash rule in `src/keys.ts`.
- Friendly fire: `shoot` and the bot shots skip anyone on the same squad (`e.squad === p.squad`, `src/game/combat.ts`); with the option on they do not. Decide, and report, whether the bomb blast and a shot that kills a teammate cost the shooter (a penalty is not required).
- Bot difficulty: the ramps are `bot_react_start/end` and `bot_acc_start/end` in `data/config.json`; levels are multipliers on them, set in config. Bots in class mode keep Normal.
- All player text in Spanish. Tests are waived at `qa.level: minimal`; bounded headless runs only.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 015: the shooting fixes. Story 016: kills table, medkits, drops, melee and the first-kill bonus.
- Per-room options on the teacher screen (the options apply to every room), difficulty in class mode, and saving options between sessions.

---

## Files

- src/game/state.ts, match.ts (friendlyFire, buyTime, botLevel options, normalised and clamped; classroom plays Normal)
- src/game/rounds.ts (the buy phase from the options), src/game/combat.ts (friendly fire for players and bots, no reward for a teammate kill, kill feed wording), src/game/bots.ts (bot level multipliers)
- src/net/protocol.ts (version 7: teacher session, tstate, tinfo and begin carry the options; kill events may carry ff), src/net/mirror.ts (options from begin, feed wording)
- src/server/teacher.ts (session options checked and copied into each room's match), src/server/net.ts (begin), src/server/profesor.html (Partida block: Tiempo de compra, Fuego amigo; V = 7)
- src/main.ts (session screen options row, Usar el clic izquierdo in Controles, CSV warning position)
- data/config.json, data/config-notes.md (buy_time 35 with range 10-60 step 5, bot level multipliers), data/keybinds.json (Clic izquierdo name)
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots of each screen touched and the bounded headless room run in `production/qa/evidence/story-017-match-options/`; a person plays with friendly fire and each bot level.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-015-shooting-fixes.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-13
**Criteria**: 8/8 passing (friendly fire and each bot level are for your play)
**Deviations**: advisory. The kill feed's wording was already wrong in both modes and was corrected here ("Tú eliminaste a X", "X te eliminó"). Most screenshots predate two late fixes (the CSV warning's position and the feed wording). Left click fires always, so "Usar el clic izquierdo" only changes what Controles shows. Logged as tech debt TD-006 and TD-007 in `docs/tech-debt-register.md`: three bot friendly-fire numbers written in the code and a bot's missed shot never hitting a teammate; the student's page accepting any positive buy time from the server. Also: the help line still says "Clic disparar" (true because left click always fires); `match.opts` gains three enumerable fields; no three.js, Vite or TS API in the diff is covered in `docs/engine-reference/web/`. The room runs and rules check were bounded, no full match; the class server must be rebuilt and students must reload the page (protocol 7).
**Test Evidence**: waived at qa.level minimal for tests; production/qa/evidence/story-017-match-options/ (12 screenshots, the rules run, two bounded room runs, notes and stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: CHANGED, accepted — the buy phase starts at 35 s instead of 25 (at 60 s the clock shows 2:06 instead of 1:56); with buyTime 25 the hashes are the old ones

## Calls beyond the design
- Buy phase 35 s by default (range 10-60, step 5); bot levels Fácil x1.6 reaction time and x0.6 accuracy, Normal x1, Difícil x0.65 and x1.4; classroom matches always play Normal (`data/config.json`, `src/game/state.ts`, `src/game/bots.ts`, `src/game/combat.ts`) · kept 2026-11-13
- Friendly fire off by default; on, no penalty for the shooter, no money, kill or first-kill bonus for a teammate kill, feed "(fuego amigo)", a hit bot does not react to a teammate, the bomb blast unchanged, and a bot's shot that would hit its target hits a teammate in its line (`src/game/combat.ts`) · kept 2026-11-13
- Left click always fires; "Usar el clic izquierdo" appears only while binding Disparar and the default stays F (`src/main.ts`, `data/keybinds.json`) · kept 2026-11-13
- Session screen options row (Tiempo de compra − / value / +, Fuego amigo: Sí/No, Bots Fácil / Normal / Difícil), kept between matches and not between sessions; the teacher page's "Partida" block with the first two; kill feed wording corrected; protocol 7 (`src/main.ts`, `src/server/profesor.html`, `src/server/teacher.ts`, `src/net/protocol.ts`) · kept 2026-11-13
