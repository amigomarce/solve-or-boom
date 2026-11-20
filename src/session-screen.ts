// The screens around a match: the session screen, the menus, the results, the class join and waiting screens and the
// figures, drawn on the canvas. Moved out of src/main.ts (TD-016, docs/tech-debt-register.md); it reads the game's state
// from main.ts when it draws, never while the modules load.
import * as QUESTIONS from './questions';
import * as THREE from 'three';
import { CONFIG, tune } from './config';
import { LEVELS, type Level } from './game/types';
import { CELL, MAP, MAPS, MAP_IDS, MH, MW } from './game/map';
import { ROLE_NAME, STEP, isDuel, isFfa, isWaves, squadName } from './game/match';
import { buttons } from './input';
import { TOUCH } from './touch';
import { bind, keyName } from './keys';
import { type ButtonOpts, FONT, H, W, button, clear, clip, ctx, rr, text, wrapText } from './screen';
import { type GameModeId, MODE_INFO, SEATS_PER_TEAM } from './net/protocol';
import { CLASS_MODE, NAME_MAX, ROOM_STATE, SUBJECT_LIST, _v, aula, menuSel, net, project, resultsCountdown, session, state, step, titleT } from './main';
import { SIDE_CSS, SIDE_HEX, camera, lam, makeBomb, makeSoldier, poseSoldier, renderer, setSide, viewGuns, world } from './scene3d';

