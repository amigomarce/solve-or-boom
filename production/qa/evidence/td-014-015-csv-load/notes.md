# TD-014 and TD-015: one CSV load step, the template under test (2026-11-20)

Change: `loadQuestionFile(bytes, name, limits)` in src/game/csv.ts does the size and row limits, parseCSV, and the 1..max
question check, and returns the Spanish line. The teacher's `tcsv` (src/server/teacher.ts) and the host's own upload
(`loadCSV` in src/main.ts) both call it; the host now has the same limits (data/aula.json csv_max_bytes 256 KB,
csv_max_questions 500), which it lacked before. The teacher keeps its base64 length pre-check (wire level).

Tests first: tests/unit/csv.test.ts (20 tests): the page's TEMPLATE_ROWS, built as downloadTemplate() saves them, load with
0 skipped (a broken row added on purpose made it fail, then removed); parseCSV's rules; decodeCSV; loadQuestionFile's 6
outcomes (they failed before the function existed).

| Shot | What it shows | Result |
|---|---|---|
| 01 | Local game: the template uploaded | "Cargadas 6 preguntas de plantilla-preguntas.csv", 6 listed |
| 02 | Local game: a 300 KB file | "El archivo es demasiado grande (máximo 256 KB).", the 6 questions kept (new: refused before) |
| 03 | Teacher page: the template | server reply ok, 6 questions, 0 skipped |
| 04 | Teacher page: 600 valid questions | "Demasiadas preguntas (600); el máximo es 500.", the template kept |

Page errors: 0. Typecheck 0, 39 unit tests, smoke @boot pass.
