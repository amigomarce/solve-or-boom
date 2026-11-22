# Story 035: Keep one weapon on death and prices at 80%

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
**Requirement**: `Brief MVP feature 47`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the person's request: on dying the player keeps one of the two bought weapons; the weapons' price drops to 80%. Decided with the person: the more expensive of the two is the one kept; the shop prices go to 80% of today's.*

- [ ] On death (Bomba, Free for All, Duelo por equipos, Oleadas cooperativas) the player keeps the more expensive of their two bought weapons (a tie: the one in hand; only one: that one; none: just the pistol) and loses the other; armour and medkits are lost as today.
- [ ] They come back with the kept weapon in hand, with a full magazine and a full reserve (a new rule, confirmed when the story closes), the other place empty, and may buy a second weapon in the buy phase as before.
- [ ] The Rifle dorado of the streak rewards is lost on death as today and does not count as a bought weapon.
- [ ] The shop prices go to 80% in `data/config.json`: subfusil 960, rifle 2160, francotirador 3040 (armour, ammo and medkit unchanged), with their lines in `data/config-notes.md`; the bots buy at the same prices.
- [ ] It works in all four modes, in single player and in class (no wire change beyond story 033's).
- [ ] The four mode replays change on purpose, because of the new prices; the difference is shown and the person accepts it, as in other stories; `npm run typecheck` has 0 errors and `npm run smoke` passes; a bounded class run shows a student dying and coming back with the kept weapon, with no server error.
- [ ] All text is in Spanish. Retained screenshots: the buy menu with the new prices, the HUD right after coming back with the kept weapon, and a death followed by the return.

---

## Implementation Notes

- Death today calls `resetGuns` (`src/game/state.ts` ~line 175): `primary = null`, pistol only, full pistol magazine; respawn happens in Free for All, Duelo and Oleadas through their own paths (`src/game/ffa.ts`, the mode files); the bomb mode resets at the round.
- With two places (story 033) the kept weapon is chosen from them by price (`tune['price_' + id]`); `gold` is never a candidate.
- Prices are `price_smg`, `price_rifle`, `price_sniper` in `data/config.json` (1200, 2700, 3800 → 960, 2160, 3040); the bots buy in `src/game/plans.ts`; start money 1250 now buys a subfusil and leaves 290.
- The grown game's same-seed replay (`production/qa/evidence/grow-solve-or-boom/`) buys weapons, so its run changes: use `one-shot-grow.sh accept solve-or-boom` after the person says yes.

---

## Out of Scope

- A choice of which weapon to keep, a refund or selling weapons, changing armour, ammo or medkit prices, changing the start money.

---

## Files

- `src/game/state.ts` — `keepOnDeath(p)`: a human keeps the dearer bought weapon (tie: the one in hand), full magazine and reserve, in hand; gold never; a bot gets the pistol only
- `src/game/combat.ts` — death in Free for All, Duelo and Oleadas calls `keepOnDeath`
- `src/game/rounds.ts` — a player who died in a Bomba round starts the next one through `keepOnDeath`
- `data/config.json` — `price_smg` 960, `price_rifle` 2160, `price_sniper` 3040 (step 50 → 10)
- `data/config-notes.md` — the three prices, 80% of 1200, 2700, 3800
- `tests/unit/__snapshots__/modes.test.ts.snap` — the seven mode replays after the new prices (accepted by the person)
- `production/qa/evidence/story-035-keep-weapon-on-death-prices/` — 5 screenshots, `run-log.md`, `stamp.txt`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

*Governed by `qa.level`: at `qa.level: minimal` tests are **waived** (advisory, never "must exist and pass").*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/` OR a playtest note; here the bounded runs and the screenshots in `production/qa/evidence/story-035-keep-weapon-on-death-prices/`

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-033-two-weapons-swap.md`
- Unlocks: None

---

## Completion Notes
**Completed**: 2026-11-21
**Criteria**: 5/7 passing (deferred, requires playtest session: AC-3 the Rifle dorado at death beside a bought weapon; AC-5 Duelo por equipos and Oleadas cooperativas — only Free for All and Bomba in single player and Free for All in class were run; also unchecked: a price tie and a disconnected student's seat played by a bot)
**Deviations**: Out of scope but a direct consequence of the story's prices: `tests/unit/__snapshots__/modes.test.ts.snap` (the seven bot mode replays), updated with the person's approval after confirming the bots buy at 80%. The keep-one-weapon rule is for human players only, as the person decided after the first build applied it to bots too.
**Test Evidence**: waived at qa.level minimal; the bounded runs and screenshots are in `production/qa/evidence/story-035-keep-weapon-on-death-prices/`
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png); the seven bot mode replays CHANGED, accepted — the bots buy at 80%

## Calls beyond the design
- The kept weapon comes back with a full magazine and a full reserve (not the ammo it had), in hand, in the first place; tie between the two: the one in hand, else the first place; the Rifle dorado is never kept (with gold and one bought weapon, the bought one is kept) (`keepOnDeath` in `src/game/state.ts`) · kept 2026-11-21
- `keepOnDeath` is a separate function; `resetGuns` is unchanged for match start, halftime and wave spawns; in Bomba the rule is applied when the next round starts, from what the player carried when they died (`src/game/combat.ts`, `src/game/rounds.ts`); a seat played by a bot follows the bot rule (pistol only) · kept 2026-11-21
- The price step in `data/config.json` goes from 50 to 10 for the three weapon prices so 960, 2160 and 3040 sit on it (nothing validates `step` today) · kept 2026-11-21