/** Each mode's rules in one line under a class room's seats (story 023, 024, 025). */
const ROOM_RULES: Record<GameModeId, string> = {
  bomb: 'Equipo 1 y Equipo 2 cambian de lado en el descanso. Los sitios libres los juegan bots.',
  ffa: 'Todos contra todos, sin equipos: gana quien tenga más bajas. Los sitios libres los juegan bots.',
  duel: 'Duelo por equipos: gana el equipo con más bajas; si caes, responde para volver. Los sitios libres los juegan bots.',
  waves: 'Oleadas cooperativas: todos juntos contra oleadas de bots; pierden cuando caen todos. Los sitios libres los juegan bots.',
};
/** Each mode's rules in one line at the foot of the session screen (story 019, 024, 025); the durations come from the config. */
const SESSION_RULES: Record<GameModeId, () => string> = {
  bomb: () => `Tú y 3 compañeros bot contra 4 bots rivales. Gana quien llegue a ${tune.rounds_to_win} rondas; en el descanso se cambia de lado.`,
  ffa: () => `Free for All: tú contra 7 bots, todos contra todos y sin bomba. Gana quien tenga más bajas en ${Math.round(tune.ffa_duration / 6) / 10} min; si caes, responde para volver.`,
  duel: () => `Duelo por equipos: tú y 3 compañeros bot contra 4 bots rivales, sin bomba. Gana el equipo con más bajas en ${Math.round(tune.duel_duration / 6) / 10} min; si caes, responde para volver.`,
  waves: () => `Oleadas cooperativas: tú y 3 compañeros bot contra oleadas de bots enemigos, cada una mayor y más dura; sin bomba. Si caes, responde para volver en la siguiente; pierden si caéis todos.`,
};
// ---- Drawing: the session screen, results and figures -------------------------------------
export function flyover() {
  const a = titleT * 0.06, [rx, rz, fy] = MAP.view.flyover;
  camera.position.set(MW * CELL / 2 + Math.cos(a) * rx, fy, MH * CELL / 2 + Math.sin(a) * rz);
  camera.lookAt(MW * CELL / 2, 0, MH * CELL / 2);
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  for (const g of Object.values(viewGuns)) g.group.visible = false;
  renderer.clear(); renderer.render(world, camera);
}
/** The game's name in its three colours, centred on y. */
function drawLogo(y: number, size: number): void {
  ctx.font = `bold ${size}px ${FONT}`;
  const tw1 = ctx.measureText('SOLVE ').width, tw2 = ctx.measureText('OR ').width, tw3 = ctx.measureText('BOOM').width;
  let tx = W / 2 - (tw1 + tw2 + tw3) / 2;
  text('SOLVE', tx, y, size, SIDE_CSS.def, 'left'); tx += tw1;
  text('OR', tx, y, size, '#ffffff', 'left'); tx += tw2;
  text('BOOM', tx, y, size, SIDE_CSS.att, 'left');
}
/** The main menu (outside the teacher's server): "Un jugador (contra bots)" opens the session screen, "Clase (multijugador)" says how to join a class. */
export function drawMenu() {
  flyover();
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.55)'; ctx.fillRect(0, 0, W, H);
  drawLogo(74, 76);
  text('Responde bien para comprar tus armas. Responde bien para desactivar la bomba.', W / 2, 132, 22, '#f2f5fb');
  const items: [string, string, string][] = [
    ['solo', 'Un jugador (contra bots)', 'Juega en este equipo, sin conexión.'],
    ['clase', 'Clase (multijugador)', 'Juega con tu clase en el servidor del profesor.'],
  ];
  items.forEach(([id, label, sub], i) => {
    const y = 210 + i * 170, on = menuSel === i;
    button(340, y, 600, 100, label, id, { size: 34, fill: on ? '#e07a1c' : undefined, stroke: on ? '#fff3c4' : undefined });
    text(sub, W / 2, y + 128, 20, '#e4e9f4', 'center', 'normal');
  });
  text(TOUCH ? 'Toca un botón para empezar.' : 'Haz clic en un botón, o elige con Arriba / Abajo y pulsa Enter (teclas 1 y 2).', W / 2, 650, 18, '#e4e9f4', 'center', 'normal');
}
/** "Clase (multijugador)" outside the teacher's server: this page cannot reach the class, so it says to open the address the teacher shows. */
export function drawClassInfo() {
  flyover();
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.55)'; ctx.fillRect(0, 0, W, H);
  drawLogo(74, 76);
  text('Clase (multijugador)', W / 2, 132, 26, '#ffd06a');
  rr(240, 176, 800, 420, 16, 'rgba(14,19,30,0.92)', null);
  text('Para jugar con tu clase, abre en el navegador', W / 2, 224, 24, '#fff', 'center', 'normal');
  text('la dirección que muestra el profesor, por ejemplo:', W / 2, 258, 24, '#fff', 'center', 'normal');
  text('http://192.168.1.87:3000', W / 2, 318, 36, '#ffd06a');
  text('Escríbela en la barra de direcciones y entra con tu nombre.', W / 2, 378, 20, '#e4e9f4', 'center', 'normal');
  wrapText('Este equipo tiene que estar en la misma red (wifi) que el del profesor. Este archivo no se conecta solo: la clase la sirve el ordenador del profesor.', 700, 18)
    .slice(0, 3).forEach((l, i) => text(l, W / 2, 422 + i * 26, 18, '#aab4c8', 'center', 'normal'));
  button(W / 2 - 160, 516, 320, 56, TOUCH ? 'Volver' : 'Volver (Esc)', 'back', { size: 22 });
}
/** The join screen: the name field, Entrar, the refusal or connecting line, and the privacy line, over the map flyover. */
export function drawJoin() {
  flyover();
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.55)'; ctx.fillRect(0, 0, W, H);
  drawLogo(74, 76);
  text('Modo clase: entra con tu nombre', W / 2, 132, 24, '#f2f5fb');
  rr(340, 180, 600, 420, 16, 'rgba(14,19,30,0.92)', null);
  text('Tu nombre', 380, 222, 24, '#ffd06a', 'left');
  rr(380, 250, 520, 64, 10, '#0d1220', aula.busy ? '#5a6478' : '#ffd06a', 3);
  ctx.font = `bold 30px ${FONT}`;
  const nw = Math.min(480, ctx.measureText(aula.name).width);
  text(clip(aula.name, 480, 30), 400, 283, 30, '#fff', 'left');
  if (!aula.name) text('Escribe aquí tu nombre', 414, 283, 22, '#6f7a8e', 'left', 'normal');
  if (!aula.busy && titleT % 1 < 0.55) { ctx.fillStyle = '#ffd06a'; ctx.fillRect(402 + nw, 266, 3, 34); } // the blinking caret
  text('Letras, números, espacios y . _ - ( )', 380, 336, 15, '#aab4c8', 'left', 'normal');
  text(`${[...aula.name].length} / ${NAME_MAX}`, 900, 336, 15, '#aab4c8', 'right', 'normal');
  if (aula.error) wrapText(aula.error, 520, 18).slice(0, 2).forEach((l, i) => text(l, 380, 374 + i * 24, 18, '#ff9a8a', 'left'));
  if (aula.busy) button(380, 432, 520, 64, 'Conectando…', null, { size: 26, fill: '#3a4258', color: '#c8d2e6' });
  else button(380, 432, 520, 64, TOUCH ? 'Entrar' : 'Entrar (Enter)', 'enter', { size: 26, fill: '#e07a1c', stroke: '#7a3a08' });
  // a small padlock before the privacy line
  const lx = 380, ly = 552;
  ctx.strokeStyle = '#aab4c8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx + 8, ly - 4, 5, Math.PI, 0); ctx.stroke();
  rr(lx + 1, ly - 4, 14, 11, 2, '#aab4c8', null);
  text('Solo se pide tu nombre, y este navegador lo recuerda.', lx + 26, ly, 16, '#c8d2e6', 'left', 'normal');
  text(TOUCH ? 'Toca el recuadro, escribe tu nombre y pulsa Entrar para sentarte en una sala.' : 'Escribe tu nombre y pulsa Enter para sentarte en una sala.', W / 2, 650, 18, '#e4e9f4', 'center', 'normal');
}
/** The waiting screen: who and where the student is, the room's two teams seat by seat, the room's state, and Salir. */
export function drawWaiting() {
  flyover();
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.6)'; ctx.fillRect(0, 0, W, H);
  drawLogo(62, 60);
  const you = aula.you, room = aula.room;
  if (!you || !room) return;
  const [words, colour] = ROOM_STATE[room.state];
  text(words, W / 2, 116, 26, colour);
  // who and where
  rr(40, 146, 1200, 84, 16, 'rgba(14,19,30,0.92)', null);
  const roomNo = room.roomId.replace(/^sala-/, '');
  const info = MODE_INFO[room.mode];
  const waves = info.coop; // story 025: one panel of players (seats 0..3), the enemy seats are not shown
  const ffa = !info.teams; // story 023: with no teams (Free for All, Oleadas) the mode shows instead of a team, and one list of players
  const third: [string, string, number] = ffa ? ['Modo', info.name, 900] : ['Tu equipo', `Equipo ${you.team + 1}`, 900];
  ([['Tu nombre', you.name, 80], ['Sala', `Sala ${roomNo}`, 560], third] as [string, string, number][]).forEach(([k, v, x]) => {
    text(k, x, 172, 15, '#aab4c8', 'left', 'normal');
    text(clip(v, 420, 26), x, 204, 26, x === 80 ? '#ffd06a' : '#fff', 'left');
  });
  // Bomba: the two teams, 4 seats each. Free for All: one panel "Jugadores", the 8 seats in index order in two columns of 4.
  if (ffa) { rr(40, 246, 1200, 314, 16, 'rgba(14,19,30,0.92)', null); text('Jugadores', 64, 276, 24, '#ffd06a', 'left'); }
  for (let t = 0; t < (waves ? 1 : 2); t++) {
    const px = 40 + t * (ffa ? 600 : 610);
    if (!ffa) {
      rr(px, 246, 590, 314, 16, 'rgba(14,19,30,0.92)', null);
      text(`Equipo ${t + 1}`, px + 24, 276, 24, '#ffd06a', 'left');
      if (t === you.team) text('tu equipo', px + 566, 276, 16, '#aab4c8', 'right', 'normal');
    }
    (ffa ? room.seats.slice(t * SEATS_PER_TEAM, (t + 1) * SEATS_PER_TEAM) : room.seats.filter(s => s.team === t)).forEach((s, i) => {
      const y = 306 + i * 62, me = s.index === you.seat, human = s.kind === 'human';
      rr(px + 20, y, 550, 52, 10, me ? 'rgba(255,208,106,0.18)' : 'rgba(255,255,255,0.05)', me ? '#ffd06a' : null, 2);
      const ix = px + 50, iy = y + 26, c = human ? (me ? '#ffd06a' : '#e4e9f4') : '#6f7a8e';
      ctx.fillStyle = c;
      if (human) { // a person: head and shoulders
        ctx.beginPath(); ctx.arc(ix, iy - 7, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ix, iy + 15, 13, Math.PI, 0); ctx.fill();
      } else { // a bot: a square head with two eyes and an aerial
        rr(ix - 11, iy - 9, 22, 20, 4, c, null);
        ctx.fillStyle = '#1b2232'; ctx.fillRect(ix - 6, iy - 3, 4, 4); ctx.fillRect(ix + 2, iy - 3, 4, 4);
        ctx.fillStyle = c; ctx.fillRect(ix - 1, iy - 16, 2, 7);
      }
      text(human ? clip(s.name, 420, 22) : 'Bot', px + 80, iy, 22, human ? '#fff' : '#8a93a3', 'left', human ? 'bold' : 'normal');
      if (me) text('Tú', px + 552, iy, 18, '#ffd06a', 'right');
    });
  }
  if (aula.retry) {
    rr(340, 574, 600, 48, 12, '#4a3210', '#ffb366', 2);
    text(aula.retry, W / 2, 598, 20, '#ffe28a');
  } else text(ROOM_RULES[room.mode], W / 2, 598, 16, '#c8d2e6', 'center', 'normal');
  button(40, 642, 200, 56, 'Salir', 'leave', { size: 22 });
  if (room.state === 'ended') button(W / 2 - 230, 642, 460, 56, TOUCH ? 'Volver a la pantalla de entrada' : 'Volver a la pantalla de entrada (Enter)', 'again', { size: 22, fill: '#e07a1c', stroke: '#7a3a08' });
}
export function drawTitle() {
  flyover();
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.55)'; ctx.fillRect(0, 0, W, H);
  drawLogo(74, 76);
  text('Responde bien para comprar tus armas. Responde bien para desactivar la bomba.', W / 2, 132, 22, '#f2f5fb');
  button(1060, 24, 180, 48, 'Controles', 'controls', { size: 22 });
  button(40, 24, 180, 48, TOUCH ? 'Menú' : 'Menú (Esc)', 'mainmenu', { size: 22 });
  const custom = session.subject === QUESTIONS.CUSTOM;
  // 1. subject
  rr(40, 170, 330, 378, 16, 'rgba(14,19,30,0.9)', null);
  text('1. Asignatura', 64, 200, 24, '#ffd06a', 'left');
  SUBJECT_LIST.forEach((s, i) => {
    const on = session.subject === s;
    const label = s === QUESTIONS.CUSTOM ? QUESTIONS.CUSTOM_NAME + ' (CSV)' : QUESTIONS.SUBJECTS[s].name;
    button(60, 222 + i * 54, 290, 46, label, 'subj:' + s, { align: 'left', fill: on ? '#ffd06a' : undefined, color: on ? '#1b2232' : '#fff' });
  });
  if (!TOUCH) {
    text('Arriba / Abajo: asignatura', 205, 508, 15, '#aab4c8', 'center', 'normal');
    text('Izquierda / Derecha: nivel', 205, 530, 15, '#aab4c8', 'center', 'normal');
  }
  // 2. contents: the level, then the topics (or the custom file), then what that choice gives
  rr(390, 170, 450, 378, 16, 'rgba(14,19,30,0.9)', null);
  text('2. Contenido', 414, 200, 24, '#ffd06a', 'left');
  text('Nivel', 414, 242, 18, custom ? '#8a93a3' : '#fff', 'left');
  LEVELS.forEach((l, k) => {
    const on = !custom && session.level === l;
    button(482 + k * 112, 222, 104, 40, QUESTIONS.LEVEL_NAMES[l], custom ? null : 'level:' + l,
      { size: 18, fill: custom ? '#1b2232' : on ? '#ffd06a' : undefined, color: custom ? '#8a93a3' : on ? '#1b2232' : '#fff', stroke: on ? '#fff3c4' : undefined });
  });
  if (custom) {
    text('Un CSV propio no usa el nivel.', 414, 282, 15, '#aab4c8', 'left', 'normal');
    if (session.custom.length) {
      text(clip(session.customName, 400, 18), 414, 316, 18, '#9ff08a', 'left');
      session.custom.slice(0, 4).forEach((c, i) => text(clip(`${i + 1}. ${c.q}`, 400, 16, 'normal'), 414, 348 + i * 28, 16, '#c8d2e6', 'left', 'normal'));
    } else {
      wrapText(TOUCH ? 'Todavía no hay archivo. Sube un CSV con el botón de la derecha.' : 'Todavía no hay archivo. Sube un CSV con el botón de la derecha o suelta el archivo en esta ventana.', 400, 18)
        .forEach((l, i) => text(l, 414, 318 + i * 26, 18, '#fff', 'left', 'normal'));
    }
    if (session.custom.length > 0 && session.custom.length < 4) text('Pocas preguntas: se repetirán', 615, 508, 16, '#ffb366'); // above the count line (532)
  } else {
    const subj = QUESTIONS.SUBJECTS[session.subject];
    Object.entries(subj.topics).forEach(([id, name], i) => {
      const on = session.topics[session.subject].includes(id), by = 274 + i * 50;
      button(410, by, 410, 44, '', 'topic:' + id, {});
      rr(424, by + 8, 28, 28, 6, on ? '#ffd06a' : '#0d1220', '#ffd06a', 2);
      if (on) { ctx.strokeStyle = '#1b2232'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(430, by + 22); ctx.lineTo(436, by + 29); ctx.lineTo(447, by + 14); ctx.stroke(); }
      text(name, 466, by + 22, 19, on ? '#fff' : '#8893a3', 'left');
      if (!TOUCH) text(String(i + 1), 800, by + 22, 15, '#aab4c8', 'right', 'normal');
    });
  }
  const n = session.available;
  text(n === null ? 'Las preguntas de matemáticas se generan sin límite' : n === 1 ? '1 pregunta disponible' : `${n} preguntas disponibles`,
    615, 532, 16, '#e4e9f4');
  // 3. your own questions
  rr(860, 170, 380, 378, 16, 'rgba(14,19,30,0.9)', null);
  text('Tus preguntas', 884, 200, 24, '#ffd06a', 'left');
  button(880, 222, 340, 50, TOUCH ? 'Subir CSV' : 'Subir CSV (U)', 'upload', { size: 22 });
  // The accepted shapes: a format line is bold blue and never wraps (it has no spaces), so the long one is split by hand.
  const help: [string, boolean][] = [['Una pregunta por fila, en una de estas formas:', false], ['pregunta,respuesta', true],
    ['pregunta,correcta,incorrecta,', true], ['   incorrecta,incorrecta[,nivel]', true], ['pregunta,a,b,c,d,N  (N = la correcta)', true],
    ['Separador: coma, punto y coma o tabulador.', false], ['Con 2 columnas, las incorrectas salen de las respuestas de otras filas.', false],
    ...(TOUCH ? [] : [['También puedes soltar el archivo en la ventana.', false] as [string, boolean]])];
  let hy = 292;
  for (const [s, fmt] of help) for (const l of fmt ? [s] : wrapText(s, 336, 15)) {
    text(l, 884, hy, 15, fmt ? '#9fd8ff' : '#e4e9f4', 'left', fmt ? 'bold' : 'normal'); hy += 20;
  }
  if (session.status) wrapText(session.status, 336, 16).slice(0, 2).forEach((l, i) => text(clip(l, 336, 16), 884, 488 + i * 22, 16, '#ffe28a', 'left'));
  if (session.skipped > 0) text(session.skipped === 1 ? '1 fila omitida' : `${session.skipped} filas omitidas`, 884, 532, 16, '#ffb38a', 'left');
  // 5. the match options (story 017): buy time, friendly fire, the bots' level. Every button is 42 px tall, like the level and topic buttons.
  rr(40, 552, 1200, 50, 12, 'rgba(14,19,30,0.9)', null);
  // Story 018 added Premios por racha: the row's buttons are narrower so the four options fit the 1200 px panel.
  { const bt = CONFIG.buy_time;
    text('Tiempo de compra', 54, 577, 15, '#ffd06a', 'left');
    button(212, 556, 46, 42, '-', session.buyTime > bt.min ? 'buyt:-1' : null, { size: 26, fill: session.buyTime > bt.min ? undefined : '#1b2232', color: session.buyTime > bt.min ? '#fff' : '#8a93a3' });
    text(`${session.buyTime} s`, 293, 577, 22, '#fff');
    button(328, 556, 46, 42, '+', session.buyTime < bt.max ? 'buyt:1' : null, { size: 26, fill: session.buyTime < bt.max ? undefined : '#1b2232', color: session.buyTime < bt.max ? '#fff' : '#8a93a3' }); }
  const lit = (on: boolean): ButtonOpts => ({ size: 19, fill: on ? '#ffd06a' : undefined, color: on ? '#1b2232' : '#fff', stroke: on ? '#fff3c4' : undefined });
  button(388, 556, 200, 42, `Fuego amigo: ${session.friendlyFire ? 'Sí' : 'No'}`, 'ff', lit(session.friendlyFire));
  button(598, 556, 262, 42, `Premios por racha: ${session.streakRewards ? 'Sí' : 'No'}`, 'streak', lit(session.streakRewards));
  text('Bots', 874, 577, 18, '#ffd06a', 'left');
  ([['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']] as const).forEach(([id, name], k) => {
    button(924 + k * 104, 556, 98, 42, name, 'bot:' + id, lit(session.botLevel === id));
  });
  // 4. the map: a button each, with its size; the chosen one lit
  rr(40, 608, 760, 68, 16, 'rgba(14,19,30,0.9)', null);
  text('Mapa', 60, 634, 24, '#ffd06a', 'left');
  if (!TOUCH) text('Tecla C', 60, 658, 15, '#aab4c8', 'left', 'normal');
  const step = Math.min(158, Math.floor(632 / MAP_IDS.length)), bw = step - 8; // four maps keep 158 px; more share the panel's 632 px
  MAP_IDS.forEach((id, i) => {
    const on = session.map === id, m = MAPS[id], bx = 160 + i * step;
    button(bx, 612, bw, 60, '', 'map:' + id, { fill: on ? '#ffd06a' : undefined, stroke: on ? '#fff3c4' : undefined });
    text(m.name, bx + bw / 2, 632, 20, on ? '#1b2232' : '#fff');
    text(`${m.width * CELL} x ${m.height * CELL} m`, bx + bw / 2, 656, 15, on ? '#1b2232' : '#c8d2e6', 'center', 'normal');
  });
  // start
  // Story 019: the game mode beside the start button (the options row above is full).
  // Story 024: the button cycles Bomba, Free for All and Duelo por equipos; any mode but Bomba is lit.
  const alt = !MODE_INFO[session.mode].bomb, modeName = MODE_INFO[session.mode].name;
  button(820, 612, 196, 60, '', 'mode', lit(alt));
  text('Modo de juego', 918, 630, 14, alt ? '#1b2232' : '#c8d2e6', 'center', 'normal');
  text(modeName, 918, 654, modeName.length > 12 ? 18 : 22, alt ? '#1b2232' : '#fff'); // the two long names a size smaller
  button(1026, 612, 214, 60, '', 'start', { fill: '#e07a1c', stroke: '#7a3a08' });
  text('Empezar partida', 1133, TOUCH ? 642 : 634, 24, '#fff');
  if (!TOUCH) text('Enter', 1133, 659, 14, '#ffe2c4', 'center', 'normal');
  const move = [bind.forward, bind.left, bind.back, bind.right].map(keyName), k = (id: string): string => keyName(bind[id]);
  const line = TOUCH ? 'Palanca mover  |  Arrastrar a la derecha girar  |  Fuego, Apuntar, Saltar, Tumbarse, Agacharse, De pie, Recargar, Arma, Comprar, Botiquín y Bomba: botones  |  Tabla: marcador  |  Pausa: botón de arriba'
    : `${move.every(m => m.length === 1) ? move.join('') : move.join('/')} mover  |  Ratón girar  |  ${bind.shoot === 'Mouse0' ? 'Clic' : 'Clic o ' + k('shoot')} disparar  |  ${k('aim')} apuntar con el arma  |  ${k('reload')} recargar  |  ${k('buy')} comprar  |  1-4 responder  |  ${k('use')} plantar o desactivar  |  ${k('medkit')} botiquín  |  ${k('scores')} marcador  |  ${k('pause')} pausa  |  ${k('mute')} silencio`;
  let ls = 16; ctx.font = `normal ${ls}px ${FONT}`;
  while (ctx.measureText(line).width > W - 40 && ls > 14) { ls--; ctx.font = `normal ${ls}px ${FONT}`; }
  text(clip(line, W - 40, ls, 'normal'), W / 2, 694, ls, '#e4e9f4', 'center', 'normal');
  text(SESSION_RULES[session.mode](), W / 2, 713, 14, '#aab4c8', 'center', 'normal');
}
export function drawResults() {
  buttons.length = 0;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,16,28,0.75)'; ctx.fillRect(0, 0, W, H);
  const mine = state.human.squad, ffa = isFfa(state) && Array.isArray(state.podium);
  const duel = isDuel(state), tie = duel && state.score[0] === state.score[1]; // story 024: a tie is neither won nor lost
  const waves = isWaves(state); // story 025: the team fell: the waves survived are the headline
  const won = waves ? false : ffa ? state.podium[0].id === state.human.id : state.score[mine] > state.score[1 - mine];
  text(state.gained, W / 2, 80, 48, tie ? '#ffd06a' : won ? '#9ff08a' : '#ff9a8a');
  const place = ffa ? 1 + state.podium.findIndex((r: { id: number }) => r.id === state.human.id) : 0; // story 019
  text(state.answered || (ffa ? `Terminaste en el puesto ${place}º con ${state.human.kills} ${state.human.kills === 1 ? 'baja' : 'bajas'}` : isFfa(state) ? `Terminaste con ${state.human.kills} ${state.human.kills === 1 ? 'baja' : 'bajas'}` : waves ? `Tus bajas: ${state.human.kills}` : CLASS_MODE ? `Marcador final: tu equipo ${state.score[mine]} - ${state.score[1 - mine]} rivales` : ''), W / 2, 132, 22, '#fff');
  text(state.subjectLabel || '', W / 2, 164, 17, '#c8d2e6', 'center', 'normal');
  if (CLASS_MODE) drawClassResults(); else if (ffa) drawPodium(260, 760); else if (waves) drawWavesTable(260, 760); else if (duel) drawDuelTable(260, 760, true); else drawSoloTable();
  if (!CLASS_MODE) drawResultsChoices();
  const enter = TOUCH || !CLASS_MODE ? '' : ' (Enter)', label = (!CLASS_MODE ? 'Volver a la pantalla de sesión' : net.mirror && net.mirror.match !== state ? 'Jugar la siguiente partida' : aula.room && aula.room.state !== 'ended' ? 'Volver a la sala' : 'Volver a la pantalla de entrada') + enter;
  button(W / 2 - 220, 600, 440, 62, label, 'menu', { size: 22 });
}
/**
 * The mode choice button (story 028): "Modo: <name>", lit when the mode is not Bomba like the session screen's. Its press is `act`.
 * Story 029 draws it again on the class results screen.
 */
