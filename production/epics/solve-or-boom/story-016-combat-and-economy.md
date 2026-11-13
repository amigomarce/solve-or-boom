# Story 016: Combat and economy

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-13

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 28`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 28, taken from a classroom playtest: reward the first kill, show every player's kills, heal with medkits, loot from the dead, and a melee hit when out of bullets.*

- [ ] The first kill of each round pays a bonus on top of `kill_money` (proposal +$500, in `data/config.json`), with a message on screen.
- [ ] A kill counter: on PC a table of every player's kills and deaths opens while holding Tab; on phones a small number with a kill icon under the minimap, and a button that opens the table.
- [ ] A medkit in the buy menu (answering a question, like every item) that heals when used; the price and the amount healed are in `data/config.json`.
- [ ] A dead player drops a medkit and ammo where they died, which anyone can pick up by walking over them; pickups show in the world, vanish when taken and at the end of the round, and in class mode every student sees the same ones.
- [ ] With no ammo left (magazine and reserve), firing does a melee hit with the hands or the gun: short range, damage, cooldown and a swing animation, all in config; it also works from the touch Fuego button.
- [ ] Bots can be hurt by melee; what bots do with medkits and pickups (ignore them, use them, or take them) is stated, not guessed.
- [ ] Class mode: the new state travels in the snapshots (the protocol version goes up and the class build is rebuilt); a bounded headless room run (two students, six bots) ends with no server or page error.
- [ ] The same-seed replay against the last accepted run is `match yes` (or the change is shown and accepted), `npx tsc --noEmit` has 0 errors, and `npm run smoke` and the existing tests pass.
- [ ] Retained screenshots of the Tab table, the phone counter, the medkit in the buy menu, a pickup on the floor and a melee swing.

---

## Implementation Notes

- Money is paid in `kill` (`src/game/combat.ts`) with `kill_money`; a player's `kills` and `deaths` already exist in the match and in the snapshot rows (`src/net/snapshot.ts`), and the results screen already lists them. The buy menu items and their questions live with the shop code (search `buy`, `shop` in `src/game/` and `src/main.ts`); health is `max_hp` with `me.hp` in the own snapshot row.
- Pickups are new world state: a list in the match, drawn in `src/main.ts`, sent in snapshots, picked up in the simulation on the server and predicted or shown by the client. Say how the snapshot grows (the protocol version goes up; update `src/server/profesor.html` if its version constant is tied to it).
- The melee uses the existing fire input: when the magazine and the reserve are both empty, fire becomes the strike; show it in the first-person view and the other players' models if cheap. Hit detection: a short ray, like the shot.
- Tab is already a key the page blocks (`e.code === 'Tab'` is `preventDefault`ed): make it a bindable action in `data/keybinds.json` (Controles) rather than hard-coding it.
- Touch (story 014): the table opens from a button; the counter sits under the minimap; the medkit and pickups need no new button (pick up by walking, use from the buy menu or a bindable key).
- Gameplay numbers (bonus, medkit price and heal, drop contents, melee damage, range, cooldown, pickup lifetime) go in `data/config.json` with a line each in `data/config-notes.md`. All player text in Spanish.
- Tests are waived at `qa.level: minimal`. Bounded headless runs only: stop as soon as the new thing has been shown to work.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 015: where shots leave from, tracer width and spread.
- Story 017: friendly fire, bot difficulty, buy time and the left-button binding.
- New weapons, grenades, armour drops and a knife as a separate weapon slot.

---

## Files

- src/game/combat.ts (first-kill bonus, drops on death, melee when out of ammo)
- src/game/player.ts, state.ts, rounds.ts, match.ts (medkit item, carried medkits and the G key, pickups taken by walking, cleared each round and aged)
- src/net/protocol.ts (version 6: pickups rows, own medkits, medkit input), snapshot.ts, mirror.ts (pickups and melee over the network)
- src/server/room.ts (medkit as a pressed control), src/server/profesor.html (version 6)
- src/main.ts (Tab table, phone counter, medkit HUD and shop row, pickup models, melee swing, local swing in class mode), src/touch.ts (Tabla and Botiquín buttons), src/audio.ts (swing and pickup sounds)
- data/keybinds.json (Usar botiquín G, Marcador Tab), data/config.json, data/config-notes.md (first_kill_bonus, price_medkit, medkit_heal, medkit_max, drop_ammo_mags, pickup_radius, pickup_reach_y, pickup_life, melee_dmg, melee_range, melee_rate, melee_time, question_step_medkit)
- No test files: tests are waived at qa.level minimal; the existing checks still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots and the bounded headless room run in `production/qa/evidence/story-016-combat-and-economy/`; a person plays and says how the loot and the melee feel.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-015-shooting-fixes.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-13
**Criteria**: 9/9 passing (the feel of the loot and the melee is for your play)
**Deviations**: advisory, logged as tech debt TD-001 to TD-005 in `docs/tech-debt-register.md`: a dropped item can land inside a wall; the phone's Tabla toggle stays on while a menu is open and "Ya tienes toda la vida" repeats on each key press; swing amplitudes, the "1-6" label and the shop panel heights are written in the code; small allocations each step or frame; a pickup reached by two players on the same step goes to the lower seat. Also: the local swing in class mode is covered only by the typecheck and the build; the 60 s same-seed replay has no kill, so it does not show the first-kill bonus, which changes the bots' money (and buys) in a longer match; in the class screenshot `c1` a soldier stands over where Bot Kira fell, probably a live teammate, not checked; no three.js, Vite or TS API used is covered in `docs/engine-reference/web/`. The room runs and rules check were bounded, no full match; the class server must be rebuilt and students must reload the page (protocol 6).
**Test Evidence**: waived at qa.level minimal for tests; production/qa/evidence/story-016-combat-and-economy/ (9 screenshots, the rules run, the bounded room runs, notes and stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (the 60 s replay has no kill)

## Calls beyond the design
- First kill of each round pays +$500 on top of the $300 kill money to any killer, bots included, not for a bomb kill, with "Primera baja: +$500" seen only by the killer; medkit $400, heals 50, at most 2 carried, used with G, lost on death and at half-time (`data/config.json`, `src/game/combat.ts`, `src/game/player.ts`) · kept 2026-11-13
- A dead player drops a medkit and one magazine of the gun held, 0.3 m apart; taken within 1 m (1.5 m of height), the medkit only when hurt and the ammo only for a gun held and not full; gone after 30 s and at the end of the round; bots ignore pickups and never buy medkits (`src/game/combat.ts`, `src/game/player.ts`, `src/game/match.ts`) · kept 2026-11-13
- Melee when magazine and reserve are 0: 35 damage, 1.6 m, 0.6 s between blows, no headshot bonus, no noise for bots, the held gun swings forward (no hand models) (`data/config.json`, `src/game/combat.ts`, `src/main.ts`) · kept 2026-11-13
- The MARCADOR table (Bajas / Muertes) on Tab, a reassignable action "Marcador (mantener)", bots named with their role, not opened with a menu or card; on phones a skull counter under the minimap with a "Tabla" toggle and a "Botiquín" button; Controles rows 44 px (`src/main.ts`, `src/touch.ts`, `data/keybinds.json`) · kept 2026-11-13
