# TD-012: the tracer decision under test, no dot-sized tracers (2026-11-20)

TD-012 listed three points; one was already gone:
- "its 0.05 s life is a literal": tracer lives are `fx_*_tracer_life` in data/config.json since 964cac7 (2026-11-12); no
  0.05 s tracer life is left in the code.
- "the tracer drawing path has no check": the decision is now `tracerSpan(from, to, skip, minLen)` in src/fx.ts, a pure
  function (no Three.js), used by playEvents in src/main.ts; tests/unit/fx.test.ts covers it (5 tests).
- "a near-zero-length tracer is still drawn": a bar shorter than `fx_tracer_min_len` (0.1 m, new in data/config.json) is
  not drawn. The scoped sniper's own tracer keeps its rule: it starts fx_scope_tracer_skip m out, thinner, and is not drawn
  when the shot lands within those metres.

Tests: written first (failed: no src/fx.ts); with the two length checks removed on purpose, exactly the two short-tracer
tests failed. Frames: the bots' tracers in Free for All and on the two-floor map look as before (`14-ffa-35s-*`); the
differing pixels are the animated figures' usual noise. Not seen on screen: the player's own scoped sniper shot (unit test
only). Page errors 0. Typecheck 0, 47 unit tests, smoke @boot pass.