export function drawModeChoice(x: number, y: number, w: number, h: number, mode: GameModeId, act: string): void {
  const alt = !MODE_INFO[mode].bomb;
  button(x, y, w, h, clip(`Modo: ${MODE_INFO[mode].name}`, w - 16, 17), act, { size: 17, fill: alt ? '#ffd06a' : undefined, color: alt ? '#1b2232' : '#fff', stroke: alt ? '#fff3c4' : undefined });
}
/** The map choice button (story 028): "Mapa: <name>". Its press is `act`; the screen steps to the next map in MAP_IDS order. */
export function drawMapChoice(x: number, y: number, w: number, h: number, map: string, act: string): void {
  button(x, y, w, h, clip(`Mapa: ${MAPS[map].name}`, w - 16, 17), act, { size: 17 });
}
/** Single player's results: the countdown to the next match and the three choices (mode, map, Continuar), in the column right of the table. */
function drawResultsChoices(): void {
  const x = 1036, w = 224, per = Math.round(1 / STEP);
  rr(x, 196, w, 380, 14, 'rgba(14,19,30,0.92)', null);
  text('Siguiente partida en', x + w / 2, 226, 17, '#ffd06a');
  text(`${Math.ceil(resultsCountdown.steps / per)} s`, x + w / 2, 290, 56, '#fff');
  text('Elige el modo y el mapa', x + w / 2, 340, 15, '#c8d2e6', 'center', 'normal');
  drawModeChoice(x + 12, 364, w - 24, 52, session.mode, 'rmode');
  drawMapChoice(x + 12, 428, w - 24, 52, session.map, 'rmap');
  button(x + 12, 504, w - 24, 56, TOUCH ? 'Continuar' : 'Continuar (Enter)', 'go', { size: 20, fill: '#e07a1c', stroke: '#7a3a08' });
}
/** Single player's results table: every player's kills, deaths and right and wrong answers. */
function drawSoloTable() {
  const mine = state.human.squad;
  const cols: [string, number, CanvasTextAlign][] = [['Jugador', 300, 'left'], ['Equipo', 560, 'center'], ['Bajas', 680, 'center'], ['Muertes', 780, 'center'], ['Bien', 880, 'center'], ['Mal', 980, 'center']];
  rr(260, 196, 760, 380, 14, 'rgba(14,19,30,0.92)', null);
  cols.forEach(([n, x, a]) => text(n, x, 224, 18, '#ffd06a', a));
  [...state.players].sort((a, b) => a.squad - b.squad || b.kills - a.kills).forEach((p, i) => {
    const y = 262 + i * 38;
    const you = p === state.human;
    if (you) rr(276, y - 16, 728, 32, 8, 'rgba(255,208,106,0.18)', null);
    const vals = [`${p.name}${p.human ? '' : ' (' + ROLE_NAME[p.role] + ')'}`, squadName(p.squad === mine ? 0 : 1), p.kills, p.deaths, p.right, p.wrong];
    vals.forEach((v, k) => text(String(v), cols[k][1], y, 18, k === 4 ? '#9ff08a' : k === 5 ? '#ff9a8a' : '#fff', cols[k][2], k === 0 && you ? 'bold' : 'normal'));
  });
}
/**
 * Oleadas cooperativas' end (story 025): the waves the team survived and each player (the team only), best first: kills, deaths and, for
 * people, their right and wrong answers (from the server's podium; a teammate bot shows a dash). `x`, `w`: the panel's place.
 */
