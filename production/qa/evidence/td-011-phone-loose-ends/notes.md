# TD-011: phone loose ends (2026-11-20)

| Point | Change | Checked against a5a145e (single-file build, ?touch=1, headless Chrome) |
|---|---|---|
| CSV picker twice with ?touch=1 | src/main.ts: the upload button remembers on pointerdown whether a finger pressed it (`uploadByTouch`); a mouse opens the picker there, a finger on the click that follows. Also fixes a touch laptop (finger, not TOUCH), which never opened it | mouse click: 2 pickers before, 1 after; finger tap: 1 and 1 |
| Fullscreen asked only once | src/touch.ts: every tap asks while the page is not full screen; a refused full screen stops the asking; a refused landscape lock (iPad, desktop) is ignored, not taken as a refusal (first try of this change had that bug; the check found it) | requestFullscreen counted over 3 taps, page never full screen: granted 1 before, 3 after; refused 1 and 1 |
| user-scalable=no blocks zoom | index.html viewport: `maximum-scale=1, user-scalable=no` removed; pinch on the game stays blocked by html.touch's touch-action: none and the gesture events | the meta read back from the page. NOT VERIFIED: a real pinch on a phone (cannot be done headless) |
| Touch layout repeats fit() | src/fit-box.ts `fitBox()`: the game's scale and top bar, used by screen.ts fit() and touch.ts layout() (its own module: screen.ts already imports touch.ts) | touch controls in a match (`20-movil-controles-*.png`): identical pixel for pixel |
| lang="en" | already lang="es" in index.html before this work | — |

Page errors 0. Typecheck 0, 42 unit tests, smoke @boot pass.
