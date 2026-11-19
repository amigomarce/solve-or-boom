# Story 022: CSV template on the teacher panel

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: UI
> **Estimate**: S
> **Build step**: core
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-19

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief MVP feature 34`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: Web 8.3.4 | **Risk**: HIGH (Vite 8 and TypeScript 7, per the VERSION.md timeline)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the teacher's request: they cannot tell what format a question CSV needs.*

- [ ] Next to "Subir CSV" on `/profesor` there is a "Descargar plantilla" button; it saves `plantilla-preguntas.csv` from the browser, with no server round trip and no protocol change.
- [ ] The file is UTF-8 with a byte-order mark (like `resultados.csv`) so Excel reads the accents, and holds a header row plus at least 3 example rows: one 6-column row (question, right answer, 3 wrong, level), one with the 1-4 / a-d "which is right" column, and one 2-column row (question, answer).
- [ ] Loading the template back with "Subir CSV" is accepted with 0 skipped rows (the examples follow `parseCSV` in `src/game/csv.ts`).
- [ ] A short Spanish text under the button explains each column, the accepted separators (comma, semicolon, tab), the level values (facil, medio, dificil) and the limits already shown (size and question count).
- [ ] The page works on the teacher's screen sizes already supported; nothing else on the teacher page moves or breaks, Bomba and Free for All play unchanged, `npx tsc --noEmit` has 0 errors, `npm run smoke` passes.
- [ ] Retained screenshots: the teacher page with the button and the explanation, and the template opened or printed (text of the file) showing the header and examples.

---

## Implementation Notes

- The panel is `src/server/profesor.html` (upload row near `#upload`, `#file`, `#csv`, line ~102); build the Blob like the results export (`~line 279`, BOM + `text/csv;charset=utf-8`).
- The accepted formats are documented at `parseCSV` in `src/game/csv.ts`; keep the example rows in one place and check them with a bounded run of `parseCSV` (skipped must be 0).
- All text in Spanish. No gameplay numbers.

---

## Out of Scope

- Changing the CSV format or the parser, an in-page question editor, and a template in the single-player session screen.

---

## Files

- src/server/profesor.html (Descargar plantilla button, the explanation under it, the template download)
- No test files: tests are waived at qa.level minimal

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: UI
**Required evidence**: retained screenshots of the teacher page in `production/qa/evidence/story-022-csv-template/`.

**Status**: [ ] Screenshots retained

---

## Dependencies

- Depends on: None
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-19
**Criteria**: 6/6 passing
**Deviations**: None
**Test Evidence**: waived at qa.level minimal; production/qa/evidence/story-022-csv-template/ (3 screenshots, the downloaded template, stamp unchanged)
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke

## Calls beyond the design
- Six example rows, two of each form (7 x 8, capital of France, symbol O, hexagon, Don Quijote, red planet); header `pregunta,correcta,mala1,mala2,mala3,nivel`; Windows line endings (`src/server/profesor.html`) · kept 2026-11-19
- Message "Descargado plantilla-preguntas.csv."; the help also says the first row is a header and the short form needs several rows; the size and question limits appear twice (`src/server/profesor.html`) · kept 2026-11-19
