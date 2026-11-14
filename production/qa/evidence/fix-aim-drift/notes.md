# Fix: the shot follows the crosshair in class mode (2026-11-14)

Reported from the classroom: "el disparo siempre cae a la izquierda de donde aparece el crosshair, es imposible hacer daño a alguien apuntando correctamente".

- Single player was checked first and is right: an enemy 10 m straight ahead, the crosshair on him, a rifle shot hits (85 damage) facing, sideways and from behind.
- Cause, class mode: the server keeps at most 8 queued inputs per student (`input_queue_max`, about 133 ms). After a wifi hiccup the inputs arrive in a burst and the oldest are dropped, with their mouse turn. The student's position is corrected by the next snapshot, but the aim was not: the client kept its own yaw (`keepYaw` in src/net/mirror.ts). So every hiccup left the server's aim, which the shots use, a little more off the crosshair the student sees, for the rest of the match.
- Fix: each class-mode input carries the student's own aim after its turn (`aimYaw`, `aimPitch`); the server takes it as is instead of adding the turn (src/main.ts netStep, src/game/match.ts, src/game/player.ts). Protocol version 8 (src/net/protocol.ts, src/server/profesor.html). Single player is unchanged (the same-seed replay is `match yes`).
- probes.txt: before, one 0.3 s hiccup left the aims 31.5 to 34.4 degrees apart; after, 0.0 degrees with the same inputs dropped.
- Checks: typecheck 0; smoke pass; 10 unit + 2 e2e; class and server built at protocol 8.
- Not covered: the aim is now trusted from the student (fine in a classroom); a hiccup still delays movement inputs, which the snapshots correct as before.
