# Story 015 evidence: Shooting fixes

From a classroom playtest: the aimed shot left from the shoulder; bullets looked too big and hit crate edges close by (and, the person added, a shot with the crosshair on an enemy just past a crate's edge hit the edge); the guns scattered far more than players expect.

- 01-04: each gun aimed, real Chrome (GPU, Metal): the tracer leaves from the sights on the centre line; the sniper's own tracer through the scope starts 4 m ahead and thinner (the blob left in 04 is the impact puff on the wall 14 m away, magnified by the 22° view).
- 05-08: each gun not aimed: thinner tracers leaving from the muzzle.
- 09-10: a shot fired past a crate's edge from 0.4 m away, not aimed and aimed: it flies on.
- crate-checks.txt: (a) the crate edge, before the shot stopped at 0.6 m, after it flies 15-63 m; (b) the playtest case, an enemy just past a crate edge with the crosshair 2, 5, 10 and 20 cm outside the drawn crate: before blocked at 2-10 cm (the crate counted out to its cell's edge, 12 cm beyond the drawn box), after a hit every time, ground and first floor; (c) over a crate's top: level aim stops at a 2.2 m crate, aimed over its top flies on; sandbags (1.5 m) are shot over at eye level.
- spread-20m.txt: 3000 shots per gun and mode, before and after (rifle standing 0.24 -> 0.17 m, moving 1.09 -> 0.36 m; sniper aimed 0.05 -> 0.01 m).
- room-run.txt: bounded headless room (two students, six bots, Dos pisos, protocol 5, 90 s cap): Ana shot 14 times next to crates, aimed starts at most 0.004 m off the centre line, none inside a wall or crate; prediction correction mean 0.004 m; no errors, 0 steps dropped. (An earlier 240 s run by the programmer showed high corrections; the same driver for 90 s on the story 013 code and on this code gives about 0.01 m, so it was that long run, not the game.)
- Same-seed replay: the game state is identical; the last 2 s are drawn differently (thinner tracers and smaller impact marks on the bots' shots). Shown to the person and accepted 2026-11-13.
- Not covered: in class mode the server shoots from its own copy of the student's position, which can differ by a few cm from what the student sees on a slow network, so a shot within a couple of cm of an edge can still be stopped.
