# Game Brief: Solve or Boom

## In your words
Develop a shooter game, in the style of Counter-Strike, where one team defends and the other attacks. At their respective bases, players can acquire various weapons and ammunition; however, obtaining these items requires providing the correct answer to a mathematical problem—the game is designed with an educational objective. In this context, the team defending or protecting the bomb can only deactivate it by solving a mathematical operation. The game should be adaptable to different subjects, featuring an extensive database of questions for each one. The person creating a game session can select the specific subject and content, or alternatively, upload a custom list of questions and answers to be used.

1. View: you pick
2. Feel: you pick
3. Rounds: you pick
4. Subjects: csv files
5. Answering: multiple choice but if the answer si wrong the question must be change
6. Look: you pick
7. How hard: you pick
8. Scope: you pick
After play: the bomb does not appear in the game
After play: este juego tiene un fin multiplayer para jugar en un curso completo (red del aula con el PC del profesor como servidor; varias salas de 4 contra 4; el profesor configura la sesión, ve resultados por estudiante y controla la partida; también debe existir el modo single player para jugar contra bots; los estudiantes entran solo con un nombre)

**Pitch:** A team bomb shooter where every gun, every ammo clip and every defuse costs one right answer.

**Genre:** first-person team shooter (attack / defend the bomb) + educational quiz

**Controls:** WASD move, mouse aim, click shoot, R reload, Shift sprint, X walk, C crouch, Z prone, Space jump (all rebindable in Controles), B buy menu in your base, 1–4 or click to answer, E hold to plant / E to open the defuse question when defending. *(guessed)* On phones and tablets: left stick, drag to aim, on-screen buttons.

**Question:** Do quiz questions under pressure (buy timer, ticking bomb) make you *want* to answer fast and right — instead of feeling like homework bolted onto a shooter?

**Hooks:** Your arsenal is only as good as your answers; the defuse is a multiple-choice question answered while the bomb ticks — a wrong answer swaps in a new question and the clock keeps running.

**Intent:** *payoff builds* (economy and guns grow over the rounds) *(provisional)*

## Look and references
- Look: bright, chunky low-poly arena — clean blocky shapes, soft sunlight, orange attackers and teal defenders, big painted **A** and **B** floor letters at the bomb sites; flat-coloured crates, walls and doorways with darker edges; the question card is a large high-contrast panel that slides up over the view; signature detail: the bomb's lights flash red and the timer ticks louder on a wrong defuse answer. Every figure drawn, no emoji, no plain circles. *(provisional)*
- References: Counter-Strike (attack/defend rounds, buy phase, two bomb sites, economy — not its name, maps, art or UI).
- View: 3D · Camera: first-person, gun visible lower right *(provisional)*

## First minute
The menu opens on a session screen: pick a subject (Math preselected) and its contents (e.g. multiplication + fractions), or upload a CSV. Press Start. You spawn in the attacker base with 3 bot teammates; a 20-second buy phase; a hint says "Press B to buy". You click the SMG — a question card with 4 choices appears; right answer, chime, the SMG is in your hands. A wrong pick on ammo: the card shakes and a new question replaces it. The doors open; you push toward site A with your team, trade first shots with defender bots, and plant by holding E — if a defender bot reaches the bomb, you watch its defuse bar stall as it "thinks".

## Challenge
Round 1 is fair: everyone on pistols, bots react slowly. By round 3 the bots have bought rifles and the sniper bot holds long lanes, so every buy question matters. A lost round costs money — smaller budget, fewer questions' worth of gear next round — never the match. At halftime sides swap and on defence you must answer the defuse question before the 40-second bomb timer runs out. *(provisional)*

## Core loop
- Buy phase: answer questions to buy weapons, armour and ammo with your money
- Fight: attack a site and plant, or hold sites and defuse by answering under the timer
- Round result + kills give money → better gear next round
- Swap sides at halftime; first team to 4 round wins takes the match

## Goal & fail state
- Win 4 rounds before the enemy team does. A round is lost when your whole team is down, when the bomb explodes (defenders), or when time runs out / the bomb is defused (attackers). *(provisional)*

