# TD-017 part C: mode traits table — run and observe (2026-11-20)

Change: `MODE_INFO` (name + traits bomb, teams, coop, solo) and `nextMode()` in src/net/protocol.ts; main.ts, lobby.ts,
room.ts, teacher.ts and mirror.ts ask for the trait instead of comparing the mode's name; each mode's texts are tables
(`ROOM_RULES`, `SESSION_RULES` in main.ts, `SUMMARY` in teacher.ts). The 8 moved texts were checked character for
character against the committed main.ts. profesor.html is unchanged (its 5 checks stay; agreed scope).

| Shot | What it shows | Result |
|---|---|---|
| 01-04 | Session screen, mode button cycled: Bomba → Free for All → Duelo → Oleadas | same order as before; long names a size smaller; button unlit only in Bomba; zones on the map only in Bomba; each mode's rule line |
| 05-12 | Teacher picks each mode and "Repartir", 2 students (Ana, Beto) | Oleadas: 1 group, 4 seats; FFA: 1 group, 8 seats; Duelo and Bomba: 2 teams of 4; student room screen shows "Modo: <name>" (no teams) or "Tu equipo" (teams) and the mode's rule line |
| 13-14 | An Oleadas room started | teacher: "Antes de la oleada 1 (pausa) · En pie 4 de 4"; student in the match (mirror): wave HUD, buy menu |

Page errors: 0 (session screens and the class run). Tests: typecheck 0, 18 unit (the 4-mode replay identical), smoke @boot pass.

Seen, not caused by this change: the class waiting room draws the map with Bomba's zones in every mode (the same in
story-025-cooperative-waves/10-alumno-espera-oleadas.png, before the change).
