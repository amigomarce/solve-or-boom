# Story 030: the bounded class run (2026-11-20)

Classroom server (`npm run aula`, port 8099), headless Chrome, a teacher page and one browser page per student. Only for the
rotation run, `ffa_duration` was 20 s (data/config.json) and `rematch_vote_s` 10 s (data/aula.json); both were put back to
300 and 30 afterwards and the server and class builds were rebuilt with the real values.

## Rotation run: 2 students (Ana, Beto) in one Free for All room, Pequeño

Marked: Matemáticas, Ciencias and `plantilla-preguntas.csv`; `otras.csv` loaded, not marked (both CSV files started marked
when uploaded and the script unmarked `otras.csv`). The room card, each match:

| Match | Card "Asignatura → Próxima" |
|---|---|
| before the first start | todavía ninguna → Matemáticas |
| 1 | Matemáticas → Ciencias |
| 2 | Ciencias → Mis preguntas (plantilla-preguntas.csv); a second room started now: Matemáticas → Ciencias |
| 3 | Mis preguntas (plantilla-preguntas.csv) → Matemáticas |
| 4 | Matemáticas → Ciencias; `plantilla-preguntas.csv` removed with "Quitar" during this match (the list then: Matemáticas, Ciencias, Geografía, Lengua, otras.csv) |
| 5 | Ciencias → Matemáticas (the removed CSV left the rotation) |
| then | Matemáticas unmarked, only Ciencias marked: Ciencias → Ciencias |

Page errors 0, `terror` frames 0, server log lines with "error" or "exception": 0.

The first run of this scenario found a server crash: `TypeError: session.marked.get is not a function or its return value is
not iterable` when the label of a room's current entry was asked for an entry that was no longer marked (removing the CSV;
unmarking Matemáticas while it was a room's current subject, which the page then showed as refused). The programmer fixed it
(each room's current label is kept when it starts, `lastLabel` in src/server/teacher.ts); the run above is after the fix.

## Results with two subjects

A second run (real durations): one room played Matemáticas, the teacher ended it with "Terminar", unmarked Matemáticas and
pressed "Repartir"; the new room's first match was Ciencias. "Exportar CSV" (Todo), as saved in `resultados-exportados.csv`:

```
"Alumno";"Sala";"Materia";"Tema";"Nivel";"Correctas";"Incorrectas"
"Ana";"Sala 5";"Matemáticas";"Multiplicación y división";"Medio";0;1
"Ana";"Sala 5";"Matemáticas";"Sumas y restas";"Medio";0;1
"Ana";"Sala 6";"Ciencias";"Fuerzas, energía y espacio";"Medio";1;0
"Beto";"Sala 5";"Matemáticas";"Multiplicación y división";"Medio";1;1
"Beto";"Sala 6";"Ciencias";"Seres vivos y el cuerpo";"Medio";0;2
```

Page errors 0, `terror` 0, server errors 0. The teacher page's results tables (`07-…`) list topics of both subjects but do not
show the subject itself; only the exported CSV has the "Materia" column.

## Found on the way, not caused by this story

In the second and later matches of the same teacher room (after the vote restart, and also after "Terminar" and a hand
"Iniciar"), a student's buy presses do not reach the server: the buy menu is open on screen, but no question card opens and no
answer is recorded (`08-alumno-tras-responder-en-ciencias.png`: still $1250, no card). The same happens on the code before
story 029 (dac5da0, "Terminar" then "Iniciar"), so it predates stories 029 and 030. Only a room's first match records answers.