- [x] Session screen: pick subject and contents, or upload a CSV of questions (question, 4 choices, correct answer)
- [x] Built-in question bank: Math (arithmetic, multiplication tables, fractions, simple equations) generated so it never runs out, plus Science, Geography and English vocabulary banks for ages 10–14 *(provisional)*
- [x] Buy menu in each base: every item asks a multiple-choice question; a wrong answer swaps in a new question
- [x] Defuse = a multiple-choice question under the bomb timer; a wrong answer swaps in a new question while the timer runs
- [x] The bomb is easy to find: carried on the carrier's back, in your hands while you plant, and once planted or dropped a glowing beacon plus an on-screen BOMB marker with the distance
- [x] Team of 4 vs 4 (you + 3 bot teammates vs 4 bots, named as bots) with 3 bot roles: rusher (SMG), rifleman (holds middle distance), sniper (holds long lanes); bots buy on their own
- [x] Ammo and reload: magazine and reserve beside health and armour; an empty gun clicks
- [x] Mouse-look with sensitivity setting, hit markers, distinct guns (pistol, SMG, rifle, sniper), hurt direction marker
- [x] One original map with two bomb sites (A and B), two bases, 3 lanes
- [x] Map selector on the session screen: Pequeño (the original, 108×72 m), Grande (1.5×), Patio and Pasillos (162×108 m), each with its own round time; maps are data in data/maps/
- [x] Controls menu (pause and session screen) to rebind every action, saved in the browser; sprint (Shift, no shooting), walk (X), crouch (hold C), prone (toggle Z) and jump (Space), each with its costs and benefits in data/config.json and a HUD stance indicator
- [x] The whole interface in Spanish: HUD, hints, messages, kill feed, round ends, pause, results, roles, weapons and shop (the game keeps its name, Solve or Boom)
- [x] Layered gun sounds per weapon (bots positional by direction and distance, reload in steps, a limiter) and smarter bots: they take cover and peek, flank in two groups and enter together, hear your footsteps and shots and investigate, vary routes, check corners and keep apart
- [x] Round flow: buy phase, round timer, plant/defuse, money rewards, halftime swap, final score with each player's questions right/wrong
- [x] Simulation split from drawing: the match runs without a screen (so a server can run it), the single-player game plays exactly as before
- [x] Classroom server: a program the teacher opens on their PC (`npm run aula`) that serves the game on the school network, shows the address to join, and runs several 4 v 4 rooms at once with the server as the authority
- [x] Student join: a student types a name, enters the room the teacher assigned and sees their team; empty seats are filled with bots
- [x] Networked play: each student sends their inputs and gets the match state back; each student answers their own buy and defuse questions, the server checks the answers and keeps the money
- [x] Teacher screen: set up the session (subject, level, contents or CSV, map), split the class into rooms and teams, and start, pause and end each room
- [x] Results per student: right and wrong answers per student and per topic, exportable to CSV, kept only on the teacher's PC; the main menu offers "Un jugador (contra bots)" and "Clase (multijugador)"
- [x] Weapons and effects (polished block style): first-person guns with a recognisable shape, muzzle flash, tracers, impact sparks and the bomb's explosion; still offline and smooth on school PCs
- [x] Characters (polished block style): more detailed block models, distinct per side, animated when walking, crouching, prone and dying
- [x] Scenery (polished block style): walls and floor with texture and relief, varied crates and props, clearly marked A and B sites, a gradient sky
- [x] Two-floor map: at least one new map with a ground floor and a first floor joined by stairs or ramps; shooting between floors, the minimap and the bots handle the height
- [x] Aim with every gun: hold right click to aim down the sights with every gun, each with its own zoom (pistol and SMG light, rifle medium, sniper strong); only the sniper shows the black scope circle, the others aim through their own sights
- [x] Mobile play (Android and iOS, in the phone or tablet browser, landscape): touch controls — a left stick to move, drag on the right half to aim, buttons to fire, jump, crouch, reload, buy and plant/defuse; question cards, menus and the session screen work by touch; a lighter graphics level on phones; both modes, and a student joins the class by opening the teacher's address in the browser
- [x] Shooting fixes (from the classroom playtest): an aimed shot and its tracer leave from the sights, not the shoulder; shots are not stopped by a crate's edge when the shooter stands close to it; the spread of every gun, standing and moving, is tightened to what players expect
- [x] Combat and economy (from the classroom playtest): a money bonus for the first kill of each round; a kill counter (on PC a players table with kills and deaths while holding Tab, on phones a small number with a kill icon under the minimap); medkits to buy that heal; dead players drop a medkit and ammo that others can pick up; a melee hit (fists or the gun) when out of bullets
- [x] Match options (from the classroom playtest): a longer buy phase that the teacher and the single-player session screen can set; firing can be bound to the left mouse button in Controles; a friendly-fire option; bot difficulty levels in single player
- [x] Streak rewards (option on the teacher screen and the single-player session screen, on by default): right answers in a row during a match earn rewards — 3: Escudo (+50 armour at once); 5: the ability Cazador, kept and used with its own key or touch button (10 s of enemies on the minimap and +30 % speed); 8: the secret weapon Rifle dorado (more damage and accuracy, a gold look, kept until death), then the streak starts again; a wrong answer resets the streak, dying does not; the HUD shows the streak and the next reward; bots earn none; values in data/config.json
- [x] Free for All mode (option "Modo de juego: Bomba / Free for All" on the teacher screen and the single-player session screen): everybody against everybody, no bomb, no teams and no halftime; the match lasts a set time and the winner is whoever gets the most kills, with a live kills table and a podium at the end; dying is not final — to respawn the player answers a multiple-choice question from the question bank, and a wrong answer gives another question after a short wait; the buy menu (with its question) opens at each respawn and money comes from kills; bots also respawn; works in the class server and in single player; times, waits and money in data/config.json
- [x] Smooth weapon models (replaces the block guns of feature "Weapons and effects"): every gun — pistol, SMG, rifle, sniper and the Rifle dorado — is modelled in code with rounded shapes instead of boxes: round barrels and muzzles, bevelled edges, a shaped grip, curved magazine and stock, a round scope on the sniper, and metal and wood materials with shine; the same model in first person and in every player's and bot's hands (smaller there); each gun keeps its recognisable silhouette and colour accent, the sights still line up with the crosshair when aiming; still offline and smooth on school PCs and phones
- [x] Free for All map and spawn changes: in Free for All the map is shown and played without the team start zones, the bomb sites A and B and the start gates (the minimap too), and nothing ties a player to a zone; players start and respawn on any walkable cell of the map, at least a set distance from the living players (the farthest one if none is far enough); a player who is buying at the start of the match or at a respawn is invisible and untouchable (not shown to others, no name or minimap dot, cannot be hurt, cannot move or shoot) until they close the shop or the time runs out, and then appears visible and vulnerable; the shop can also be opened at any time during the match with the buy key or button, and that purchase leaves the player visible and vulnerable; the Bomba mode is unchanged; works in the class server and in single player; values in data/config.json
- [x] CSV template on the teacher screen: a "Descargar plantilla" button next to "Subir CSV" saves `plantilla-preguntas.csv` with a header and example rows for every accepted format, plus a short Spanish explanation of the columns, so teachers know how to write their questions
- [x] Rooms and student view follow the game mode: in Free for All the teacher screen and the students show no teams (no Equipo 1/2, no team score, no team column, no "tu equipo"), and the class is spread into rooms without teams; Bomba keeps teams as today

