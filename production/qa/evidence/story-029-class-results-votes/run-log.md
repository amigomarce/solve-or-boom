# Story 029: the bounded class run (2026-11-20)

Run with the classroom server (`npm run aula`, port 8099, headless Chrome, a teacher page and one browser page per student).
Only for this run, `ffa_duration` was 20 s (data/config.json) and `rematch_vote_s` 10 s (data/aula.json) so the matches end in seconds;
both were put back to 300 and 30 afterwards (the server and class builds were then rebuilt with the real values).
Times are in ms from the script's polling. The numbers below are what the script printed.

## Scenarios A to E: 5 students (Ana, Beto, Caro, Dani, Eva), one Free for All room, Pequeño

| Scenario | What was done | What was seen |
|---|---|---|
| A: nobody votes | start; the match ends by itself | results after 20063 ms; teacher card "Votación: quedan 9 s · Listos 0 de 5 · Sin votos · Siguiente: Free for All en Pequeño"; the room started again after 8582 ms: `ffa/pequeno`, "En marcha", "Partidas jugadas: 1" |
| B: vote, one reloads | 3 students vote Duelo por equipos and Patio, 1 votes Bomba, Eva reloads her page | card "Votación: quedan 6 s · Listos 0 de 4 · Votos: Bomba 1 · Duelo por equipos 3 · Patio 3 · Siguiente: Duelo por equipos en Patio"; restart after 5317 ms: `duel/patio`, two teams of students, "Partidas jugadas: 2". Eva's reload landed on the entry screen with her name already filled in; the script did not press Enter, so she stayed "Sin conexión" and, as the match restarted, kept her seat (a bot played for her; teacher page capture `07-…` lists her "Sin conexión" among the five students) |
| C: everybody ready | the Duelo match ends; all 5 press Enter | the match started 585 ms after the first Enter, `duel/patio` (nobody voted, so the mode and map just played) |
| D: teacher presses Terminar | during the Duelo match | the room "Esperando", "terminada por el profesor"; the student on the results screen with "Volver a la sala (Enter)" and no vote strip; 11 s later still waiting, no restart |
| E: switch off | "Reinicio automático" off, Iniciar, the match ends by itself | the room "Esperando", "Última partida: Ganó Bot 4 con 1 baja · partida terminada", no vote line; 12 s later still waiting. Iniciar played Free for All on Pequeño (the session's mode and map), not Duelo on Patio |

Page errors 0, `terror` frames 0, server log lines with "error" or "exception": 0.

## Reload with the saved name (the valid reload run)

2 students (Juan, Kira), one Free for All room. The match ended after 20159 ms; Kira reloaded her page and pressed Enter (the name field was prefilled
with "Kira"): she came back to the waiting screen with the vote strip ("Siguiente partida en 8 s", "Listos: 0 de 2"), the teacher card said
"Votación: quedan 8 s · Listos 0 de 2 · Sin votos", and the room started again after 7355 ms. Page errors 0.
Screenshot: `11-alumna-recarga-y-vuelve-a-la-votacion.png`.

Note on the first two reload attempts: in scenario B the script reloaded Eva's page and never pressed Enter, so it showed the entry screen
(its screenshot, `04-alumno-recarga-durante-votacion.png`, was deleted at close because it shows no vote). A second run typed the name again
into the field that was already filled and joined as "GalaGala", a new student. Both were faults of the script, not of the game; no screenshot
of the second was kept. The run above, with Enter only, is the valid one.

## Not exercised in this run

The server's refusal of invalid votes (bad_vote and a strike), a tie between votes, "Repartir automáticamente", the session's other options on
restart, a vote cast before a reload coming back, and "Quitar sala" during a vote. They are for a playtest.
