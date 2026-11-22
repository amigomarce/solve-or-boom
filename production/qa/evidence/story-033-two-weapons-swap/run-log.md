# Story 033: the bounded runs (2026-11-21)

## Single player (`dist-single/index.html?manual=1&render=cheap&seed=7`, Bomba, money set to 10000 through the test hook)

| Step | Result |
|---|---|
| Buy Subfusil, answer right | first place: smg, in hand |
| Buy Rifle, answer right | second place: rifle, in hand; menu: Subfusil and Rifle "Comprada" (`02-…`) |
| Buy Francotirador with the rifle in hand | replaces the rifle: places smg + sniper; Rifle buyable again (`03-…`) |
| Q ×4 | pistol → smg → sniper → pistol |
| Keys 3, 2, 1 | sniper, pistol, smg |
| HUD | the weapon in hand at the right, the other two listed with their key and mag/reserve (`01-…`, `04-…`) |

Each carried weapon has its own ammo entry (`pistol 12/36`, `smg 25/75`, `sniper 5/15`). Page errors 0. (A check that a fired
magazine is kept across a swap did not shoot: it ran in the buy phase, where shooting is off.)

## Class (`npm run aula`, port 8099; only for the run `start_money` 5000 and `buy_time` 60 in data/config.json, put back and both bundles rebuilt after)

Bomba, two students (Ana, Beto), one after the other with their page in front: each bought Subfusil and Rifle (places smg +
rifle, money 5000 → 1100), Q stepped pistol → smg → rifle, key 3 took the rifle and key 1 the subfusil
(`05-clase-alumno-dos-armas.png`: Ana with the subfusil, "2 Pistola · 3 Rifle" listed). Page errors 0, `terror` 0, server log
errors 0.

Two earlier tries in Free for All failed for the test's reasons, not the game's: buying one student after the other ran past
Free for All's start buy window (10 s), and buying for both at once left one page in the background, where the headless
browser stops its frames.

## Not checked

Duelo por equipos and Oleadas cooperativas, the touch button for the second weapon, the Controles screen with the new action,
a fired magazine kept across a swap.
