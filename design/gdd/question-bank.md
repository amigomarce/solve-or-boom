# Question Bank

> **Status**: Designed (pending review)
> **Author**: user + Claude
> **Last Updated**: 2026-11-11
> **Last Verified**: 2026-11-11
> **Implements Pillar**: none (no game-pillars.md)
> **Creative Director Review (CD-GDD-ALIGN)**: NOT ASSESSED 2026-11-11 — skipped, Solo mode

## Summary

The question bank deals the multiple-choice questions players must answer to buy gear and defuse the bomb. The host picks a subject, topics and level, or uploads a CSV, and the bank supplies 4 shuffled choices per question, with a new question after every wrong answer. It exists so the game teaches: every weapon and every defuse costs one right answer.

> **Quick reference** — Layer: `Foundation` · Priority: `MVP` · Key deps: `Session setup, question data files, seeded rng(), config.js` (Category: Gameplay; Layer and Priority inferred from the brief: no systems index at this tier)

## Overview

The question bank supplies the multiple-choice questions behind every buy and every defuse. Before a match the host picks a subject (Matemáticas, Ciencias, Geografía or Lengua), a level and its topics, or uploads their own CSV. During play the bank deals one question at a time with four shuffled choices, and a wrong answer always brings a new question. Math is generated, so it never runs out. The other subjects are hand-written banks, and a custom CSV is used as given. Players never see the bank itself, only a question each time they buy gear or defuse the bomb. If the bank is too small or repeats, the questions start to feel like homework instead of tension.

## Detailed Design

### Core Rules