function drawWavesTable(x: number, w: number): void {
  const rows: { id: number; kills: number; deaths: number; right: number; wrong: number }[] = Array.isArray(state.podium) ? state.podium
    : state.players.filter(p => p.squad === state.human.squad).map(p => ({ id: p.id, kills: p.kills, deaths: p.deaths, right: p.human ? p.right : -1, wrong: p.human ? p.wrong : -1 }));
  const n = state.survived ?? Math.max(0, state.round - 1);
  rr(x, 196, w, 380, 14, 'rgba(14,19,30,0.92)', null);
  text(`Oleadas superadas: ${n}`, x + w / 2, 228, 28, '#ffd06a'); text(`Cayeron en la oleada ${state.round}`, x + w / 2, 258, 16, '#c8d2e6', 'center', 'normal');
  const cols: [string, number, CanvasTextAlign][] = [['Jugador', x + 28, 'left'], ['Bajas', x + w - 250, 'center'], ['Muertes', x + w - 175, 'center'], ['Bien', x + w - 100, 'center'], ['Mal', x + w - 40, 'center']];
  cols.forEach(([nm, cx, al]) => text(nm, cx, 292, 16, '#ffd06a', al));
  rows.forEach((r, i) => {
    const y = 326 + i * 40, p = state.players[r.id], you = p === state.human;
    if (you) rr(x + 14, y - 16, w - 28, 34, 8, 'rgba(255,208,106,0.18)', null);
    const vals = [clip(p.human ? p.name : `${p.name} (${ROLE_NAME[p.role]})`, cols[1][1] - cols[0][1] - 50, 17, you ? 'bold' : 'normal'), r.kills, r.deaths, r.right >= 0 ? r.right : '—', r.wrong >= 0 ? r.wrong : '—'];
    vals.forEach((v, k) => text(String(v), cols[k][1], y, 17, k === 3 ? '#9ff08a' : k === 4 ? '#ff9a8a' : '#fff', cols[k][2], k === 0 && you ? 'bold' : 'normal'));
  });
}
/**
 * Duelo por equipos' end (story 024): the teams' kills (Equipo 1 a – b Equipo 2), the winning team or "Empate", and every player by
 * team, then kills: team, kills, deaths and, when `answers` (single player), right and wrong answers. `x`, `w`: the panel's place.
 */
