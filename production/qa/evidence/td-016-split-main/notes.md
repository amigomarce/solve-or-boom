# TD-016, first part: the HUD and the screens around a match out of src/main.ts (2026-11-20)

Change: the section "Drawing: the HUD" is src/hud.ts (455 lines) and "Drawing: the session screen, results and figures"
(with ROOM_RULES and SESSION_RULES) is src/session-screen.ts (453 lines); src/main.ts goes from 2492 to 1617 lines. The code
moved as it was. Each module imports from main.ts what it reads (state, session, aula, net, camera, project…), and main.ts
imports what it calls (drawHUD, drawTitle, drawResults…). Neither module assigns a variable of main.ts (TypeScript refuses
that on an import) and neither touches main.ts while the modules load (their load-time lines use only tune and their own
constants), so the circular import is safe.

Same frames before and after: the single-file build, ?manual=1&render=cheap&seed=7, a frozen GAME_CLOCK, 9 screens
(session, menu, HUD at the start, buy menu, Tab table, HUD after 40 s, pause, Free for All results, class join), each saved
before (`*-antes.png`, the code at 613e48f) and after (`*-despues.png`), compared pixel by pixel:

| Frame | Result |
|---|---|
| 01 title, 02 menu, 03 play HUD, 04 shop, 05 scoreboard, 08 FFA results, 09 class join | identical |
| 06 play after 40 s, 07 pause | 72 and 46 px differ in a box around the distant 3D bot figures ([587,357]-[648,398]); two runs of the old code alone differ there by the same amount (WebGL noise), the 2D layer is identical |

Class screens (only reachable with the server), run and looked at: 10 join, 11 waiting room, 12 in a match, 13 the
teacher's pause, 14 results after the teacher ended it. Page errors: 0. Typecheck 0, 42 unit tests, smoke @boot pass.

Not moved yet: the Three.js world and the guns. Their code runs at load time and calls helpers that stay in main.ts (box,
lam, makeFlash…), and other sections assign their counters (decalI, puffI, lastPlace), so moving them needs those helpers
and setters to move first.