## Your systems
- buying weapons and ammo with answers · in the slice
- defusing the bomb with a question · in the slice
- attack and defend teams · in the slice
- subjects and contents to pick · in the slice
- extensive question bank per subject · thin stand-in *(guessed)*
- upload custom questions (CSV files) · in the slice
- classroom multiplayer on the school network, the teacher's PC as the server · in the slice

## Keep
-

## Avoid
- Counter-Strike's name, maps, art and UI
- A wrong answer keeping the same question (a wrong answer must change the question)

## Out of scope
- Online play over the internet (from home): needs a hosted server and a monthly cost; built instead: classroom play on the school's local network (LAN), the teacher's PC as the server
- Student accounts and passwords: students enter with a name only, and no personal data is stored
- More maps and a campaign: grow it
- Weapon upgrades and mods: add it as a feature
- Sound shaped by walls and rooms: add it as a feature
- Teacher accounts and saved class results: grow it *(guessed)*

## Build order
1. The slice: one full match on one map — session screen (subject/contents or CSV) → buy with questions → fight bots → plant / defuse with a question → halftime swap → first to 4 round wins, final score.
2. Grow the built-in question banks per subject and content.
3. Feel pass: gun sounds, hit feedback, smarter bot routes.
4. Classroom multiplayer, in this order: simulation split from drawing → classroom server → student join → networked play → teacher screen → results per student (single player against bots stays).

---
**Kill condition:** if players skip buying to avoid questions, or the defuse question feels like a pause instead of tension, after two tuning rounds. *(guessed)*

**Who it's for / what they feel:** students 10–14 (and their teachers) who feel clever and clutch when a right answer wins the round. *(provisional)*

**Games you love / don't:** Counter-Strike (the attack/defend bomb rounds and buy economy).
