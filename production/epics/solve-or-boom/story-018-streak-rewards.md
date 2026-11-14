# Story 018: Streak rewards

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-14

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 30`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Feature 30, requested by the person after the classroom playtests: right answers in a row during a match earn rewards.*

- [ ] An option "Premios por racha: Sí/No" is on the teacher screen (for every room) and on the single-player session screen, on by default; on phones it works by touch.
- [ ] A person's streak counts their right answers (buying and defusing); a wrong answer sets it to 0; dying does not break it. Bots earn nothing.
- [ ] 3 in a row: Escudo, +50 armour at once, with a message.
- [ ] 5 in a row: the ability Cazador is kept; its own key (H, rebindable in Controles) or touch button uses it: 10 s of enemies on the minimap and +30 % speed.
- [ ] 8 in a row: the secret weapon Rifle dorado, not sold in the shop: more damage and accuracy than the rifle, a gold look in the hand and on the model, kept until death; then the streak starts again.
- [ ] The HUD shows the streak, the next reward, and the kept Cazador with its key or button.
- [ ] The class server decides the rewards (protocol version goes up, the teacher page constant `V` matches, the class build is rebuilt); a bounded headless room run ends with no server error, and a made-up activation is refused.
- [ ] With the option off the same-seed replay is `match yes`, `npx tsc --noEmit` has 0 errors, and `npm run smoke` and the existing tests pass.
- [ ] Retained screenshots: the teacher screen and the session screen with the option, the HUD with a streak, Cazador active, the Rifle dorado in hand, and the phone layout.

---

## Implementation Notes

- Answers are counted in `answer` (`src/game/player.ts`, `p.right++`) and the defuse card; a wrong one resets `d.wrongStreak` there too: add the streak beside them. The streak and the kept Cazador are per person, like `medkits` and `healT` (hidden fields in `src/game/state.ts`, so the same-seed replay's serialised state is unchanged with the option off).
- Match options travel as in story 017 (`src/game/state.ts`, `match.ts`, `src/server/teacher.ts`, `profesor.html`, `src/net/protocol.ts`); the own row of the snapshot (`src/net/snapshot.ts`, `mirror.ts`) carries the streak and the Cazador time left, like `healT` in protocol 10.
- The Rifle dorado is a fifth gun: `WEAPON` and its `data/config.json` keys (damage, range, accuracy), a first-person model in `makeViewGun` (`src/main.ts`) and the character's held gun; it is never in `SHOP`.
- The minimap radar shows enemy dots only while Cazador is active; the speed bonus goes through the movement step the server judges.
- All player text in Spanish; every number in `data/config.json` with a line in `config-notes.md`. Tests are waived at `qa.level: minimal`; bounded headless runs only.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Per-room options on the teacher screen (the option applies to every room), saving options between sessions, and rewards for bots.
- Other abilities or secret weapons beyond Escudo, Cazador and Rifle dorado.

---

## Files

- src/game/streak.ts (new: the streak, the rewards, the Cazador)
- src/game/state.ts, match.ts, player.ts, combat.ts (option, hidden streak fields, Rifle dorado weapon, answers counted, Cazador speed)
- src/net/protocol.ts, snapshot.ts, mirror.ts (protocol 11: streakRewards option, ability input, own row streak/kept/hunterT)
- src/server/teacher.ts, net.ts, profesor.html (teacher option, begin, V = 11)
- src/main.ts, src/touch.ts, src/audio.ts (session option, HUD streak panel, radar, Cazador key and button, gold gun model and sound)
- data/config.json, data/config-notes.md, data/keybinds.json (streak_* hunter_* gold_* values, Usar habilidad H)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: tests are waived at `qa.level: minimal`. Retained screenshots of each screen touched and the bounded headless room run in `production/qa/evidence/story-018-streak-rewards/`; a person plays a streak to the Rifle dorado.

**Status**: [x] Screenshots and the rules run retained

---

## Dependencies

- Depends on: `production/epics/solve-or-boom/story-017-match-options.md`
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-14
**Criteria**: 9/9 passing (the streak rules are covered by the retained rules run; a person plays a streak to the Rifle dorado and tries the option by touch on a real phone)
**Deviations**: advisory. Criterion 8 asked for `match yes` with the option off; the same-seed run was played with the option on (its default), and the person accepted it. The option's touch use has no retained screenshot (the person confirmed it works). The programmer agent hit its turn limit three times and gave no report: the lead checked the copy, ran the rules check and took the teacher-page and phone screenshots. The class server must be rebuilt and students must reload the page (protocol 11).
**Test Evidence**: waived at qa.level minimal; production/qa/evidence/story-018-streak-rewards/ (10 screenshots, the rules run, stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: CHANGED, accepted — game state identical; only the new streak panel appears in the HUD (option on by default)

## Calls beyond the design
- Escudo adds armour up to 100 (`src/game/streak.ts`, `data/config.json`) · kept 2026-11-14
- One Cazador kept at most; reaching 5 again with one kept keeps one, and a press with none kept or while one runs is refused with a message (`src/game/streak.ts`) · kept 2026-11-14
- The streak and the kept Cazador survive death and rounds and restart each match (`src/game/streak.ts`, `src/game/state.ts`) · kept 2026-11-14
- Rifle dorado: damage 45 (rifle 34), spread 0.0035 (rifle 0.007), rate 0.1, 30 / 90 rounds, rifle sound, replaces the primary, lost when the next round starts after death, reaching 8 again refills it (`data/config.json`, `src/game/streak.ts`) · kept 2026-11-14
- Cazador button on phones above Comprar, only while one is kept; enemies in red on the minimap radar; the streak panel beside the minimap (`src/touch.ts`, `src/main.ts`) · kept 2026-11-14
