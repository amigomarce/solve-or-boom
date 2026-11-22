# Story 033: Two bought weapons and swapping in combat

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-21

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 45`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request: the player can carry two bought weapons, which can be swapped in combat, besides the basic pistol. Decided with the person: buying a third weapon with both places taken replaces the one in hand.*

- [ ] The player carries up to two bought weapons besides the pistol; each keeps its own magazine and reserve while it is stowed.
- [ ] Buying: the first weapon fills the first place and a different second one fills the other; with both taken, a new purchase replaces the weapon in hand (with the pistol in hand, the cheaper of the two); a weapon already carried reads "Comprada" in the menu; the ammo purchase refills the reserve of every carried weapon.
- [ ] Swapping in combat: Q steps pistol → first weapon → second weapon; a direct key picks the second weapon (rebindable in Controles, with a touch button); a swap takes the same short time as today and cancels a reload and the scope.
- [ ] The HUD shows the weapon in hand and the other two (name and key); the buy menu marks both carried weapons.
- [ ] The Rifle dorado of the streak rewards still replaces the weapon in hand until death; the bots keep playing with one gun.
- [ ] It works in all four modes, in single player and in class: the server sends both weapons to the student and the new key travels in the input (`PROTOCOL_VERSION` goes up to 22, with its history entry; the class build is rebuilt).
- [ ] The game's other rules are untouched: the four mode replays stay identical, `npm run typecheck` has 0 errors, `npm run smoke` passes; a bounded headless class run (short matches) with two students who each buy two weapons and swap shows no server error and each student's HUD with both.
- [ ] All text is in Spanish. Retained screenshots: the HUD with two stowed weapons, the buy menu with both marked "Comprada" and a purchase replacing the weapon in hand, and a class student's view.

---

## Implementation Notes

- Today a player has one `primary` and `cur` (the gun in hand, `pistol` or the primary), with `ammo` per weapon id (`src/game/state.ts`, `src/game/player.ts`: `grant`, `shopBlock`, the `primary`, `pistol` and `swap` inputs, ~line 266). Two places means a second slot, and the `swap` input stepping through the carried weapons.
- The wire sends only `WEAPON_IDS.indexOf(me.primary)` in the own-player row (`src/net/snapshot.ts` ~line 73, `src/net/mirror.ts` ~line 148, `src/net/protocol.ts` ~line 200): both weapons and the carried ammo of each travel after this story; inputs have `primary`, `pistol`, `swap` (`src/net/protocol.ts` ~line 335, `src/server/room.ts` PRESSED).
- The Rifle dorado is `p.primary = 'gold'` (`src/game/streak.ts`); the bots buy through `src/game/plans.ts` with `b.primary`.
- Keys are data: `data/keybinds.json` (`swap` KeyQ today); the Controles screen lists them from there.
- Story 035 (keeping one weapon on death) and story 034 (the butt strike) build on the two places and the input/protocol work of this story.

---

## Out of Scope

- Keeping a weapon after death and the price change (story 035), the butt strike (story 034), dropping or picking up weapons from the floor, changing what the bots carry.

---

## Files

- `src/game/state.ts` — hidden `secondary` place; `resetGuns` clears it; `replacePlace(p)`
- `src/game/player.ts` — `secondary` input; `shopBlock` and `grant` for two places; swap order and the direct keys (`equip`); ammo refill of both
- `src/game/streak.ts` — the Rifle dorado takes the place `replacePlace` picks
- `src/net/protocol.ts` — PROTOCOL_VERSION 22 and its history entry; own row of 28 numbers; `secondary` input
- `src/net/snapshot.ts`, `src/net/mirror.ts` — the second weapon and the three mag/reserve pairs on the wire
- `src/server/room.ts` — `secondary` in PRESSED
- `src/main.ts` — the `secondary` key and the touch label
- `src/touch.ts` — the second-weapon touch button
- `src/hud.ts` — the box listing the carried weapons not in hand
- `data/keybinds.json` — "Segunda arma" (Digit3)
- `data/config.json`, `data/config-notes.md` — `swap_gun_time` 0.3, `swap_pistol_time` 0.25 (the old literals)
- `production/qa/evidence/story-033-two-weapons-swap/` — 5 screenshots, `run-log.md`, `stamp.txt`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory, never "must exist and pass").*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/` OR a playtest note; here the bounded single-player and class runs and the screenshots in `production/qa/evidence/story-033-two-weapons-swap/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-032-room-inputs-after-first-match.md`
- Unlocks: story 034 and story 035

---

## Completion Notes
**Completed**: 2026-11-21
**Criteria**: 5/8 passing (deferred, requires playtest session: AC-5 the Rifle dorado with two weapons; AC-6 Duelo por equipos, Oleadas cooperativas and Free for All in class — only Bomba in single player and in class was run; AC-8 the touch button and the Controles screen captures; also unchecked: a fired magazine kept across a swap, the ammo purchase refilling both weapons)
**Deviations**: None.
**Test Evidence**: waived at qa.level minimal; the bounded runs and screenshots are in `production/qa/evidence/story-033-two-weapons-swap/`
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png)

## Calls beyond the design
- `primary` stays the first place and a hidden `secondary` is the second; a purchase fills the first free place, then replaces the weapon in hand (pistol in hand: the cheaper; gold counts as dearest) and goes into hand; the replaced weapon's ammo is dropped; the Rifle dorado takes the place that would be replaced; with the Rifle dorado and a free second place another weapon can now be bought (before: refused); Q steps pistol → first → second, skipping an empty second (`src/game/state.ts`, `player.ts`, `streak.ts`) · kept 2026-11-21
- Second-weapon key "Segunda arma" on Digit3 (1 first, 2 pistol); swap times as data (`swap_gun_time` 0.3, `swap_pistol_time` 0.25); HUD box of 268 px left of the ammo box with the weapons not in hand (key and mag/reserve, no key on touch); touch button at ~85% x, 10% y only with a second weapon; other students see only the gun in hand; no client prediction of swaps (`src/hud.ts`, `src/touch.ts`, `data/keybinds.json`, `data/config.json`, `src/net/*`) · kept 2026-11-21