function drawDuelTable(x: number, w: number, answers: boolean): void {
  const [a, b] = state.score, win = a === b ? -1 : a > b ? 0 : 1, col = (sq: number): string => SIDE_CSS[sq === state.attSquad ? 'att' : 'def'];
  rr(x, 196, w, 380, 14, 'rgba(14,19,30,0.92)', null);
  text('Equipo 1', x + w / 2 - 120, 224, 22, col(0)); text(`${a}  –  ${b}`, x + w / 2, 224, 26, '#fff'); text('Equipo 2', x + w / 2 + 120, 224, 22, col(1));
  text(win < 0 ? 'Empate' : `Gana el Equipo ${win + 1}`, x + w / 2, 254, 18, win < 0 ? '#ffd06a' : col(win));
  const cols: [string, number, CanvasTextAlign][] = answers
    ? [['Jugador', x + 30, 'left'], ['Equipo', x + w - 400, 'center'], ['Bajas', x + w - 290, 'center'], ['Muertes', x + w - 200, 'center'], ['Bien', x + w - 110, 'center'], ['Mal', x + w - 40, 'center']]
    : [['Jugador', x + 24, 'left'], ['Equipo', x + w - 270, 'center'], ['Bajas', x + w - 160, 'center'], ['Muertes', x + w - 60, 'center']];
  cols.forEach(([n, cx, al]) => text(n, cx, 284, 16, '#ffd06a', al));
  [...state.players].sort((p, q) => p.squad - q.squad || q.kills - p.kills || p.deaths - q.deaths || p.id - q.id).forEach((p, i) => {
    const y = 312 + i * 32 + (p.squad ? 6 : 0), you = p === state.human;
    if (you) rr(x + 14, y - 14, w - 28, 28, 8, 'rgba(255,208,106,0.18)', null);
    const vals = [clip(`${p.name}${p.human ? '' : ' (' + ROLE_NAME[p.role] + ')'}`, cols[1][1] - cols[0][1] - 60, 16, you ? 'bold' : 'normal'), `Equipo ${p.squad + 1}`, p.kills, p.deaths,
      ...(answers ? [p.human ? p.right : '—', p.human ? p.wrong : '—'] : [])];
    vals.forEach((v, k) => text(String(v), cols[k][1], y, 16, k === 1 ? col(p.squad) : k === 4 ? '#9ff08a' : k === 5 ? '#ff9a8a' : '#fff', cols[k][2], k === 0 && you ? 'bold' : 'normal'));
  });
}
/**
 * Free for All's end (story 019): the podium (the first three on steps, gold, silver and bronze) and below it every
 * player in order with kills, deaths and, for people, their questions right and wrong. `x`, `w`: the panel's place;
 * `rows`: the standing (the server's podium, or one made from the kills when the teacher ended the match first).
 */