1. **Subjects and topics.** *Matemáticas* (generated, 5 topics: sumas y restas, multiplicación y división, fracciones, porcentajes, ecuaciones simples). *Ciencias* (seres vivos y el cuerpo · fuerzas, energía y espacio · materia y materiales). *Geografía* (capitales · continentes, océanos y montañas · mapas y relieve). *Lengua* (sinónimos · antónimos · gramática y ortografía). *Mis preguntas* (the host's CSV). Every built-in question and label is in Spanish.
2. **Bank size.** Each hand-written topic has 50 questions in total, about 17 per level, so 450 across the 9 topics. Math is generated and unlimited.
3. **Levels.** *Fácil*, *Medio* and *Difícil* (roughly grades 5 to 8), picked once at session setup. Each hand-written question carries one level. *Medio* Math keeps today's number ranges. *Fácil* uses about half the size and *Difícil* about four times, with one extra step in equations and fractions. The exact ranges live in `config.js`. A custom CSV ignores the level: every valid row is used. Each shop item asks at the host's level plus its step (`question_step_<item>` in `data/config.json`: SMG +0, Rifle +1, Sniper +2, Armour +0, Ammo +0), capped at *Difícil*: the better the weapon, the harder its question. The defuse uses the host's level.
4. **Storage.** One CSV per topic under `assets/questions/<subject>/`, in the same format as a host's upload (`question,right,wrong,wrong,wrong`) plus an optional 6th column with the level (`facil`, `medio` or `dificil`). The `question,a,b,c,d,N` form takes 1 to 4 or a to d in column 6, so the two never clash.
5. **A match deck.** One deck per match, built from the chosen subject, topics and level. It deals the next question, never the same one twice in a row, and never repeats a question until the pool is used up, then reshuffles. Each question has exactly 4 distinct, non-empty choices, shuffled on every draw.
6. **Wrong answers.** A wrong answer swaps in a new question at once. The missed question goes back into the deck 4 draws later, once only. Both numbers (`retry_gap`, `retry_max`) live in `config.js`. The card locks for `wrong_delay` (0.6 s) before the new question, and the lockout grows by `wrong_delay_growth` (×2) for each wrong answer in a row, up to `wrong_delay_max` (4 s), resetting on a right answer.
7. **Who draws.** Only the human player draws from the bank: one question per shop item, at that item's level, and one per defuse attempt. Bots never draw: they roll `bot_answer_right` and `bot_defuse_right`.
8. **Constraints.** No skipping or rerolling (cancelling a card returns the same question as the next draw). The game must work offline from a double-clicked file.
9. **Bad data.** A CSV row with fewer than 2 columns, a duplicate choice or an empty choice is skipped, and the session screen shows how many rows were skipped.

### States and Transitions

| State | Entered when | Leaves to |
|---|---|---|
| Not built | No match yet | Ready (match starts) |
| Ready | The deck is built | Question open (a card asks for one) |
| Question open | A buy or defuse card draws | Right (answered right), Wrong (answered wrong), Ready (card cancelled: the question returns as the next draw) |
| Right | A correct pick | Ready, and the card completes |
| Wrong | An incorrect pick | Question open with a new question, and the missed one is queued for retry |

### Interactions with Other Systems

| System | Data in | Data out | Owner of the interface |
|---|---|---|---|
| Session setup | Subject, topics, level, or the parsed CSV | Count of available questions shown per choice | Session setup owns the picker, the bank owns the counts |
| Buying | A request per shop item | A question with 4 choices and its topic label | The card owns presentation and timing, the bank owns content |
| Defusing | A request per defuse attempt, repeated until the bomb is defused or explodes | The same, with no pause on a wrong answer | Same |
| Results screen | None | The human's right and wrong counts | The results screen reads them |

## Edge Cases

*Data and files*
- **If a custom CSV has no valid rows**: Start stays blocked on the session screen, the skipped-row count is shown, and the previous subject stays selected.
- **If a custom CSV has fewer than 4 valid rows**: it is allowed, and the session screen warns "pocas preguntas: se repetirán". The deck reshuffles when the pool runs out, and the "never twice in a row" rule is dropped when the pool has only 1 question.
- **If a row has only a question and an answer**: the wrong choices are borrowed from other rows' answers. A row that still can't reach 4 distinct choices is skipped (numeric answers get nearby numbers instead).
- **If a row has a duplicate or empty choice, or the same question text appears twice**: the row is skipped (for a duplicated question, the first one is kept) and counted in the skipped total.
- **If a row has more than 4 choices**: the first 4 values after the question are the choices, and the extras are ignored.
- **If the file isn't UTF-8** (Excel often saves Spanish text as Windows-1252, which breaks á, é, ñ, ¿): the game detects the broken characters and decodes the file again as Windows-1252.
- **If a topic has no questions at the chosen level**: it falls back to the nearest level that has some, and the session screen shows the count actually available.

*During play*
- **If the player answers wrong several times in a row**: the lockout before the new question grows 0.6 s, 1.2 s, 2.4 s and is capped at 4 s. A right answer resets it. This applies to buys and defuses.
- **If the player cancels a buy card, steps away from a defuse, dies, or the buy time ends or the round ends while a card is open**: the card closes, the question is not counted as right or wrong, and the same question is the next draw.
- **If the player answers right just before buy time ends**: the purchase completes. A pick after buy time ends is ignored and the card closes. (The current build lets an open buy card finish after the gates open, which is a defect for the story to fix.)
- **If the player presses an answer while the wrong-answer lockout is running**: the press is ignored.
- **If `defuse_answers` is more than 1 and the player answers wrong**: the right answers already given are kept.
- **If a retry is due and the pool is smaller than `retry_gap`**: the retry comes as soon as one other question has been drawn.
- **If a question or choice is too long for the card**: the question wraps to 3 lines then shrinks to a minimum of 18 px, and a choice shrinks to a minimum of 14 px. Anything still too long is cut with "…".
- **If a new match starts or the game returns to the session screen**: the deck is rebuilt and the retry queue is cleared.

## Dependencies

| Depends on (upstream) | Kind | Interface |
|---|---|---|
| Session setup | Hard | Subject, topics and level chosen on the session screen, or the parsed CSV |
| Question data (`assets/questions/<subject>/<topic>.csv`) | Hard for Ciencias, Geografía, Lengua | Read once when the match is built. Matemáticas needs no files |
| Seeded random `rng()` | Hard | Every shuffle and draw uses it, never `Math.random`, so a seed replays the same match |
| `config.js` values | Hard | `retry_gap`, `retry_max`, `wrong_delay`, `wrong_delay_max`, plus the Math range per level |
| Custom CSV upload | Soft | Only used when the host picks *Mis preguntas* |

| Depended on by (downstream) | Kind | Interface |
|---|---|---|
| Buying | Hard | Asks for one question per shop item |
| Defusing | Hard | Asks for questions until the bomb is defused or explodes |
| Session setup | Soft | Shows the number of questions available for the current choice |
| Results screen | Soft | Reads the human's right and wrong counts |

- **Bots** have no dependency on the bank: they roll `bot_answer_right` and `bot_defuse_right`.
- **Bidirectional check:** no GDDs exist for Buying, Defusing, Session setup or Results (at `minimal` the brief is their design record), so their side can't be verified. Those systems must list the bank as an upstream dependency if they get GDDs.

## Visual/Audio Requirements

- **Question card:** a large, high-contrast cream panel slides up over the 3D view, with the topic label at the top right and 4 numbered choices. It never covers the bomb timer on a defuse.
- **Right answer:** the chosen choice turns green with the existing chime. **Wrong answer:** it turns red, the card shakes and the low buzz plays. A thin bar under the card shows the lockout counting down, so the player sees why presses are ignored.
- **Defuse signature detail** (from the brief): a wrong answer makes the bomb's lights flash red and the beeps louder.
- **Spanish text:** the game font must draw á é í ó ú ñ ü ¿ ¡ correctly on cards, the session screen and results.
- There is no art bible yet: the brief's Look applies.

## Game Feel

- A key press or click shows its feedback within 100 ms, and keys 1 to 4 and clicks both work.
- A right answer completes the purchase after the 0.35 s confirmation, and a new question slides in within 0.2 s, with no fade or pause.
- On a defuse, the bomb timer is always visible. Guessing must feel slower than thinking, which is the job of the growing lockout.

## UI Requirements

- **Session screen (all labels in Spanish):** subject list, topic checkboxes, a *Fácil / Medio / Difícil* selector, the count of questions available for the current choice, a *Subir CSV* button, the skipped-row message and the few-questions warning.
- **Buy menu:** each row shows the level of the question that item asks ("pregunta Fácil / Medio / Difícil").
- **Question card:** up to 3 lines of question, 4 choices with number badges, the topic label and the question's level, the bomb timer (defuse only), the lockout bar and a cancel hint (B for a buy, E for a defuse).
- **Results:** the human's right and wrong counts.
- **Accessibility:** right and wrong are shown with text ("Correcto" / "Incorrecto") and an icon, never by colour alone.

## Cross-References

None — this system references no other GDD.

## Acceptance Criteria

*No Formulas section at this tier: the numbers are stated inline in Core Rules.*

1. **Subjects (rule 1).** GIVEN the session screen, WHEN the host opens each subject, THEN Matemáticas lists 5 topics, Ciencias 3, Geografía 3 and Lengua 3, plus *Mis preguntas*, and every built-in label and question is in Spanish.
2. **Bank size (rule 2).** GIVEN each of the 9 hand-written topic files, WHEN its rows are counted, THEN it has 50 valid questions with at least 16 at each level.
3. **Levels (rule 3).** GIVEN level *Fácil* on a hand-written topic, WHEN 15 questions are drawn, THEN every one is tagged *Fácil*. GIVEN Matemáticas sumas y restas at *Fácil* and then *Difícil*, WHEN 20 questions are drawn at each, THEN every operand is within that level's range in `config.js`.
4. **CSV shapes (rule 4).** GIVEN one file for each shape (`question,answer` · `question,right,wrong,wrong,wrong` · `question,a,b,c,d,N`), WHEN uploaded, THEN every row loads and the right answer is marked correctly.
5. **Deck (rule 5).** GIVEN a pool of 20 questions, WHEN 20 questions are drawn with no wrong answers, THEN each appears exactly once and none appears twice in a row. A question seen twice shows its 4 choices in a different order at least once in 10 trials.
6. **Missed questions (rule 6).** GIVEN a question answered wrong, WHEN the next 6 questions are drawn, THEN the missed one shows up once, as the 4th draw after the miss, and never a second time.
7. **Growing lockout.** GIVEN 3 wrong answers in a row, WHEN timing each lockout, THEN they are 0.6 s, 1.2 s and 2.4 s, the next ones capped at 4 s, and a right answer resets it to 0.6 s.
8. **Who draws (rule 7).** GIVEN a match where bots buy gear every round, WHEN the draws are counted, THEN only the human's shop items and defuse attempts used the deck.
9. **No rerolling (rule 8).** GIVEN a question on a buy card, WHEN the player cancels with B and opens the same item, THEN the same question appears.
10. **Offline (rule 8).** GIVEN the game opened by double-clicking `index.html`, WHEN a match starts on Ciencias, THEN questions load and the console shows no network error.
11. **Bad rows (rule 9).** GIVEN a CSV of 10 rows with 3 invalid (an empty choice, a duplicate choice, one column), WHEN uploaded, THEN 7 load and the screen says 3 were skipped.
12. **Accents.** GIVEN a Windows-1252 CSV containing "¿Cuál es la capital de España?", WHEN uploaded, THEN the question shows exactly that, with no broken characters.
13. **Level fallback.** GIVEN a topic with no *Difícil* questions, WHEN the host picks *Difícil*, THEN that topic uses its nearest level and the session screen shows the real count.
14. **No valid rows.** GIVEN a CSV with no valid rows, WHEN uploaded, THEN Start is blocked and the skipped count is shown.
15. **Buy time ends.** GIVEN a buy card open, WHEN the buy timer reaches 0, THEN the card closes, nothing is bought and the same question is the next draw. A right answer given before it reached 0 still completes the purchase.
16. **Defuse under the timer.** GIVEN a planted bomb and the defuse card open, WHEN the player answers wrong, THEN the bomb timer keeps running through the lockout and a new question appears.
17. **Results.** GIVEN a match with 5 right and 3 wrong answers by the human, WHEN the results screen shows, THEN the counts read 5 and 3.
18. **Harder questions for better weapons (rule 3).** GIVEN host level *Fácil*, WHEN the buy menu opens, THEN SMG shows "pregunta Fácil", Rifle "pregunta Medio" and Sniper "pregunta Difícil"; and a Sniper card's question is a *Difícil* one.

## Open Questions

Owner: the game's author. Target: before `/dev-story` on story 001, unless noted.

1. **Interface language.** Putting all menus, HUD and hints into Spanish is a game-wide change outside this system and outside story 001. Do it as a separate change after play ("change it after play"), before the Spanish content is checked in context.
2. **Offline loading.** A page opened from disk cannot fetch the CSV files, so a build step has to pack the topic CSVs into one script. This is an implementation decision for the story.
3. **Who writes and checks 450 Spanish questions?** Accuracy and grade fit need a teacher's eye. Suggested: a draft first, then a teacher reviews it.
4. **Tuning.** The level split, the Math ranges per level and the lockout numbers are starting values, tuned from play.
5. **Registry.** `retry_gap`, `retry_max`, `wrong_delay` and `wrong_delay_max` are registry candidates.
