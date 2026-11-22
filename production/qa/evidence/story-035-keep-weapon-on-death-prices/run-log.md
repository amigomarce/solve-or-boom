# Story 035: the bounded runs (2026-11-21)

## Decided with the person during the story

- The first build applied the keep-one-weapon rule to bots too: the seven mode replays of `tests/unit/modes.test.ts`
  changed and the person said something had broken. The rule now applies to human players only (`keepOnDeath` in
  `src/game/state.ts`: a bot gets the pistol only, as before). With the old prices, all eight mode replays were then identical.
- The 80% prices are meant to let the player buy more weapons; asked whether bots also buy at 80%, the person said yes, all
  at 80%. The seven mode replays change only because of the prices; the person accepted it and the snapshots were updated
  (`npx vitest run -u tests/unit/modes.test.ts`). Example, Bomba on the small map at 240 s: round 2 at 1–0 (before: round 3
  at 2–0).

## Single player (`dist-single/index.html?manual=1&render=cheap&seed=7`, money set to 10000 through the test hook)

| Mode | What happened |
|---|---|
| Free for All | bought Subfusil 960, Francotirador 3040, Blindaje 650 (10000 → 5350); died holding the pistol (hp set to 1, a bot shot); answered the card; came back with the Francotirador in hand, 5/15 (full), no Subfusil, no armour (`01-…`, `02-…`, `03-…`) |
| Bomba | bought Subfusil and Rifle; died in round 1 (hp 1, placed by an enemy); round 2 started with the Rifle in hand at 30/90, no Subfusil (`04-…`) |

Page errors 0.

## Class (`npm run aula`, port 8099; only for the run `start_money` 5000 and `ffa_buy_menu_time` 30, put back and both bundles rebuilt after)

Free for All, one student (Ana): bought Subfusil and Francotirador (5000 → 1000), took the Subfusil in hand, walked until a
bot killed her (25 s), answered the respawn card, came back with the Francotirador in hand at 5/15 and no Subfusil; the buy
menu then showed Francotirador "Comprada" and the Subfusil at 960 (`05-…`). Page errors 0, `terror` 0, server log errors 0.

(The test answers the class cards by working out the arithmetic in the question: a wrong answer swaps the question, so
trying the four choices in turn is not enough. Two earlier tries failed on that, not on the game.)

## Not checked

Duelo por equipos and Oleadas cooperativas; a tie between two weapons of the same price; the Rifle dorado on death with a
bought weapon beside it; a disconnected student's seat played by a bot.
