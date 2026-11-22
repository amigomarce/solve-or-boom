# Story 034: the bounded runs (2026-11-21)

## Single player (`dist-single/index.html?manual=1&render=cheap&seed=7`, Bomba, live phase)

The player was placed 1 m from a living enemy bot through the test hook and pressed V:

| Facing | Result |
|---|---|
| towards the enemy | each strike took 35 hp (100 → 65 → 30 → 0, the third killed); the pistol's magazine stayed 12/36 (no ammo spent) |
| away from the enemy | no damage |

Each strike set the cooldown to 0.6 s (`melee_rate`). `01-golpe-en-pleno-balanceo.png`: the enemy right in front, the hit arc
in red. `02-controles-golpear.png`: the Controles screen with "Golpear — V". `03-movil-boton-golpear.png` (`?touch=1`): the
round "Golpear" button in the right column, between Recargar and Tumbarse. Page errors 0.

(A first try placed the player on the wrong side: the game's forward is (−sin yaw, −cos yaw); the test was fixed, not the game.)

## Class (`npm run aula`, port 8099, real values)

Free for All, one student (Ana): after closing the buy menu, four strikes with V, then walking: she moved (10.5, 31.5) →
(17.6, 32.6), so the server kept taking her inputs with the new field. `04-clase-golpe.png`: her pistol swung forward and
down. Page errors 0, `terror` 0, server log errors 0.

## Not checked

A strike by one student hitting another student (the test cannot place two students side by side); the swing seen by another
player; friendly fire on and off; Duelo por equipos and Oleadas cooperativas; the strike during a reload.
