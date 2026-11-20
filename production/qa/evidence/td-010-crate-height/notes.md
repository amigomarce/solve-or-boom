# TD-010: one crate height (2026-11-20)

Change: `CRATE_H = CRATE_TOP.crate / 2` in src/game/map.ts (two stacked crates make the 2.2 m top the shots already use,
story 015). src/scene3d.ts draws both crate meshes (ground crates and first-floor crates) and places the two boxes of each
stack from it: height CRATE_H, centres CRATE_H / 2 and CRATE_H * 1.5. Before: 1.1, 0.55 and 1.65 written twice. The drawn
stack and the shots' crate top can no longer drift apart.

Check against the frames before (7afcb0e + TD-009, same 3D code otherwise): 1.1 and 0.55 are exactly the same numbers
(halving is exact); the top box's centre is 1.6500000000000001 instead of 1.65, so a few crate pixels differ by at most 1/255
(15-106 px per frame); 06 and 07 also show the usual WebGL noise around distant figures. 02, 08, 09 identical. Not visible.
Page errors 0. Typecheck 0, 42 unit tests, smoke @boot pass.
