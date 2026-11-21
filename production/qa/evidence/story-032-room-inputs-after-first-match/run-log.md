# Story 032: the bounded class run (2026-11-21)

Classroom server (`npm run aula`, port 8099), headless Chrome, a teacher page and one page per student (Ana, Beto), one
teacher room. Only for the run, `ffa_duration` was 20 s (data/config.json) and `rematch_vote_s` 10 s (data/aula.json); both
were put back afterwards and the server and class builds were rebuilt with the real values.

**Cause (confirmed in the code):** the student's page counts its input seq from 0 in every match (`src/net/mirror.ts`), but the
server kept each seat's last seq (`lastSeq`, `ack`) across a room's matches and dropped every input not above it
(`queueInput`, `src/server/room.ts`); only a reconnect reset it. **Fix:** `resetInputs(room)` in `src/server/room.ts`, called
when a room builds its next match (`rebuildMatch`, the path of Iniciar, Iniciar todas and the vote restart) and in
`stepRoom`'s rematch branch.

## Buying (one buy per student: the question card opens and the answer is recorded in the teacher's results)

| Match | How it started | Ana | Beto |
|---|---|---|---|
| Free for All 1 | Iniciar | recorded | recorded |
| Free for All 2 | vote restart (story 029) | recorded | recorded |
| Free for All 3 | Terminar, then Iniciar | recorded | recorded |
| Free for All 3, Beto reloaded his page and rejoined | — | — | recorded |
| Bomba 1 and 2 | Iniciar | recorded | recorded |
| Duelo por equipos 1 and 2 | Iniciar; the 2nd with Iniciar todas and one more room (bots only) added | recorded | recorded |
| Oleadas cooperativas 1 and 2 | Iniciar | recorded | recorded |

Exported (Todo): Ana 9 answers, Beto 10, across the matches (`resultados-exportados.csv`; the export adds a student's answers by
topic and level, so it has no per-match rows). Page errors 0, `terror` 0, server log errors 0.

## Moving

A second run, one student: in match 1 and in match 2 (vote restart) of the same room, holding W and D for 2 s and Left for
0.6 s moved and turned the player: match 1 (43.5, 64.5) → (53.6, 60.6), yaw −0.42 → 1.02; match 2 (73.5, 34.5) → (64.7, 33.4),
yaw 1.74 → 3.18 (`05-alumno-se-mueve-en-partida-2.png`). Shooting was not checked on its own (it travels in the same input
message as movement and buying).

## Not checked

Several rooms each with students (the second room had bots only); shooting on its own; a phone.
