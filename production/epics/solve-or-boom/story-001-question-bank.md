# Story 001: Extensive question bank per subject

> **Epic**: Solve or Boom
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Build step**: deepen — extensive question bank per subject
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-11

## Context

**GDD**: `design/game-brief.md`
**Requirement**: `Brief Your systems: extensive question bank per subject`

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: not set (/setup-engine picks one; web for a new project) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**:
- N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Your systems line, scoped to this story. This system is a thin stand-in today: Math is generated and unlimited, while Science, Geography and English have about 12 questions per topic in `prototypes/solve-or-boom/questions.js`.*

- [ ] Built out as `design/gdd/question-bank.md` describes (run `/design-system question-bank` first: that document sets the size, topics and difficulty per subject)

---

## Implementation Notes

- Run `/design-system question-bank` before this story is built: it writes the design doc the criterion above points at.
- Questions are data: keep them in data files, never as literals in game logic. The current shape is `[question, right answer, wrong, wrong, wrong]` per topic.
- A wrong answer must always bring a new question (the brief's Avoid line), so each topic needs enough questions to avoid repeats within a match.

---

## Out of Scope

*Handled elsewhere or not planned:*

- Teacher accounts and saved class results: later, grow it (brief Out of scope)
- Reading custom CSV questions: already built (brief Features)

---

## Files

- src/game/csv.ts (created)
- src/game/deck.ts (created)
- src/game/types.ts
- src/questions.ts
- src/main.ts
- src/screen.ts
- data/config.json
- data/config-notes.md
- assets/questions/ciencias/seres-vivos.csv, fuerzas-energia-espacio.csv, materia-materiales.csv (created)
- assets/questions/geografia/capitales.csv, continentes-oceanos-montanas.csv, mapas-relieve.csv (created)
- assets/questions/lengua/sinonimos.csv, antonimos.csv, gramatica-ortografia.csv (created)
- design/gdd/question-bank.md (Core Rules 3, 6, 7, UI Requirements, Acceptance 18: harder questions for better weapons)
- No test files: tests are waived at qa.level minimal; the existing 12 still pass

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above.*

---

## Test Evidence

**Story Type**: Integration (retyped from Config/Data on 2026-11-11: the design doc needs deck, CSV, lockout and screen changes, not data alone)
**Required evidence**: tests are waived at `qa.level: minimal`. A retained screenshot of the session screen and of the question card, in `production/qa/evidence/story-001-question-bank/`, is still required for the screens this story touches.

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None
- Unlocks: None

## Completion Notes
**Completed**: 2026-11-11
**Criteria**: 0/1 passing (1 deferred: "built out as design/gdd/question-bank.md describes", including its checks 1-18, to be checked in play)
**Deviations**: advisory. Engine notes: the config reader throws on unknown keys, `clip()` cuts by UTF-16 code unit, a UTF-16 CSV decodes as garbage. The 0.35 s right-answer confirm is hardcoded in `src/main.ts` (it predates the story).
**Test Evidence**: waived at qa.level minimal. Screenshots: production/qa/evidence/story-001-question-bank/01-session-ciencias-dificil.png, 02-card-ciencias.png, 03-shop-levels-facil.png, 04-card-smg-level.png
**Reviewed by**: self, no independent review
**Same-seed run**: SAME — nothing broke (production/qa/evidence/grow-solve-or-boom/story.png)
**Note**: the 450 Spanish questions are AI-drafted and still need a teacher's review.

## Calls beyond the design
- CSV: duplicate checks are case-sensitive, rows of 3-4 columns are skipped, the level may be a 7th column in the a,b,c,d,N form, the header row is skipped (`src/game/csv.ts`) · kept 2026-11-11
- Deck: a missed question is retried once per question per match; on a small pool it returns after 2 draws; a reshuffle never starts with the question just drawn (`src/game/deck.ts`) · kept 2026-11-11
- Defaults: level Medio, subject Matemáticas; a bank row with no level counts as Medio; a level tie falls back to the easier level (`src/main.ts`, `src/questions.ts`) · kept 2026-11-11
- Math level ranges: Fácil about half and Difícil about four times Medio, with an extra step (`data/config.json`) · kept 2026-11-11 (the requested change, harder questions for better weapons, was built instead)
- Spanish wording and layout: "¡Correcto!" / "Incorrecto: ahora viene otra pregunta…", "Falta $N" shows the missing money, panel headings, controls line, smaller buttons, 8 px red lockout bar, level row stops at its ends and is greyed for a custom CSV; the English HUD shows one mixed message (`src/main.ts`) · kept 2026-11-11
- Level pools: cancel and retry stay within the level a question was drawn at; a fallback level shares its questions; the card and shop show the requested level (`src/game/deck.ts`, `src/questions.ts`, `src/main.ts`) · kept 2026-11-11
- Level labels: "pregunta <Nivel>" under the price at 14 px; card header "<tema> · <Nivel>" (`src/main.ts`) · kept 2026-11-11
