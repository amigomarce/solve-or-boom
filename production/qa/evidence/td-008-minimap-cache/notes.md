# TD-008: the minimap's fixed layer cached (2026-11-20)

Change (src/hud.ts): `drawMinimapCells()` draws the minimap's walls, floors, zones, stairs and the first floor over the
ground into a canvas of its own and only copies it each frame. It redraws only when the map, the mode (zones or not), the
level shown, the screen's pixel ratio or the minimap's place change. The cache sits on the screen's own pixel grid at the
same scale, so its cells land on the same device pixels. The markers (players, bomb, A and B, arrows) are still drawn every
frame.

Pixel checks against 4de03ea (the code before):
- The 9 frames of the earlier runs: the minimap identical in all (the few differing pixels are at the screen's centre, the
  WebGL noise of distant 3D figures).
- Minimap box only, two-floor map and Free for All (10-14): identical.
- From the first floor (`16-minimapa-piso-1`, the player raised to level 1 through the check hook): 1068 px differ by at
  most 1 of 255 in one channel, the rounding of the dimmed ground (alpha 0.35) blended in the cache first; not visible.
  Ground before and after going up (`15`, `17`): identical, so the cache is redrawn when the level changes.

Timing, 600 drawn frames on the two-floor map (single-file build, cheap 3D), 3 runs each: 0.797 / 0.798 / 0.800 ms per
frame before, 0.590 / 0.586 / 0.592 ms after (about 26% less for the whole frame, 3D included).

Page errors 0. Typecheck 0, 42 unit tests, smoke @boot pass.
