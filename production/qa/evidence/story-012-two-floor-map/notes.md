# Story 012 evidence: Two-floor map ("Dos pisos")

- 01-07: single player, dist-single build on Chrome (GPU, Metal): ground floor, first floor, looking down, the west stair, the centre stair and bridge, under the slab, the session screen's map selector. 14: a full match against bots ending with no page error (0-4).
- 08-09: the teacher page with "Dos pisos" picked, and a running room on "Mapa Dos pisos" (Ana and Beto as students).
- 10-13: class mode on the real aula server. Beto (a Node-driven student through the real client and prediction code) walks up to the first floor over the network; Ana's browser page shows him at y 3.00 m. Ana's own camera was placed by script for that one drawn frame (client side only): 10-11 from the ground below, 12-13 beside him on the slab (minimap "Piso 1").
- bots-run.txt: 8 bots, seeds 5-8 and 11-16, 10 full matches with the final code: STUCK > 5 s 0, unchosen level changes 0; plants A (ground) 22 and B (first floor) 6, defuses A 3 and B 1; ramps used up 174 times. An earlier run (seed 8) found 3 bots stuck 30 s at the foot of the east stair (a corner cut across a ramp's side); fixed in bots.ts cutClear before this run. 8 of 10 matches ended in 3 rounds: balance to watch in play.
- The room runs and screenshots were taken before that one-line bot fix (it changes only how bots cut corners on maps with floors).
- room-run-0ms.txt, room-run-100ms.txt: headless room, two students and six bots, full match each, 0 steps dropped. Each ends with 1 (0 ms) or 4 (100 ms) `need_hello` refusals per student: inputs still in flight after the room retires (pre-existing, story 005 code); no other error.
- Frame time (GPU, Metal): Grande 2.81 ms vs Dos pisos 2.91 ms (+3.6 %). dist-single 767,790 bytes.
- map-ascii.txt: the map's two layers as text.