function drawPodium(x: number, w: number, rows = state.podium as { id: number; kills: number; deaths: number; right: number; wrong: number }[]): void {
  rr(x, 196, w, 380, 14, 'rgba(14,19,30,0.92)', null);
  text('Podio', x + 24, 222, 22, '#ffd06a', 'left');
  const cx = x + w / 2, sw = Math.min(150, (w - 60) / 3), medal = ['#ffd06a', '#d8dee8', '#d89a5a'];
  const steps = [[1, cx - sw - 6, 54], [0, cx, 76], [2, cx + sw + 6, 38]] as const; // second, first, third
  for (const [rank, sx, sh] of steps) {
    const r = rows[rank]; if (!r) continue;
    const q = state.players[r.id], base = 352, you = q === state.human;
    rr(sx - sw / 2, base - sh, sw, sh, 8, medal[rank], null);
    text(`${rank + 1}º`, sx, base - sh / 2, 26, '#1b2232');
    text(clip(q.name, sw - 6, 17, you ? 'bold' : 'normal'), sx, base - sh - 42, 17, you ? '#ffe7a8' : '#fff', 'center', you ? 'bold' : 'normal');
    text(`${r.kills} ${r.kills === 1 ? 'baja' : 'bajas'} · ${r.deaths} ${r.deaths === 1 ? 'muerte' : 'muertes'}`, sx, base - sh - 22, 13, '#c8d2e6', 'center', 'normal');
  }
  const cols: [string, number, CanvasTextAlign][] = [['', x + 30, 'center'], ['Jugador', x + 48, 'left'], ['Bajas', x + w - 250, 'center'], ['Muertes', x + w - 175, 'center'], ['Bien', x + w - 100, 'center'], ['Mal', x + w - 40, 'center']];
  cols.forEach(([n, cx2, a]) => text(n, cx2, 376, 14, '#ffd06a', a));
  rows.forEach((r, i) => {
    const y = 398 + i * 22, q = state.players[r.id], you = q === state.human;
    if (you) rr(x + 14, y - 10, w - 28, 20, 6, 'rgba(255,208,106,0.18)', null);
    const vals = [`${i + 1}`, clip(q.name, w - 330, 15, you ? 'bold' : 'normal'), r.kills, r.deaths, r.right < 0 ? '—' : r.right, r.wrong < 0 ? '—' : r.wrong];
    vals.forEach((v, k) => text(String(v), cols[k][1], y, 15, k === 4 && r.right >= 0 ? '#9ff08a' : k === 5 && r.wrong >= 0 ? '#ff9a8a' : '#fff', cols[k][2], k === 1 && you ? 'bold' : 'normal'));
  });
}
/** The most topic rows the class results panel draws; past it the last row says how many more there are. */
const TOPIC_ROWS = 8;
/**
 * Class mode's end of match: "Tus resultados", the student's OWN counts from the server's `results` message (right,
 * wrong, percentage, kills, deaths, then topic by topic), beside the teams' kills and deaths. Nobody else's answers
 * are shown. Until the message arrives (it may come a little after matchEnd) the panel says it is on its way.
 */
