# Story 013 evidence: Aim with every gun

- 01-08: single player, real Chrome (GPU): each gun not aimed and aimed. Pistol, SMG and rifle aim through their own sights (gun on the centre line, own zoom); only the sniper shows the black circle.
- 09: Controles menu with "Apuntar (mantener)" on "Clic derecho". 10: the pause after aiming (the aim ends).
- room-run-four-guns.txt: headless room (two students, six bots, Dos pisos, protocol 5), bounded run (stopped once Ana had aimed 5 s with each gun on the server): 900 held steps, all predicted aimed on the same step; server aimed steps pistol 810, SMG 300, rifle 300, sniper 300; correction while aimed max 0.056 m; no errors, 0 steps dropped.
- Saved key bindings from before this story keep their custom keys and gain "Apuntar" (checked in Node with a stubbed localStorage: forward KeyI, back KeyK kept, aim Mouse2).
- Same-seed replay: match yes, errors 0. dist-single 769,261 bytes.
- The screenshots were taken before the engine-check fixes (saved-binding merge, the aim state in the private snapshot row, right-click rebinding over a row); those fixes change no drawing.
