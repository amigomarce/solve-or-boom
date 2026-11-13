## Technical Debt Register

Last updated: 2026-11-13

Total items: 7 | Estimated total effort: 7 x S

| ID | Category | Description | Files | Effort | Impact | Priority | Status | Added | Sprint |
|----|----------|-------------|-------|--------|--------|----------|--------|-------|--------|
| TD-001 | Code Quality | A dropped medkit and ammo box are placed 0.3 m apart with a literal offset and no check for a wall or crate, so one can land inside a wall (the 1 m pickup radius mostly covers it) — from production/epics/solve-or-boom/story-016-combat-and-economy.md | src/game/combat.ts | S | Low | — | Open | 2026-11-13 | Backlog |
| TD-002 | Code Quality | The phone's Tabla toggle stays on while a menu or card is open (the table returns when it closes), and "Ya tienes toda la vida" repeats on every medkit key press — from production/epics/solve-or-boom/story-016-combat-and-economy.md | src/touch.ts, src/game/player.ts | S | Low | — | Open | 2026-11-13 | Backlog |
| TD-003 | Code Quality | Visual constants are written in the code instead of `fx_*` values in data/config.json: the melee swing amplitudes, the "1-6" shop label and the shop panel heights (the 72 degree base view angle appears in 3 places too) — from production/epics/solve-or-boom/story-016-combat-and-economy.md | src/main.ts | S | Low | — | Open | 2026-11-13 | Backlog |
| TD-004 | Performance | Small allocations on every step or frame: the pickups `filter` each step, the pickup drawing's `used` object and kind array, and the sorted copy of the players while Tab is held; the pickup mesh pool is 16 per kind with its own geometry and material each (created once) — from production/epics/solve-or-boom/story-016-combat-and-economy.md | src/game/match.ts, src/main.ts | S | Low | — | Open | 2026-11-13 | Backlog |
| TD-005 | Code Quality | A pickup reached by two players on the same step always goes to the lower seat; deterministic, with no double grant, but it favours seat order — from production/epics/solve-or-boom/story-016-combat-and-economy.md | src/game/player.ts | S | Low | — | Open | 2026-11-13 | Backlog |
| TD-006 | Code Quality | In a bot's friendly-fire check the minimum distance 0.5 m, the height difference 1.5 m and the 0.42 m radius are literals, and a bot's missed shot never hits a teammate (a design choice, not written down) — from production/epics/solve-or-boom/story-017-match-options.md | src/game/combat.ts | S | Low | — | Open | 2026-11-13 | Backlog |
| TD-007 | Code Quality | The student's page accepts any positive `buyTime` in `begin` (Infinity or 1e9 included) and the mirror trusts it; the server always sends a clamped value, so it is not reachable today — from production/epics/solve-or-boom/story-017-match-options.md | src/net/protocol.ts | S | Low | — | Open | 2026-11-13 | Backlog |
