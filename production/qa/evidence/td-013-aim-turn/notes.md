# TD-013: aimed turning by the half-angle tangents (2026-11-20)

Change: `aimTurnScale(aimFov, viewFov)` in src/game/rules.ts = tan(aimFov/2) / tan(viewFov/2), so the crosshair moves
across the screen at the same speed zoomed or not (the usual scaling in shooters). src/main.ts uses it for the mouse and
for the finger drag; before, both used the plain ratio aimFov / viewFov. Chosen by the user on 2026-11-20 (option
"Switch to tan-based"). The feel is the player's check: aimed turning is 4.6% (pistol) to 12.4% (sniper) slower.

Tests: tests/unit/rules.test.ts (3 new) written first (failed: no function); with the formula put back to the linear
ratio on purpose, the two formula tests failed.

Observed in the single-file build (headless Chrome, pointer locked in a match, a 100 px mouse move, the aim button held),
against 9848c8a:

| | not aiming | pistol | SMG | rifle | sniper |
|---|---|---|---|---|---|
| before (rad) | 0.220 | 0.18333 | 0.16806 | 0.13750 | 0.06722 |
| after (rad) | 0.220 | 0.17482 | 0.15763 | 0.12543 | 0.05886 |
| after / not aiming | 1 | 0.795 | 0.716 | 0.570 | 0.268 |

The ratios match the tangent ratios from data/config.json (60, 55, 45 and 22 degrees against 72). The finger drag uses the
same function; not measured on a phone. Page errors 0. Typecheck 0, 50 unit tests, smoke @boot pass.