function drawClassResults() {
  const r = net.resultsFor === state ? net.results : null;
  rr(60, 196, 580, 380, 14, 'rgba(14,19,30,0.92)', null);
  text('Tus resultados', 84, 222, 22, '#ffd06a', 'left');
  if (!r) text('Recibiendo tus resultados…', 350, 380, 20, '#c8d2e6', 'center', 'normal');
  else {
    if (r.why === 'ended') text('hasta que el profesor terminó', 616, 222, 15, '#aab4c8', 'right', 'normal');
    const stats: [string, string, string][] = [['Bien', String(r.right), '#9ff08a'], ['Mal', String(r.wrong), '#ff9a8a'],
      ['Acierto', r.right + r.wrong ? `${r.pct} %` : '—', '#fff'], ['Bajas', String(r.kills), '#fff'], ['Muertes', String(r.deaths), '#fff']];
    stats.forEach(([n, v, c], k) => { const x = 120 + k * 104; text(n, x, 256, 15, '#aab4c8', 'center', 'normal'); text(v, x, 284, 26, c); });
    const tc: [string, number, CanvasTextAlign][] = [['Tema', 84, 'left'], ['Nivel', 430, 'center'], ['Bien', 520, 'center'], ['Mal', 590, 'center']];
    tc.forEach(([n, x, a]) => text(n, x, 324, 16, '#ffd06a', a));
    if (!r.topics.length) text('No respondiste ninguna pregunta en esta partida.', 350, 380, 18, '#c8d2e6', 'center', 'normal');
    const shown = r.topics.length <= TOPIC_ROWS ? r.topics.length : TOPIC_ROWS - 1;
    r.topics.slice(0, shown).forEach((t, i) => {
      const y = 352 + i * 26;
      text(clip(t.tp, 290, 16, 'normal'), 84, y, 16, '#fff', 'left', 'normal');
      text(t.lv ? QUESTIONS.LEVEL_NAMES[t.lv as Level] ?? t.lv : '—', 430, y, 16, '#c8d2e6', 'center', 'normal');
      text(String(t.right), 520, y, 16, '#9ff08a', 'center');
      text(String(t.wrong), 590, y, 16, '#ff9a8a', 'center');
    });
    if (shown < r.topics.length) text(`y ${r.topics.length - shown} temas más`, 84, 352 + shown * 26, 16, '#aab4c8', 'left', 'normal');
  }
  if (isWaves(state)) { drawWavesTable(660, 560); return; } // story 025
  if (isFfa(state) && Array.isArray(state.podium)) { drawPodium(660, 560); return; }
  if (isDuel(state)) { drawDuelTable(660, 560, false); return; } // story 024: the teams' kills and the winner, also when the teacher ended it
  if (isFfa(state)) { // story 019: the teacher ended it before the clock, so there is no podium from the server: the standing by kills, then fewer deaths
    const rows = [...state.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id)
      .map(p => ({ id: p.id, kills: p.kills, deaths: p.deaths, right: -1, wrong: -1 }));
    drawPodium(660, 560, rows); return;
  }
  const mine = state.human.squad;
  rr(660, 196, 560, 380, 14, 'rgba(14,19,30,0.92)', null);
  text('Equipos', 684, 222, 22, '#ffd06a', 'left');
  const cols: [string, number, CanvasTextAlign][] = [['Jugador', 684, 'left'], ['Equipo', 950, 'center'], ['Bajas', 1060, 'center'], ['Muertes', 1160, 'center']];
  cols.forEach(([n, x, a]) => text(n, x, 256, 16, '#ffd06a', a));
  [...state.players].sort((a, b) => a.squad - b.squad || b.kills - a.kills).forEach((p, i) => {
    const y = 288 + i * 30, you = p === state.human;
    if (you) rr(674, y - 14, 532, 28, 8, 'rgba(255,208,106,0.18)', null);
    const vals = [clip(`${p.name}${p.human ? '' : ' (' + ROLE_NAME[p.role] + ')'}`, 200, 16, you ? 'bold' : 'normal'), squadName(p.squad === mine ? 0 : 1), p.kills, p.deaths];
    vals.forEach((v, k) => text(String(v), cols[k][1], y, 16, '#fff', cols[k][2], k === 0 && you ? 'bold' : 'normal'));
  });
}
let figScene: THREE.Scene | null = null, figCam: THREE.PerspectiveCamera | null = null;
const FIG_LINE = [['rusher', 'att'], ['rifleman', 'att'], ['sniper', 'att'], ['rusher', 'def'], ['rifleman', 'def'], ['sniper', 'def'], ['bomb', '']];
export function drawFigures() {
  if (!figScene) {
    figScene = new THREE.Scene(); figScene.background = new THREE.Color(0x2a3550);
    figScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6d5c40, 2.2));
    const l = new THREE.DirectionalLight(0xffffff, 2); l.position.set(3, 6, 8); figScene.add(l);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), lam(0xd6c49c)); fl.rotation.x = -Math.PI / 2; figScene.add(fl);
    FIG_LINE.forEach(([role, side], i) => {
      const x = -5.4 + i * 1.8;
      if (role === 'bomb') { const bm = makeBomb(); bm.group.position.set(x, 0, 0); bm.group.scale.setScalar(2.2); bm.group.rotation.y = 0.6; figScene!.add(bm.group); return; }
      const s = makeSoldier(role); s.team.color.setHex(SIDE_HEX[side]); setSide(s, side); poseSoldier(s, { alive: true, id: 0, st: { stance: 'stand', jumpY: 0 }, moving: false, deadT: 0, plantT: 0, defusing: false }, 0, 0.1, 0); s.group.position.set(x, 0, 0); s.group.rotation.y = -Math.PI / 2 + 0.25; figScene!.add(s.group);
    });
    figCam = new THREE.PerspectiveCamera(42, W / H, 0.1, 100); figCam.position.set(0, 2.2, 10.5); figCam.lookAt(0, 0.95, 0);
  }
  renderer.clear(); renderer.render(figScene, figCam!);
  ctx.clearRect(0, 0, W, H);
  text('Figuras', W / 2, 50, 36, '#fff');
  FIG_LINE.forEach(([role, side], i) => {
    _v.set(-5.4 + i * 1.8, -0.25, 0).project(figCam!);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
    text(role === 'bomb' ? 'Bomba' : ROLE_NAME[role], x, y + 6, 18, '#fff');
    if (side) text(side === 'att' ? 'Ataque' : 'Defensa', x, y + 30, 15, SIDE_CSS[side]);
  });
}
