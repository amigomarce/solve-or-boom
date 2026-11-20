# TD-019 and TD-017's last part: the teacher page's version is served, modes carry their traits (2026-11-20)

Change: profesor.html has `const V = __PROTOCOL_VERSION__;`, filled in by `fillTeacherPage()` (src/server/teacher.ts) when
src/server/aula.ts serves the page; it throws when the marker is missing. Protocol 19: each `tinfo` mode carries its traits
(MODE_INFO), and the page's `modeOf(id)` replaces its 4 mode-name checks (the radio's `checked` stays).

Test first: tests/unit/teacher-page.test.ts failed on the old code (no fillTeacherPage; `const V = 18;` written by hand), passes now.

| Shot | What it shows | Result |
|---|---|---|
| 01-04 | Teacher picks each mode and "Repartir", 2 students | page V = 19, "Conectado", 0 `terror` frames; Oleadas 1 group of 4, FFA 1 of 8, Duelo and Bomba 2 teams; the move menu offers teams only in Duelo and Bomba |
| 05 | An Oleadas room started, then ended (confirm accepted) | waiting room: "Última partida: <waves summary>"; "Salas terminadas": the waves summary, not "Marcador final" |
| 06 | The student after the end | results screen |

Page errors: 0. Typecheck 0, 21 unit tests, smoke @boot pass.

NOT OBSERVED: a finished Bomba room's "Marcador final" line (the run had no students left to split; it is the unchanged
default path, `modeOf('bomb').bomb` is true). Seen, not caused here: a student who comes back from a new page is listed as
"Ana (3)" (the open "Beto (2)" question in production/session-state/active.md).
