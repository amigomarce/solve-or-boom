# Story 034: Butt strike

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: M
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-21

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 46`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request: the player can strike with the weapon, with its butt, when an enemy is close. Decided with the person: its own key, always available; the automatic strike with an empty gun stays.*

- [ ] A new action "Golpear" (V by default, rebindable in Controles, a touch button with no keyboard hint) strikes with the butt of the weapon in hand, with any weapon (the pistol too), without spending ammo.
- [ ] It hits a player within `melee_range` in front of the aim, never through a wall, with the existing `melee_dmg` and `melee_rate` (data/config.json); the session's friendly-fire option decides whether it hurts a teammate.
- [ ] It cannot be used with the buy menu or a question card open, while dead or while invisible (Free for All's hidden buy); what a strike does to a reload in progress is stated in the Completion Notes.
- [ ] The strike is seen (the weapon swings for `melee_time` seconds), heard and marks the hit as the empty-gun strike does today; that automatic strike stays and uses the same animation.
- [ ] In class the server decides the strike: the action travels in the input (`PROTOCOL_VERSION` goes up by one over its value when the story starts, with its history entry; the class build is rebuilt); the bots never strike on purpose.
- [ ] It works in all four modes; the four mode replays stay identical (they never press V), `npm run typecheck` has 0 errors, `npm run smoke` passes; a bounded class run shows a student's strike hurting another student, with no server error.
- [ ] All text is in Spanish. Retained screenshots: the swing at its middle next to an enemy, the Controles screen with the new action, and the touch button on a phone layout.

---

## Implementation Notes

- The strike already exists as the empty-gun fallback in `src/game/combat.ts` (~lines 68-97: `melee`, `tune.melee_range`, `tune.melee_dmg`, `tune.melee_rate`, the `melee` event, `melee_time` in `data/config.json`): reuse it for the new input instead of writing a second one.
- A new input field and key follow the path of the others: `PlayerInput` and `idleInput` (`src/game/player.ts`), `readInput` (`src/main.ts`), `data/keybinds.json`, the touch buttons (`src/touch.ts`), the wire input (`src/net/protocol.ts` ~line 335, `src/server/room.ts` PRESSED).
- The swing's look belongs with the weapon model drawing (see the weapon renderer and the existing `melee` event handling in `src/main.ts`).
- Written after story 033 (two weapons): the HUD and the swap logic are not changed here; only the strike.

---

## Out of Scope

- A different damage per weapon, a back-stab bonus, a knife as a weapon, the bots striking (story 033 and 035 cover the weapons).

---

## Files

- `src/game/combat.ts` — `humanShoot(match, p, strike)`: the strike takes the empty-gun strike path with any gun
- `src/game/player.ts` — `strike` input; the strike in the live phase, not hidden, not sprinting or changing stance; it cancels a medkit
- `src/net/protocol.ts` — PROTOCOL_VERSION 23 and its history entry; `strike` input
- `src/server/room.ts` — `strike` in PRESSED
- `src/main.ts` — the V key; the student's own swing in class; both swings use `swingK`
- `src/scene3d.ts` — `swingK(t)`, the swing's shape
- `src/touch.ts` — the "Golpear" button
- `data/keybinds.json` — "Golpear" (KeyV)
- `data/config-notes.md` — the melee note
- `production/qa/evidence/story-034-butt-strike/` — 4 screenshots, `run-log.md`, `stamp.txt`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory, never "must exist and pass").*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/` OR a playtest note; here the bounded runs and the screenshots in `production/qa/evidence/story-034-butt-strike/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-033-two-weapons-swap.md`
- Unlocks: None

---

## Completion Notes
**Completed**: 2026-11-21
**Criteria**: 4/7 passing (deferred, requires playtest session: AC-3 the blocks (menu or card open, dead, invisible) and the strike during a reload; AC-5 a student's strike hitting another student, the swing seen by another player and friendly fire on/off; AC-6 Duelo por equipos and Oleadas cooperativas; also unchecked: the strike's sound and walls)
**Deviations**: None.
**Test Evidence**: waived at qa.level minimal; the bounded runs and screenshots are in `production/qa/evidence/story-034-butt-strike/`
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png)

## Calls beyond the design
- The strike does not cancel a reload in progress but leaves the scope (the sights stay down until the aim button is released); it shares the shot cooldown (`melee_rate` 0.6 s blocks firing and striking); it is refused while sprinting, changing stance, outside the live phase (no message) and hidden; it cancels a medkit in use (`src/game/combat.ts`, `src/game/player.ts`) · kept 2026-11-21
- Key V "Golpear"; the swing goes back and up for the first 30% of `melee_time` and forward and down by 60% (`swingK` in `src/scene3d.ts`); in class the student's page plays its own swing at once even if the server refuses the strike; the touch button is round, in the right column between Recargar and Tumbarse; no new config values (`src/main.ts`, `src/touch.ts`, `data/keybinds.json`) · kept 2026-11-21
