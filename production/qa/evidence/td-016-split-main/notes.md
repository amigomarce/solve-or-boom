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

## Second part: the 3D world and the guns (2026-11-20)

Change: the block from "Three.js world" to "The roster's figures" (the renderer and camera, the map's meshes and textures,
the figures, third- and first-person guns, the effect pools, the roster's models) is src/scene3d.ts (789 lines); main.ts is
849 lines (was 2492 before part 1). One module, not world.ts and guns.ts as TD-016 first proposed: the guns' load-time code
calls the world's helpers (lam, box…), and two modules importing each other would load in an order that breaks that.
Before moving: `CHEAP` went into the world section (its load-time code reads it), `let lastPlace` next to placeModels (the
only user, staying in main.ts), and the puff and bullet-hole counters, assigned from playEvents, are now taken through
`nextPuff()` / `nextDecal()` beside their pools.

Checks against the code at 66530e9:
- The 9 frames of part 1 (`*-despues-parte2.png`): 7 identical, 2 differ only around the distant 3D figures (44 and 46 px),
  the WebGL noise two runs of the old code show.
- 4 more 3D frames, built from 66530e9 in a separate worktree (`10`/`12`/`13`/`14-*-antes.png` and `-despues.png`): the
  two-floor map and Free for All. These are not pixel-stable even for the old code against itself (placeModels animates
  the figures with performance.now, the real clock): old vs old differed by 9820 / 919 / 32 / 36 px, old vs new by 9736 /
  904 / 16 / 16 px, in the same boxes. Looked at side by side: the same scene. The bots' tracers show in the Free for All
  frame. Not reached: the player's own fire (holding F did not shoot in this run).
Page errors 0. Typecheck 0, 42 unit tests, smoke @boot pass.
