// Solve or Boom: a first-person 4 v 4 bomb shooter where buying and defusing take a right answer.
// Design record: design/game-brief.md (and design/gdd/question-bank.md for the questions).
// The scenes, the 3D world, the bots and the loop live here; the pure rules, the map, sound,
// input, drawing and the questions are modules beside it. The HUD is src/hud.ts and the screens
// around a match (session, menus, results, class join and waiting) are src/session-screen.ts (TD-016).
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, tune } from './config';
import AULA from '../data/aula.json';
import * as QUESTIONS from './questions';
import { loadQuestionFile, type ParsedQuestion } from './game/csv';
import { LEVELS, type Level } from './game/types';
import type { Loose } from './game/types';
import { params, manual, clock, seedFrom, install } from './hook';
import {
  CELL, CRATE_FILL, MW, MH, WALL_H, EYE, grid, zone, isGate, idx, CRATES, SITE, siteCells, mapState,
  center, cellOf, walkable, solidSight, hitsWall, moveBody, losClear, walkClear, bfs,
  MAP, MAP_ID, MAPS, MAP_IDS, loadMap, type Cell, type MapData,
  hasHeights, grid1, zone1, rampAt, rampHeight, levelHeight, levelOfY, canStepXY,
} from './game/map';
import { lerp, angDiff, fmtTime, aimTurnScale } from './game/rules';
import {
  createMatch, blankMatch, type BotLevel, step as stepMatch, humanSpread, idleInput, shopBlock, inOwnBase, sideOf, squadName, uiOpen, questionLevel, say, isFfa, isDuel, isWaves, isRoam, type GameMode,
  ROSTER, ROLE_NAME, WEAPON, SHOP, STEP, type Match, type PlayerInput,
} from './game/match';
import { startAudio, setMuted, isMuted, SFX } from './audio';
import { down, hit, pressed, clicks, mouse, buttons } from './input';
import { TOUCH, touch, renderRatio, setTouchMode, setUseLabel, setGunLabel, setStance, setAbilityButton } from './touch';
import { nextReward, REWARD_NAME } from './game/streak';
import { ACTIONS, bind, keyName, setKey, resetKeys } from './keys';
import { W, H, FONT, canvas, glCanvas, ctx, setRenderer, fit, clear, text, rr, wrapText, clip, button, type ButtonOpts } from './screen';
import { connect, savedName, type Connection } from './net/client';
import type { ResultsMessage, RoomView, VoteView, You } from './net/protocol';
import { tracerSpan } from './fx';
import { MODE_INFO, nextMode, SEATS_PER_TEAM, type GameModeId } from './net/protocol';
import { createMirror, setNames, predict, applySnapshot, interpolate, type Mirror } from './net/mirror';
import { css, drawHUD, drawTeacherPause } from './hud';
import { drawClassInfo, drawFigures, drawJoin, drawMenu, drawResults, drawTitle, drawWaiting, flyover } from './session-screen';
import { SIDE_HEX, backBombs, beacon, bombModel, boomColumn, boomFlash, boomMesh, boomRing, burst, camera, decals, gates, gunCam, gunScene, hitTint, models, nextDecal, nextPuff, pickupMeshes, poseSoldier, puffs, renderer, setHeld, setSide, sparks, swing, tracer, tracerI, tracers, useMap, viewBomb, viewGuns, world } from './scene3d';

// ---- Class mode ------------------------------------------------------------------------
/** Served by the classroom server (npm run aula), which adds <meta name="aula"> to the page: the page opens on the join screen. */
export const CLASS_MODE = !!document.querySelector('meta[name="aula"]');
/**
 * The scene the page opens on: the join screen on the teacher's server (CLASS_MODE), the main menu anywhere else.
 * A run driven through the game-state hook (?manual=1, src/hook.ts: only step() moves it) plays single player
 * and opens on the session screen, the way ?scene= already lets a run choose where it starts.
 */
const FIRST_SCENE = CLASS_MODE ? 'join' : manual ? 'title' : 'menu';
/** The main menu's choices, in order (the scene each one opens is in scenes.menu). */
const MENU = ['solo', 'clase'] as const;
/** The main menu's highlighted choice (an index into MENU), moved by Up / Down. */
export let menuSel = 0;
/** The longest name the join screen lets the student type (the server's max_name_length). */
export const NAME_MAX = 20;
/** One character a name may hold: a letter (á, ñ, ü...), a digit, a space or . _ - ( ). */
const NAME_CHAR = /^[\p{L}\p{N} ._()-]$/u;
/**
 * The class session as the student sees it: the typed name, the message under it, whether a connection is
 * being opened, the live connection, who the server says the student is, the room's seating and the
 * reconnecting line. `gen` tells a current connection's callbacks from an old one's.
 */
export const aula = { name: '', error: '', busy: false, conn: null as Connection | null, you: null as You | null, room: null as RoomView | null, retry: '', gen: 0,
  /** Story 029: the room's vote window (null: none open) with `at`, the page clock (ms) when the server's `left` was read: the countdown is left - (now - at). */
  vote: null as (VoteView & { at: number }) | null };
/** Story 029: sends the student's vote or Continuar for a results-screen button `act` ('vmode:<id>', 'vmap:<id>', 'vready'); anything else is ignored. */
function voteAct(act: string | undefined): void {
  if (!act || !aula.vote) return;
  if (act === 'vready') aula.conn?.sendVote({ ready: true });
  else if (act.startsWith('vmode:')) aula.conn?.sendVote({ mode: act.slice(6) as GameModeId });
  else if (act.startsWith('vmap:')) aula.conn?.sendVote({ map: act.slice(5) });
}
/**
 * The join screen's name field: an invisible text input that holds the typed name while the canvas draws
 * it, so accents typed with dead keys, an IME, a paste and a tablet's on-screen keyboard all work.
 */
const nameInput = Object.assign(document.createElement('input'), { type: 'text', maxLength: NAME_MAX * 2, autocomplete: 'off', spellcheck: false });
nameInput.setAttribute('aria-label', 'Tu nombre');
nameInput.setAttribute('autocapitalize', 'words');
nameInput.setAttribute('enterkeyhint', 'go');
nameInput.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px';
document.body.append(nameInput);
// Only the characters a name may hold, no leading or double spaces, at most NAME_MAX; the caret stays at the end.
nameInput.addEventListener('input', () => {
  const name = [...nameInput.value].filter(ch => NAME_CHAR.test(ch)).join('').replace(/^ +/, '').replace(/ {2,}/g, ' ');
  aula.name = [...name].slice(0, NAME_MAX).join(''); aula.error = '';
  nameInput.value = aula.name; nameInput.setSelectionRange(aula.name.length, aula.name.length);
});
// A phone keyboard's Enter may not carry code 'Enter': read the key, so "Ir" joins the class.
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') hit.add('Enter'); });
/** The room states in words. */
export const ROOM_STATE: Record<RoomView['state'], [string, string]> = {
  waiting: ['Esperando a que empiece la partida', '#f2f5fb'],
  running: ['La partida ya está en marcha', '#9ff08a'],
  paused: ['Pausa del profesor', '#ffe28a'],
  ended: ['La sala terminó', '#ff9a8a'],
};
/** True while the teacher has paused this student's room (class mode): the match is frozen on the server, so nothing is sent or predicted. */
function teacherPaused(): boolean { return CLASS_MODE && aula.room?.state === 'paused'; }
/**
 * The room ended under a student who was playing it: the results screen with the score the mirror has. When the
 * match had not reached its own end (the teacher ended it), its headline says so; the per-student table is story 007.
 */
function showClassResults(): void {
  const m = net.mirror?.match;
  if (m) {
    state = m;
    if (!m.over && isWaves(m)) Object.assign(m, { over: true, gained: 'El profesor terminó la partida', answered: `Llegaste a la oleada ${m.round} con ${m.human.kills} bajas`, survived: Math.max(0, m.round - 1) }); // story 025
    else if (!m.over && isFfa(m)) Object.assign(m, { over: true, gained: 'El profesor terminó la partida', answered: `Terminaste con ${m.human.kills} bajas y ${m.human.deaths} muertes` }); // story 019: no podium yet
    else if (!m.over) {
      const mine = m.human.squad;
      Object.assign(m, { over: true, gained: 'El profesor terminó la partida', answered: `Marcador final: tu equipo ${m.score[mine]} - ${m.score[1 - mine]} rivales` });
    }
    scene = 'results';
  } else scene = 'waiting';
  if (locked) document.exitPointerLock();
}
/**
 * The networked match (story 005 Part A): `mirror` is the copy of the server's match the screen draws and
 * predicts (src/net/mirror.ts), `matchNo` the room's match number it was built for, `dressed` whether the
 * figures' colours and the gates were set from its first snapshot, and `cool` the local wait before the
 * next own shot plays its sound and flash at once (the server's own arrives a round trip later). `results` is
 * the student's own last `results` message and `resultsFor` the mirror's match it belongs to (story 007).
 */
export const net = { mirror: null as Mirror | null, matchNo: -1, dressed: false, cool: 0, results: null as ResultsMessage | null, resultsFor: null as Match | null };
/**
 * One class-mode step of the own player: predicts it with `inp` and sends `inp` to the server (never
 * step(): the server runs the match; it also judges the buy menu, the question cards and the defuse). Also
 * plays the own shot at once and moves a dead student's view to a living teammate.
 */
function netStep(inp: PlayerInput): void {
  const m = net.mirror, conn = aula.conn;
  if (!m || !conn || teacherPaused()) return;
  const match = m.match, me = match.human, lim = AULA.max_look_per_message.value;
  // A long frame can gather more mouse turn than the server takes in one input: clamp it here, before the prediction, so both agree.
  inp.lookYaw = Math.max(-lim, Math.min(lim, inp.lookYaw)); inp.lookPitch = Math.max(-lim, Math.min(lim, inp.lookPitch));
  const seq = predict(m, inp, STEP);
  inp.aimYaw = me.yaw; inp.aimPitch = me.pitch; // the aim the student sees: the server takes it as is, so a lost input cannot turn the shots away from the crosshair
  conn.sendInput(seq, inp);
  net.cool = Math.max(0, net.cool - STEP); me.flashT = Math.max(0, me.flashT - STEP);
  const a = me.ammo[me.cur];
  if (me.alive && !me.hidden && match.phase === 'live' && (WEAPON[me.cur].auto ? inp.fire : inp.firePress) && !match.me.sprint && match.me.proneT === 0
    && me.reloadT <= 0 && net.cool <= 0 && a && a.mag > 0) {
    a.mag--; net.cool = tune[me.cur + '_rate']; me.flashT = 0.05; SFX.shot(me.cur); // the snapshot puts the server's magazine back
  } else if (me.alive && !me.hidden && match.phase === 'live' && (WEAPON[me.cur].auto ? inp.fire : inp.firePress) && !match.me.sprint && match.me.proneT === 0
    && me.reloadT <= 0 && net.cool <= 0 && a && a.mag === 0 && a.res === 0) {
    net.cool = tune.melee_rate; swing[me.id] = tune.melee_time; SFX.swing(); // story 016: the strike's look only; the server judges the hit
  }
  if (!me.alive && (inp.spectate || inp.spectateKey || !match.specP?.alive)) {
    const mates = match.players.filter(q => q.alive && q.squad === me.squad), pool = mates.length ? mates : match.players.filter(q => q.alive);
    if (pool.length) { match.spec = (match.spec + 1) % pool.length; match.specP = pool[match.spec]; }
  }
}
/**
 * Sends the typed name to the classroom server; a blank one is refused here without connecting. The
 * connection's callbacks move the page between the join and waiting screens and the match.
 */
function joinClass(): void {
  if (aula.busy) return;
  if (!aula.name.trim()) { aula.error = 'Escribe tu nombre para entrar.'; return; }
  const gen = ++aula.gen;
  Object.assign(aula, { error: '', busy: true, retry: '' });
  aula.conn = connect({
    name: aula.name,
    onJoined: m => {
      if (gen !== aula.gen) return;
      nameInput.blur(); Object.assign(aula, { busy: false, you: m.you, room: m.room, retry: '', error: '' });
      if (scene === 'join') scene = 'waiting'; // a rejoin mid-match stays on the match: its begin follows
    },
    onRoom: m => {
      if (gen !== aula.gen) return;
      aula.room = { roomId: m.roomId, state: m.state, seats: m.seats, mode: m.mode, nextSubject: m.nextSubject };
      if (m.state !== 'waiting') aula.vote = null; // a vote window only lives in a waiting room
      if (net.mirror) setNames(net.mirror, m.seats);
      // The match ended under the student: the room closed ('ended'), or a teacher room waits again for its next start ('waiting').
      if ((m.state === 'ended' || m.state === 'waiting') && (scene === 'play' || scene === 'pause' || (scene === 'controls' && ctl.from === 'pause'))) showClassResults();
    },
    onBegin: b => {
      if (gen !== aula.gen) return;
      // After a rematch the old match's last snapshot (its matchEnd) came first: the old copy, over, stays on the end screen.
      const old = net.mirror, ended = !!old && b.match !== net.matchNo && old.match.over;
      useMap(b.map, !MODE_INFO[b.mode].bomb); // story 024: every mode but Bomba is drawn without zones
      net.mirror = createMirror(b); Object.assign(net, { matchNo: b.match, dressed: false, cool: 0 });
      models.forEach((m, i) => { m.group.visible = i !== b.seat; });
      const voted = aula.vote !== null; // the room started by itself from its vote: straight to the match
      aula.vote = null;
      if (!ended || scene === 'waiting' || voted) { // a teacher room started again while its student waited in it: straight to the match
        state = net.mirror.match;
        if (scene !== 'pause' && scene !== 'controls') scene = 'play';
      }
    },
    onSnapshot: s => {
      const m = net.mirror;
      if (gen !== aula.gen || !m) return;
      const me = m.match.human, flash = me.flashT; // the own muzzle flash is played locally (netStep)
      const evs = applySnapshot(m, s, performance.now());
      me.flashT = flash;
      if (!net.dressed) { // a match joined midway: the figures' sides and the gates as they are now
        net.dressed = true;
        for (const p of m.match.players) models[p.id].team.color.setHex(SIDE_HEX[sideOf(m.match, p)]);
        for (const gm of gates) { gm.position.y = 1.5; gm.visible = m.match.gatesClosed; }
      }
      playEvents(evs);
    },
    onResults: r => {
      if (gen !== aula.gen) return;
      // It names the match the mirror still holds (a rematch's begin comes after it): tie it to that copy, which the results screen draws.
      net.results = r; net.resultsFor = net.mirror && r.match === net.matchNo ? net.mirror.match : null;
    },
    onVote: m => { if (gen === aula.gen) aula.vote = m.vote ? { ...m.vote, at: performance.now() } : null; },
    onError: e => { if (gen === aula.gen) aula.error = e.text; },
    onReconnecting: (a, max) => { if (gen === aula.gen) aula.retry = `Reconectando… (intento ${a} de ${max})`; },
    onClosed: c => {
      if (gen !== aula.gen) return;
      Object.assign(aula, { busy: false, conn: null, you: null, room: null, retry: '', vote: null });
      net.mirror = null; if (locked) document.exitPointerLock();
      if (c.reason === 'unreachable') aula.error = 'No se pudo conectar con el servidor del aula.';
      if (c.reason === 'gave_up') aula.error = 'Se perdió la conexión con el servidor del aula. Pulsa Entrar para volver.';
      scene = 'join';
    },
  });
}

// ---- Built to be checked ----------------------------------------------------------------
const TITLE = 'Solve or Boom';
const events: Loose[] = []; // window.game.events: anything the game wants a run to see

// ---- Input listeners ------------------------------------------------------------------
export let locked = false, lockedBefore = false;
addEventListener('keydown', e => {
  startAudio();
  if (!e.repeat) { down.add(e.code); hit.add(e.code); }
  if (e.code === 'KeyU' && scene === 'title') csvInput.click();
  if ((e.code === 'Space' && e.target !== nameInput) || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => down.clear());
function toLogical(e: PointerEvent | MouseEvent): { x: number; y: number } {
  const b = canvas.getBoundingClientRect();
  return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height };
}
function requestLock() {
  if (TOUCH) return; // touch aims by dragging: no pointer lock
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* no lock here */ }
}
canvas.addEventListener('pointermove', e => {
  const m = toLogical(e); mouse.x = m.x; mouse.y = m.y;
  // A second mouse button pressed or let go while another is held comes as a pointermove (a chord), never as pointerdown/up:
  // aiming with the right button and firing with the left one needs it read here.
  if (e.button >= 0 && e.pointerType === 'mouse' && locked) syncButtons(e.buttons);
});
/** Matches the held mouse buttons to the `buttons` mask of a chord: 1 left (Mouse0), 2 right (Mouse2). A newly held one counts as pressed this step. */
function syncButtons(mask: number): void {
  for (const [code, bit] of [['Mouse0', 1], ['Mouse2', 2]] as const) {
    if (mask & bit) { if (!down.has(code)) { down.add(code); hit.add(code); } }
    else down.delete(code);
  }
}
/** The upload button was pressed with a finger: its file picker opens on the click that follows (TD-011). */
let uploadByTouch = false;
canvas.addEventListener('pointerdown', e => {
  startAudio();
  const m = toLogical(e); mouse.x = m.x; mouse.y = m.y;
  if (e.button !== 0 && e.button !== 2) return; // middle and side buttons do nothing
  if (scene === 'controls' && ctl.capture && e.button === 2) { hit.add('Mouse2'); return; } // the right button is a key being bound, wherever it is pressed
  if (!locked) {
    const b = buttons.find(b => m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h);
    if (b) { if (b.act === 'upload') { uploadByTouch = e.pointerType === 'touch'; if (!uploadByTouch) csvInput.click(); } else clicks.push(b.act); return; }
  }
  if (scene === 'pause') { clicks.push('resume'); requestLock(); return; }
  if (scene === 'play' && state.human && !state.human.alive) { clicks.push('spec'); return; }
  if (scene === 'play' && !locked && !uiOpen(state)) { requestLock(); return; }
  if (e.pointerType === 'touch') return; // on touch only the Fuego and Apuntar buttons shoot and aim: a tap on the bare canvas does nothing
  const code = e.button === 2 ? 'Mouse2' : 'Mouse0';
  down.add(code); hit.add(code);
});
canvas.addEventListener('click', e => {
  if (scene === 'join') nameInput.focus({ preventScroll: true });
  const m = toLogical(e), b = buttons.find(b => m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h);
  if (uploadByTouch && b?.act === 'upload') { uploadByTouch = false; csvInput.click(); } // a finger's tap opens the file picker on its click (the browser allows it there); a mouse already opened it on pointerdown (TD-011)
});
addEventListener('pointerup', e => { down.delete(e.button === 2 ? 'Mouse2' : 'Mouse0'); if (e.pointerType === 'touch') { mouse.x = -1; mouse.y = -1; } }); // a lifted finger leaves no hover
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) lockedBefore = true;
  else if (lockedBefore && scene === 'play' && !uiOpen(state) && state.human && state.human.alive) { scene = 'pause'; state.human.scoped = false; state.human.st.aimGun = ''; }
});
addEventListener('mousemove', e => { // the aim answers the hand at once: no smoothing
  if (!locked || scene !== 'play' || !state.human || !state.human.alive || uiOpen(state)) return;
  const k = 0.0022 * tune.mouse_sens * (state.human.scoped ? aimTurnScale(tune[state.human.cur + '_aim_fov'], tune.view_fov) : 1); // the turn scales with the zoom (half-angle tangents, TD-013)
  lookYaw -= e.movementX * k; lookPitch -= e.movementY * k; // the next step turns the aim
});

// ---- Custom questions: CSV upload or drop ----------------------------------------------
const csvInput = document.getElementById('csv') as HTMLInputElement;
function loadCSV(file: File | undefined): void {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    // The same load step and limits as the teacher's upload (src/game/csv.ts loadQuestionFile, data/aula.json; TD-014).
    const res = loadQuestionFile(fr.result as ArrayBuffer, file.name, { maxBytes: AULA.csv_max_bytes.value, maxQuestions: AULA.csv_max_questions.value });
    session.skipped = res.skipped;
    if (res.ok) { session.custom = res.questions; session.customName = file.name; session.subject = QUESTIONS.CUSTOM; }
    session.status = res.text;
  };
  fr.readAsArrayBuffer(file);
}
csvInput.addEventListener('change', () => { loadCSV(csvInput.files?.[0]); csvInput.value = ''; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); if (scene === 'title') loadCSV(e.dataTransfer?.files[0]); });

/** How loud a sound at (x, z) is where the camera stands. */
function heard(x: number, z: number): number {
  const d = Math.hypot(x - camera.position.x, z - camera.position.z);
  return Math.max(0, 1 - d / 70);
}
/** Where a sound at (x, z) sits for the camera: pan -1 (left) to 1 (right), and its distance. Reads only. */
function heardFrom(x: number, z: number): { pan: number; dist: number } {
  const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz), y = camera.rotation.y;
  return { pan: d < 0.01 ? 0 : (dx * Math.cos(y) - dz * Math.sin(y)) / d, dist: d }; // camera right = (cos y, -sin y)
}

// ---- Session: what the person creating the match picked (kept between matches) ------------
export const session = {
  subject: 'matematicas',
  /** The map id (data/maps/): the match is played there and the title flyover shows it. */
  map: String(tune.default_map),
  /** facil | medio | dificil: the level of the whole match (a custom CSV ignores it). */
  level: 'medio' as Level,
  topics: Object.fromEntries(Object.entries(QUESTIONS.SUBJECTS).map(([k, s]) => [k, Object.keys(s.topics)])),
  custom: [] as ParsedQuestion[], customName: '', status: '',
  /** Match options (story 017), passed to createMatch as friendlyFire, buyTime and botLevel. */
  buyTime: Number(tune.buy_time), friendlyFire: false, botLevel: 'normal' as BotLevel,
  /** Streak rewards (story 018), on by default; passed to createMatch as streakRewards. */
  streakRewards: true,
  /** The game mode (story 019): 'bomb' (Bomba, the default) or 'ffa' (Free for All); passed to createMatch as mode. */
  mode: 'bomb' as GameMode,
  /** Rows the last CSV upload skipped. */
  skipped: 0,
  /** Questions available for the current subject, topics and level (after the level fallback); null = generated. */
  get available(): number | null {
    const topics = this.subject === QUESTIONS.CUSTOM ? [] : this.topics[this.subject];
    return QUESTIONS.availableCount(this.subject, topics, this.level, this.custom);
  },
};
/** Single player's results countdown (story 028), in game steps left; set when a match ends, counted down by the results scene. */
export const resultsCountdown = { steps: 0 };
export const SUBJECT_LIST = ['matematicas', 'ciencias', 'geografia', 'lengua', QUESTIONS.CUSTOM];
// ---- The match: the rules run in src/game/; this screen only sends inputs and reads state and events ----
/** The match (src/game/match.ts); window.game shows it as `state`. */
export let scene: string, state: Match;
/** The events a run's check reads on window.game.events: the ones the game logged before the split. */
const LOG = new Set(['match', 'round', 'kill', 'plant', 'roundEnd', 'answer', 'buy', 'matchEnd']);
/** Mouse turning since the last step, in radians: the next step adds it to the aim. */
let lookYaw = 0, lookPitch = 0;
function startMatch(): void {
  useMap(session.map, !MODE_INFO[session.mode].bomb);
  state = createMatch({
    // each match its own seed, so the first question changes; checks (?manual=1 or ?seed=) keep the fixed one
    seed: manual || params.get('seed') ? seedFrom(CONFIG.seed) : 1 + Math.floor(Math.random() * 2147483646), subject: session.subject, level: session.level, map: session.map,
    topics: session.subject === QUESTIONS.CUSTOM ? [] : session.topics[session.subject], custom: session.custom, customName: session.customName,
    friendlyFire: session.friendlyFire, buyTime: session.buyTime, botLevel: session.botLevel, streakRewards: session.streakRewards, mode: session.mode,
  });
  playEvents();
}
/** The human's input snapshot for this step, from the held and pressed keys (src/keys.ts bindings), the mouse and a clicked button. */
function readInput(act: string | undefined): PlayerInput {
  const inp = idleInput(), held = (a: string): boolean => down.has(bind[a]), press = (a: string): boolean => pressed(bind[a]);
  inp.moveF = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0); inp.moveS = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  inp.walk = held('walk'); inp.sprint = held('sprint'); inp.crouch = held('crouch'); inp.use = held('use'); inp.usePress = press('use');
  inp.fire = down.has('Mouse0') || held('shoot'); inp.firePress = pressed('Mouse0') || press('shoot'); inp.scope = held('aim');
  inp.lookLeft = down.has('ArrowLeft'); inp.lookRight = down.has('ArrowRight'); inp.lookUp = down.has('ArrowUp'); inp.lookDown = down.has('ArrowDown');
  if (touch.dx || touch.dy) { // the drag on the right half: the same turn per pixel as the mouse's, with its own sensitivity
    const k = tune.touch_turn * tune.touch_sens * (state.human.scoped ? aimTurnScale(tune[state.human.cur + '_aim_fov'], tune.view_fov) : 1);
    lookYaw -= touch.dx * k; lookPitch -= touch.dy * k; touch.dx = 0; touch.dy = 0;
  }
  inp.lookYaw = lookYaw; inp.lookPitch = lookPitch; lookYaw = 0; lookPitch = 0;
  inp.shop = press('buy'); inp.medkit = press('medkit'); inp.ability = press('ability'); inp.prone = press('prone'); inp.jump = press('jump'); inp.primary = press('primary');
  inp.pistol = press('pistol'); inp.swap = press('swap'); inp.reload = press('reload');
  inp.digits = [0, 1, 2, 3, 4, 5].filter(k => pressed('Digit' + (k + 1)) || pressed('Numpad' + (k + 1)));
  inp.spectateKey = pressed('Space');
  if (act && act.startsWith('buy:')) inp.buyItem = act.slice(4);
  if (act && act.startsWith('ans:')) inp.answer = Number(act.slice(4));
  inp.closeShop = act === 'closebuy'; inp.closeCard = act === 'closecard'; inp.spectate = act === 'spec';
  return inp;
}
/**
 * Plays and draws what the events say (sounds, tracers, sparks, the round's models), logs the ones checks read,
 * and empties the list: the last step's (single player) or a snapshot's (class mode).
 */
function playEvents(list: Loose[] = state.events): void {
  for (const e of list) {
    if (LOG.has(e.type)) events.push(e);
    switch (e.type) {
      case 'shot':
        { // seen through the scope, your own sniper shot's tracer starts further out and thinner (the 22° view magnifies the first metres into a white blob); a bar too short to see is not drawn (src/fx.ts tracerSpan, TD-012)
          const scoped = e.by === state.human?.id && e.w === 'sniper' && state.human.scoped;
          const start = tracerSpan(e.from, e.to, scoped ? tune.fx_scope_tracer_skip : 0, tune.fx_tracer_min_len);
          if (start) { tracer(e.w, start[0], start[1], start[2], e.to[0], e.to[1], e.to[2]); if (scoped) tracers[(tracerI - 1) % tracers.length].w = tune.fx_scope_tracer_w; }
        }
        { // a red burst when the shot ends on a player, else a pale wall/floor/crate spark. A human's shot says it (spark); a bot's shot has no hit flag, so a player standing at its end point is the hit
          let hitP = e.human ? !e.spark : false, hitId = -1;
          for (const q of state.players) { const dx = q.x - e.to[0], dz = q.z - e.to[2]; if (q.alive && q.id !== e.by && dx * dx + dz * dz < 0.36 && e.to[1] - (q.st?.y ?? 0) < 2 && e.to[1] >= (q.st?.y ?? 0) - 0.05) { hitId = q.id; break; } }
          if (!e.human) hitP = hitId >= 0;
          const pf = nextPuff(); pf.m.material = pf.mats[hitP ? 1 : 0]; pf.m.position.set(e.to[0], e.to[1], e.to[2]); pf.m.visible = true;
          pf.life = pf.t = hitP ? tune.fx_hit_puff_life : tune.fx_spark_puff_life; pf.size = hitP ? tune.fx_hit_puff : tune.fx_spark_puff;
          if (hitP) {
            burst(e.to[0], e.to[1], e.to[2], 1, tune.fx_hit_count, tune.fx_hit_speed, tune.fx_hit_size, tune.fx_hit_life);
            if (hitId >= 0) hitTint[hitId] = state.t + tune.fx_hit_tint;
          } else {
            burst(e.to[0], e.to[1], e.to[2], 0, tune.fx_spark_count, tune.fx_spark_speed, tune.fx_spark_size, tune.fx_spark_life);
            // the mark faces the shooter along the grid's main axis (walls and crates are axis-aligned); at floor height it lies flat
            const d = nextDecal(), dx = e.from[0] - e.to[0], dz = e.from[2] - e.to[2];
            d.m.scale.setScalar(tune.fx_mark_size); d.t = tune.fx_mark_life; d.m.visible = true;
            const onFloor = e.to[1] < 0.05 || (hasHeights && Math.abs(e.to[1] - levelHeight()) < 0.05); // the ground, or the first floor's top
            if (onFloor) { d.m.position.set(e.to[0], e.to[1] + 0.02, e.to[2]); d.m.rotation.set(-Math.PI / 2, 0, 0); }
            else if (Math.abs(dx) > Math.abs(dz)) { d.m.position.set(e.to[0] + Math.sign(dx) * 0.02, e.to[1], e.to[2]); d.m.rotation.set(0, Math.sign(dx) * Math.PI / 2, 0); }
            else { d.m.position.set(e.to[0], e.to[1], e.to[2] + Math.sign(dz) * 0.02); d.m.rotation.set(0, dz > 0 ? 0 : Math.PI, 0); }
          }
        }
        if (e.human) { if (!CLASS_MODE) { SFX.shot(e.w); viewGuns[e.w].flash.visible = true; } } // class mode played it on the trigger
        else { const v = heard(e.x, e.z), at = heardFrom(e.x, e.z); SFX.shot(e.w, v * 0.8, at.pan, at.dist); }
        break;
      case 'hit': SFX.hit(); break;
      case 'hurt': SFX.hurt(); break;
      case 'killmark': SFX.kill(); break;
      case 'empty': SFX.empty(); break;
      case 'lowAmmo': SFX.lowAmmo(); break;
      case 'reload': SFX.reload(e.w); break;
      case 'click': SFX.click(); break;
      case 'melee': if (!(e.human && CLASS_MODE)) { swing[e.p] = tune.melee_time; SFX.swing(); } break; // story 016: the swing, first person and on the model (class mode played its own on the trigger)
      case 'pickup': SFX.pickup(); break;
      case 'buy': SFX.buy(); break;
      case 'answer': (e.right ? SFX.right : SFX.wrong)(); break;
      case 'plant': SFX.plant(); break;
      case 'defused': SFX.defused(); break;
      case 'beep': SFX.beep(Math.max(0.25, heard(e.x, e.z)), e.panic); break;
      case 'boom': SFX.boom(); burst(e.x, 0.6, e.z, 2, tune.fx_boom_debris, tune.fx_boom_debris_speed, 0.35, 1.1); break;
      case 'gate': SFX.gate(); break;
      case 'roundEnd': (e.win === state.human.squad ? SFX.win : SFX.lose)(); break;
      case 'round':
        for (const p of state.players) { models[p.id].team.color.setHex(SIDE_HEX[sideOf(state, p)]); models[p.id].group.rotation.set(0, p.yaw, 0); hitTint[p.id] = 0; }
        for (const gm of gates) { gm.position.y = 1.5; gm.visible = state.gatesClosed; } // open from the start in Free for All (story 019)
        break;
      case 'unlock': if (locked) document.exitPointerLock(); break;
      case 'matchEnd': scene = 'results'; resultsCountdown.steps = Math.round(Number(tune.results_countdown_s) / STEP); if (locked) document.exitPointerLock(); break;
    }
  }
  list.length = 0;
}

// ---- Scenes ---------------------------------------------------------------------------
export let titleT = 0;
const scenes: Record<string, { update(dt: number): void; draw(): void }> = {
  figures: {
    update(dt) { titleT += dt; },
    draw() { drawFigures(); },
  },
  title: {
    update(dt) {
      titleT += dt;
      const act = clicks.shift();
      const i = SUBJECT_LIST.indexOf(session.subject);
      if (pressed('ArrowDown')) session.subject = SUBJECT_LIST[(i + 1) % SUBJECT_LIST.length];
      if (pressed('ArrowUp')) session.subject = SUBJECT_LIST[(i + SUBJECT_LIST.length - 1) % SUBJECT_LIST.length];
      if (session.subject !== QUESTIONS.CUSTOM) {
        const all = Object.keys(QUESTIONS.SUBJECTS[session.subject].topics);
        for (let k = 0; k < all.length; k++) if (pressed('Digit' + (k + 1))) toggleTopic(all[k]);
        // The level: Left / Right step through Fácil, Medio, Difícil (a custom CSV ignores it, so it is locked there).
        const l = LEVELS.indexOf(session.level);
        if (pressed('ArrowLeft')) session.level = LEVELS[Math.max(0, l - 1)];
        if (pressed('ArrowRight')) session.level = LEVELS[Math.min(LEVELS.length - 1, l + 1)];
      }
      if (act && act.startsWith('subj:')) session.subject = act.slice(5);
      if (act && act.startsWith('topic:')) toggleTopic(act.slice(6));
      if (act && act.startsWith('level:')) session.level = act.slice(6) as Level;
      // The map: C steps through them, a click picks one; the flyover behind shows it.
      if (pressed('KeyC')) pickMap(MAP_IDS[(MAP_IDS.indexOf(session.map) + 1) % MAP_IDS.length]);
      if (act && act.startsWith('map:')) pickMap(act.slice(4));
      // The match options (story 017): the buy time steps by its config step within its range, friendly fire toggles, the bots' level is picked.
      if (act && act.startsWith('buyt:')) { const b = CONFIG.buy_time; session.buyTime = Math.min(b.max, Math.max(b.min, session.buyTime + Number(act.slice(5)) * b.step)); }
      if (act === 'ff') session.friendlyFire = !session.friendlyFire;
      if (act === 'streak') session.streakRewards = !session.streakRewards; // story 018
      if (act === 'mode') { session.mode = nextMode(session.mode); useMap(session.map, !MODE_INFO[session.mode].bomb); } // story 024: Bomba, Free for All, Duelo por equipos in turn; // story 019; 021: the map behind shows the mode
      if (act && act.startsWith('bot:')) session.botLevel = act.slice(4) as BotLevel;
      if (act === 'controls') { Object.assign(ctl, { from: 'title', sel: 0, capture: false, note: '' }); scene = 'controls'; return; }
      if (act === 'mainmenu' || pressed('Escape')) { scene = 'menu'; return; }
      if (pressed('Enter') || pressed('Space') || act === 'start') {
        if (session.subject === QUESTIONS.CUSTOM && !session.custom.length) { session.status = TOUCH ? 'Primero sube un CSV o elige una asignatura' : 'Primero sube un CSV (tecla U) o elige una asignatura'; return; }
        if (session.available === 0) { session.status = 'Todavía no hay preguntas para esta elección'; return; }
        startMatch(); scene = 'play';
      }
    },
    draw() { drawTitle(); },
  },
  play: {
    update(dt) {
      if (pressed(bind.pause) || pressed('Escape')) { scene = 'pause'; lookYaw = 0; lookPitch = 0; state.human.scoped = false; state.human.st.aimGun = ''; if (locked) document.exitPointerLock(); return; }
      if (CLASS_MODE) { netStep(readInput(clicks.shift())); return; }
      stepMatch(state, { [state.human.id]: readInput(clicks.shift()) }, dt);
      playEvents();
    },
    draw() { drawWorld(); drawHUD(); if (teacherPaused()) drawTeacherPause(); },
  },
  pause: {
    update() {
      const act = clicks.shift();
      if (CLASS_MODE) netStep(idleInput()); // the match goes on on the server: stand still, keep the seat
      if (pressed(bind.pause) || pressed('Escape') || act === 'resume') scene = 'play';
      if (act === 'controls') { Object.assign(ctl, { from: 'pause', sel: 0, capture: false, note: '' }); scene = 'controls'; }
      const sens = CONFIG[TOUCH ? 'touch_sens' : 'mouse_sens']; // the finger's own setting on a touch device
      if (pressed('BracketLeft') || act === 'sens:-') sens.value = Math.max(sens.min, +(sens.value - 0.1).toFixed(2));
      if (pressed('BracketRight') || act === 'sens:+') sens.value = Math.min(sens.max, +(sens.value + 0.1).toFixed(2));
      if (pressed('Backspace') || act === 'quit') { if (CLASS_MODE) aula.conn?.leave(); else scene = 'title'; }
    },
    draw() {
      drawWorld(); drawHUD(true);
      ctx.fillStyle = 'rgba(10,14,24,0.72)'; ctx.fillRect(0, 0, W, H);
      text('Pausa', W / 2, 200, 56, '#fff');
      text(TOUCH ? `Sensibilidad del dedo: ${tune.touch_sens.toFixed(1)}` : `Sensibilidad del ratón: ${tune.mouse_sens.toFixed(1)}`, W / 2, 290, 28, '#fff');
      button(W / 2 - 275, 270, 60, 44, '-', 'sens:-', { size: 30 });
      button(W / 2 + 215, 270, 60, 44, '+', 'sens:+', { size: 30 });
      if (!TOUCH) text('También con [ y ]', W / 2, 336, 18, '#c8d2e6', 'center', 'normal');
      button(W / 2 - 160, 380, 320, 52, TOUCH ? 'Continuar' : `Continuar (${keyName(bind.pause)} o clic)`, 'resume', { size: 22 });
      button(W / 2 - 160, 444, 320, 52, 'Controles', 'controls', { size: 22 });
      button(W / 2 - 160, 508, 320, 52, CLASS_MODE ? 'Salir de la sala' : 'Salir a la pantalla de sesión', 'quit', { size: 20 });
      text(`Asignatura: ${state.subjectLabel || ''}`, W / 2, 620, 18, '#c8d2e6', 'center', 'normal');
    },
  },
  controls: {
    update() {
      const act = clicks.shift(), n = ACTIONS.length; // rows 0..n-1 are the actions, n is Restablecer, n + 1 is Volver
      if (CLASS_MODE && ctl.from === 'pause') netStep(idleInput());
      if (act && act.startsWith('key:')) Object.assign(ctl, { sel: Number(act.slice(4)), capture: true, note: '' });
      else if (act === 'keysreset') { resetKeys(); Object.assign(ctl, { capture: false, note: 'Teclas por defecto restablecidas' }); }
      else if (act === 'back') { scene = ctl.from; return; }
      else if (act === 'bindleft' && ctl.capture && ACTIONS[ctl.sel].id === 'shoot') { // the left button is bound by its own button: the click that picks a row never lands here
        const a = ACTIONS[ctl.sel], other = setKey(a.id, 'Mouse0');
        ctl.capture = false;
        ctl.note = other ? `${other.label} pasa a ${keyName(bind[other.id])}` : `${a.label}: ${keyName('Mouse0')}`;
      } else if (ctl.capture) {
        const code = [...hit].find(c => c !== 'Mouse0'); // the right button can be bound by clicking; the left one only through its button (a click on a row or a button is never a key)
        if (code === 'Escape') Object.assign(ctl, { capture: false, note: 'Cambio cancelado' });
        else if (code && code.startsWith('Arrow')) ctl.note = 'Las flechas giran la vista: elige otra tecla';
        else if (code) {
          const a = ACTIONS[ctl.sel], other = setKey(a.id, code);
          ctl.capture = false;
          ctl.note = other ? `${other.label} pasa a ${keyName(bind[other.id])}` : `${a.label}: ${keyName(code)}`;
        }
      } else {
        const half = Math.ceil(n / 2);
        if (pressed('Escape')) { scene = ctl.from; return; }
        if (pressed('ArrowDown')) ctl.sel = Math.min(n + 1, ctl.sel + 1);
        if (pressed('ArrowUp')) ctl.sel = Math.max(0, ctl.sel - 1);
        if (pressed('ArrowRight') && ctl.sel < half) ctl.sel = Math.min(n - 1, ctl.sel + half);
        if (pressed('ArrowLeft') && ctl.sel >= half && ctl.sel < n) ctl.sel -= half;
        if (pressed('Enter')) {
          if (ctl.sel === n) { resetKeys(); ctl.note = 'Teclas por defecto restablecidas'; }
          else if (ctl.sel === n + 1) { scene = ctl.from; return; }
          else Object.assign(ctl, { capture: true, note: '' });
        }
      }
    },
    draw() {
      if (ctl.from === 'pause') { drawWorld(); drawHUD(true); } else flyover();
      buttons.length = 0;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(10,14,24,0.88)'; ctx.fillRect(0, 0, W, H);
      text('Controles', W / 2, 50, 40, '#ffd06a');
      if (TOUCH) { // no keys to bind: what each finger does
        const rows: [string, string][] = [['Palanca de la izquierda', 'moverte'], ['Arrastrar por la derecha', 'mirar a tu alrededor'], ['Fuego (mantener)', 'disparar; también gira si arrastras desde él'],
          ['Apuntar (mantener)', 'mirar por el arma'], ['Saltar', 'saltar'], ['Tumbarse', 'tumbarte; pulsa otra vez para levantarte'], ['Agacharse', 'agacharte; pulsa otra vez para levantarte'],
          ['De pie', 'ponerte de pie'], ['Recargar', 'recargar el arma'], ['El arma de arriba a la derecha', 'cambiar de arma'], ['Comprar', 'abrir o cerrar el menú de compra'], ['Botiquín', 'curarte con un botiquín comprado'], ['Plantar / Desactivar (mantener)', 'la bomba; aparece solo cuando puedes usarlo'],
          ['Tabla', 'ver las bajas y muertes de todos; toca otra vez para cerrarla'], ['Pausa', 'detener la partida']];
        rows.forEach(([a, d], i) => {
          const y = 100 + i * 36; // 15 rows end at 604, above Volver (644)
          rr(120, y - 17, 1040, 34, 8, 'rgba(255,255,255,0.06)', null);
          text(a, 144, y, 19, '#ffe7a8', 'left'); text(d, 560, y, 18, '#fff', 'left', 'normal');
        });
        button(W / 2 - 160, 644, 320, 52, 'Volver', 'back', { size: 22 });
        return;
      }
      text('Clic en una acción (o flechas y Intro) y pulsa la tecla nueva. Esc cancela.', W / 2, 94, 17, '#e4e9f4', 'center', 'normal');
      const n = ACTIONS.length, half = Math.ceil(n / 2);
      ACTIONS.forEach((a, i) => {
        const x = i < half ? 80 : 660, y = 118 + (i % half) * 44, on = ctl.sel === i, cap = on && ctl.capture;
        button(x, y, 540, 40, '', 'key:' + i, { fill: cap ? '#ffd06a' : on ? '#33415c' : undefined, stroke: on ? '#fff3c4' : undefined });
        text(a.label, x + 20, y + 20, 19, cap ? '#1b2232' : '#fff', 'left');
        const k = cap ? 'Pulsa una tecla…' : keyName(bind[a.id]);
        ctx.font = `bold 18px ${FONT}`; const kw = Math.max(64, ctx.measureText(k).width + 28);
        rr(x + 520 - kw, y + 4, kw, 32, 8, cap ? '#1b2232' : '#0d1220', '#ffd06a', 2);
        text(k, x + 520 - kw / 2, y + 20, 18, '#ffe7a8');
      });
      if (ctl.note) text(ctl.note, W / 2, 618, 18, '#9ff08a');
      if (ctl.capture && ACTIONS[ctl.sel].id === 'shoot') button(W / 2 - 160, 602, 320, 38, 'Usar el clic izquierdo', 'bindleft', { size: 20 }); // Disparar can take the left mouse button
      const sel = (i: number) => ctl.sel === i ? { stroke: '#fff3c4', fill: '#33415c' } : {};
      button(W / 2 - 340, 644, 320, 52, 'Restablecer', 'keysreset', { size: 22, ...sel(n) });
      button(W / 2 + 20, 644, 320, 52, 'Volver', 'back', { size: 22, ...sel(n + 1) });
    },
  },
  results: {
    update() {
      const act = clicks.shift();
      if (CLASS_MODE) {
        if (aula.vote) { if (pressed('Enter')) voteAct('vready'); else voteAct(act); return; } // story 029: Enter is Continuar while a vote is open
        const next = net.mirror && net.mirror.match !== state ? net.mirror : null; // a rematch already running
        // No next match yet: a room that stays (a teacher room) takes the student back to its waiting room; a closed one to the entry screen.
        if (!next) { if (pressed('Enter') || act === 'menu') { if (aula.room && aula.room.state !== 'ended') scene = 'waiting'; else aula.conn?.leave(); } return; }
        netStep(idleInput());
        if (pressed('Enter') || act === 'menu' || next.match.phase !== 'buy') { state = next.match; scene = 'play'; }
        return;
      }
      // Story 028: Enter and Continuar start the next match now; the mode and map buttons step to the next one (the countdown goes on);
      // the countdown reaching 0 does the same as Continuar; the session-screen button leaves the scene, which stops the countdown.
      if (act === 'menu') { scene = 'title'; return; }
      if (act === 'rmode') { session.mode = nextMode(session.mode); useMap(session.map, !MODE_INFO[session.mode].bomb); }
      if (act === 'rmap') pickMap(MAP_IDS[(MAP_IDS.indexOf(session.map) + 1) % MAP_IDS.length]);
      if (pressed('Enter') || act === 'go' || --resultsCountdown.steps <= 0) { startMatch(); scene = 'play'; }
    },
    draw() { drawWorld(); drawResults(); },
  },
  menu: {
    update(dt) {
      titleT += dt;
      const act = clicks.shift();
      if (pressed('ArrowUp') || pressed('ArrowDown')) menuSel = 1 - menuSel;
      const pick = act ?? (pressed('Digit1') ? 'solo' : pressed('Digit2') ? 'clase' : pressed('Enter') || pressed('Space') ? MENU[menuSel] : undefined);
      if (pick === 'solo') { menuSel = 0; scene = 'title'; }
      if (pick === 'clase') { menuSel = 1; scene = 'classinfo'; }
    },
    draw() { drawMenu(); },
  },
  classinfo: {
    update(dt) {
      titleT += dt;
      const act = clicks.shift();
      if (act === 'back' || pressed('Escape') || pressed('Enter') || pressed('Backspace')) scene = 'menu';
    },
    draw() { drawClassInfo(); },
  },
  join: {
    update(dt) {
      titleT += dt;
      const act = clicks.shift();
      nameInput.readOnly = aula.busy;
      if (nameInput.value !== aula.name) nameInput.value = aula.name;
      if (document.activeElement !== nameInput) nameInput.focus({ preventScroll: true });
      if (pressed('Enter') || act === 'enter') joinClass();
    },
    draw() { drawJoin(); },
  },
  waiting: {
    update(dt) {
      titleT += dt;
      const act = clicks.shift();
      if (!aula.conn) { scene = 'join'; return; }
      voteAct(act);
      if (act === 'leave' || (aula.room?.state === 'ended' && (act === 'again' || pressed('Enter')))) aula.conn.leave();
    },
    draw() { drawWaiting(); },
  },
};
/** The Controles screen: the selected row, whether it waits for a key, the last change, and the scene to go back to. */
const ctl = { sel: 0, capture: false, note: '', from: 'title' };
/** Picks the session's map and shows it behind the session screen. */
function pickMap(id: string): void {
  session.map = id; useMap(id, !MODE_INFO[session.mode].bomb);
}
function toggleTopic(t: string): void {
  const list = session.topics[session.subject];
  const i = list.indexOf(t);
  if (i >= 0) { if (list.length > 1) list.splice(i, 1); } else list.push(t);
}

// ---- Drawing: the 3D view ----------------------------------------------------------------
/** How many pickup models of each kind placeModels used this frame (kept, so nothing is allocated per frame). */
const used: Record<string, number> = { medkit: 0, ammo: 0 }, PICKUP_DRAW = ['medkit', 'ammo'];
/** The score table's rows, refilled each frame it shows. */
export const scoreRows: typeof state.players = [];
let lastPlace = 0; // the clock of the last placeModels call (character animation)
function placeModels() {
  const now = performance.now(), dt = Math.min(0.1, Math.max(0.001, (now - lastPlace) / 1000)), clock = now / 1000; lastPlace = now;
  for (let i = 0; i < swing.length; i++) swing[i] = Math.max(0, swing[i] - dt);
  used.medkit = 0; used.ammo = 0;
  for (const k of state.pickups ?? []) { // a slow turn so it reads as something to take
    const g = pickupMeshes[k.kind][used[k.kind]++];
    if (!g) continue;
    g.visible = true; g.position.set(k.x, k.y, k.z); g.rotation.y = clock * 1.5 + k.id;
  }
  for (const kind of PICKUP_DRAW) for (let i = used[kind]; i < pickupMeshes[kind].length; i++) pickupMeshes[kind][i].visible = false;
  for (const p of state.players) {
    const m = models[p.id];
    if (hitTint[p.id] > 0) { const on = state.t < hitTint[p.id] && state.t > hitTint[p.id] - 1; m.team.color.setHex(on ? 0xff2a1a : SIDE_HEX[sideOf(state, p)]); if (!on) hitTint[p.id] = 0; } // a hit flashes the model red for fx_hit_tint of match time (a new match's clock restarting ends it too)
    if (p === state.human) continue; // other students are drawn like bots
    m.group.visible = !p.hidden; // story 021: a hidden player is not drawn (class mode: the server sent no position)
    if (p.hidden) continue;
    const x = lerp(p.px, p.x, ALPHA), z = lerp(p.pz, p.z, ALPHA);
    const dist = m.ready ? Math.hypot(x - m.lx, z - m.lz) : 0; m.lx = x; m.lz = z; m.ready = true; // how far it moved since the last frame drives the walk
    m.group.position.set(x, p.st?.y ?? 0, z); m.group.rotation.set(0, p.yaw, 0); // at the feet height (story 011; 0 on a flat map)
    setSide(m, sideOf(state, p)); setHeld(m, p.cur);
    poseSoldier(m, p, dist, dt, clock);
    if (swing[p.id] > 0) m.aim.rotation.x += Math.sin((1 - swing[p.id] / tune.melee_time) * Math.PI) * 1.1; // the strike: arms and gun chop forward
    m.flash.visible = p.alive && p.flashT > 0 && m.hold.visible;
    m.flash.rotation.z = state.t * 40; m.flash.scale.setScalar((tune['fx_' + p.cur + '_flash'] ?? 0.45) / 0.45); // 0.45: the soldier flash's own size (makeSoldier); an unknown gun keeps it
    const bb = backBombs[p.id].group, planting = p.alive && (p.plantT > 0 || (state.plantT > 0 && state.bomb.carrier === p));
    bb.visible = p.alive && state.bomb.state === 'carried' && state.bomb.carrier === p;
    if (planting) { bb.position.set(0, 0.3, -0.5); bb.rotation.set(0, 0, 0); } else { bb.position.set(0, 0.78, 0.3); bb.rotation.set(Math.PI / 2, 0, 0); } // planting: in the hands near the floor; else on the back
  }
}
function drawWorld() {
  const p = state.human, view = p.alive ? p : (state.specP || p);
  placeModels();
  if (view === p) {
    camera.position.set(p.x, state.me.y + state.me.eye + state.me.jumpY, p.z); // feet height + eye + jump
    camera.rotation.set(p.pitch + p.recoil, p.yaw, 0, 'YXZ');
  } else {
    camera.position.set(lerp(view.px, view.x, ALPHA), (view.st?.y ?? 0) + EYE, lerp(view.pz, view.z, ALPHA));
    camera.rotation.set(0, view.yaw, 0, 'YXZ');
    models[view.id].group.visible = false;
  }
  const fov = p.alive && p.scoped ? tune[p.cur + '_aim_fov'] : tune.view_fov;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // gates sink into the floor when the round goes live
  if (state.gateT > 0) for (const g of gates) { g.position.y = 1.5 - Math.min(1, state.gateT / 0.7) * 3.2; g.visible = g.position.y > -1.5; }
  // the bomb's light blinks, red and fast on a wrong defuse answer
  const b = state.bomb;
  if (b.state === 'planted') {
    const fast = b.panicT > 0, on = Math.floor(state.t * (fast ? 14 : 3)) % 2 === 0;
    bombModel.lightMat.color.setHex(fast ? (on ? 0xff2020 : 0x400000) : (on ? 0xff5040 : 0x301010));
  } else bombModel.lightMat.color.setHex(0x44ff66);
  // the bomb on the floor: dropped, planted, or defused (until the next round)
  bombModel.group.visible = b.state === 'planted' || b.state === 'dropped' || b.state === 'defused';
  if (bombModel.group.visible) { bombModel.group.position.set(b.x, b.y ?? 0, b.z); bombModel.group.rotation.y = b.yaw ?? 0; }
  const showBeacon = b.state === 'planted' || b.state === 'dropped';
  beacon.group.visible = showBeacon;
  if (showBeacon) {
    beacon.group.position.set(b.x, b.y ?? 0, b.z);
    beacon.mat.color.setHex(b.state === 'planted' ? (b.panicT > 0 ? 0xff1a1a : 0xff4a2a) : 0xffb030);
    beacon.mat.opacity = 0.22 + 0.12 * Math.sin(state.t * (b.panicT > 0 ? 18 : 5));
    beacon.ring.scale.setScalar(1 + 0.15 * Math.sin(state.t * 4));
  }
  for (const tr of tracers) { // the bar thins out over its life
    if (tr.t <= 0) continue;
    tr.t -= 1 / 60; tr.m.scale.x = tr.m.scale.y = tr.w * Math.max(0, tr.t / tr.life); tr.m.visible = tr.t > 0;
  }
  for (const s of sparks) { // thrown cubes fall, stop on the floor and shrink away
    if (s.t <= 0) continue;
    s.t -= 1 / 60; s.vy -= tune.fx_gravity / 60;
    s.m.position.x += s.vx / 60; s.m.position.y += s.vy / 60; s.m.position.z += s.vz / 60;
    if (s.m.position.y < 0.03) { s.m.position.y = 0.03; s.vx = s.vy = s.vz = 0; }
    s.m.scale.setScalar(s.size * Math.max(0, s.t / s.life)); s.m.visible = s.t > 0;
  }
  for (const pf of puffs) { // the puff swells and fades
    if (pf.t <= 0) continue;
    pf.t -= 1 / 60; const k = Math.max(0, pf.t / pf.life);
    pf.m.scale.setScalar(pf.size * (1.4 - 0.6 * k)); pf.m.material.opacity = k; pf.m.visible = pf.t > 0;
  }
  for (const d of decals) { if (d.t <= 0) continue; d.t -= 1 / 60; d.m.material.opacity = 0.85 * Math.min(1, d.t / (tune.fx_mark_life * 0.5)); d.m.visible = d.t > 0; }
  const boom = state.boomT > 0, bk = 1 - state.boomT / 1.2; // bk: 0 at the blast, 1 at its end
  boomFlash.visible = boom && bk < tune.fx_boom_ball_time / 1.2; boomMesh.visible = boomRing.visible = boomColumn.visible = boom;
  if (boom) {
    boomFlash.position.set(b.x, (b.y ?? 0) + 1.5, b.z); boomFlash.scale.setScalar(3 + bk * 30); boomFlash.material.opacity = Math.max(0, 1 - bk * 1.2 / tune.fx_boom_ball_time);
    boomMesh.position.set(b.x, (b.y ?? 0) + 1, b.z); boomMesh.scale.setScalar(1 + Math.sqrt(bk) * tune.fx_boom_fireball); boomMesh.material.opacity = 0.9 * (1 - bk); boomMesh.material.color.setHSL(0.12 - 0.1 * bk, 1, 0.5);
    boomRing.position.set(b.x, (b.y ?? 0) + 0.12, b.z); boomRing.scale.setScalar(1 + Math.sqrt(bk) * tune.fx_boom_ring); boomRing.material.opacity = 0.9 * (1 - bk);
    boomColumn.position.set(b.x, b.y ?? 0, b.z); boomColumn.scale.set(2 + bk * 3, tune.fx_boom_column * Math.min(1, bk * 4), 2 + bk * 3); boomColumn.material.opacity = 0.55 * (1 - bk);
  }
  // The screen shake: stronger near the blast, never below a fifth of it, fading with the blast; the camera is put back after the draw
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, crz = camera.rotation.z;
  if (boom) {
    const amp = tune.fx_shake * Math.max(0.2, 1 - Math.hypot(b.x - cx, b.z - cz) / tune.fx_shake_range) * (1 - bk);
    camera.position.x += Math.sin(state.t * 71) * amp; camera.position.y += Math.sin(state.t * 97 + 1) * amp; camera.rotation.z = Math.sin(state.t * 83) * amp * 0.4;
  }
  renderer.clear(); renderer.render(world, camera);
  camera.position.set(cx, cy, cz); camera.rotation.z = crz;
  if (view !== p) models[view.id].group.visible = true;
  // first-person gun
  const lens = p.alive && p.scoped && p.cur === 'sniper'; // only the sniper looks through a black-rimmed lens
  const planting = p.alive && state.plantT > 0 && b.carrier === p; // plantT is the carrier's: another student's plant is not yours
  viewBomb.group.visible = planting;
  for (const [k, g] of Object.entries(viewGuns)) g.group.visible = p.alive && !lens && !planting && k === p.cur;
  if (planting) { // the bomb in your hands, lowered toward the floor as the plant fills
    const k = state.plantT / tune.plant_time;
    viewBomb.group.position.set(0.02, -0.28 - k * 0.12, -0.55);
    viewBomb.lightMat.color.setHex(Math.floor(state.t * 8) % 2 ? 0xff5040 : 0x44ff66);
    renderer.clearDepth(); renderer.render(gunScene, gunCam);
  } else if (p.alive && !lens) {
    const g = viewGuns[p.cur].group, bob = p.moving ? Math.sin(state.t * 11) : 0;
    const rl = p.reloadT > 0 ? Math.sin(Math.min(1, 1 - p.reloadT / tune.reload_time) * Math.PI) : 0;
    const S = 0.75, z = -0.5 + p.recoil * 1.6;
    g.scale.setScalar(S);
    if (p.scoped) { // aimed: the line through the sights lies on the camera's axis, so the sights sit exactly on the crosshair
      g.position.set(0, -viewGuns[p.cur].sight * S + Math.abs(bob) * 0.004 + p.recoil * 0.6, z - tune.fx_vm_aim_back);
      g.rotation.set(p.recoil * 2 - rl * 0.6, 0, 0);
    } else { // from the hip: the barrel turned to meet the crosshair's line `fx_vm_converge` ahead, so it points where the shot goes
      const x = 0.22 + bob * 0.012, y = -0.21 + Math.abs(bob) * 0.01 - rl * 0.22 + p.recoil * 0.6, ahead = tune.fx_vm_converge - z;
      g.position.set(x, y, z);
      g.rotation.set(Math.atan2(-y, ahead) + p.recoil * 2 - rl * 0.6, Math.atan2(x, ahead), 0);
    }
    if (swing[p.id] > 0) { // story 016: the melee strike, the gun swung forward and across
      const s = Math.sin((1 - swing[p.id] / tune.melee_time) * Math.PI);
      g.position.x -= s * 0.16; g.position.y += s * 0.06; g.position.z -= s * 0.22; g.rotation.x -= s * 0.9; g.rotation.z += s * 0.5;
    }
    viewGuns[p.cur].flash.visible = p.flashT > 0;
    viewGuns[p.cur].flash.rotation.z = state.t * 50; viewGuns[p.cur].flash.scale.setScalar(tune['fx_' + p.cur + '_flash']);
    renderer.clearDepth(); renderer.render(gunScene, gunCam);
  }
}
export const _v = new THREE.Vector3();
export function project(x: number, y: number, z: number): { x: number; y: number } | null {
  _v.set(x, y, z).project(camera);
  if (_v.z > 1) return null;
  return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H };
}

// ---- Loop: fixed step, frame time clamped ---------------------------------------------
export function step() {
  if (scene !== 'controls' && scene !== 'join' && pressed(bind.mute)) { setMuted(!isMuted()); hit.delete(bind.mute); }
  scenes[scene].update(STEP); hit.clear();
  if (clicks.length > 4) clicks.length = 0;
}
let last = 0, acc = 0, ALPHA = 1; // ALPHA: how far the frame is between the last two steps
function tick() {
  const now = clock.now();
  acc += Math.min(now - last, 0.25); last = now; // a stall never fast-forwards the game
  while (acc >= STEP) { step(); acc -= STEP; }
  ALPHA = acc / STEP;
  drawFrame();
}
function drawFrame() {
  if (net.mirror && state === net.mirror.match) interpolate(net.mirror, performance.now()); // the other players, a little in the past
  scenes[scene].draw();
  if (TOUCH) { // the on-screen controls: all of them in play, only Pausa with a card or menu open or when dead, none elsewhere
    const p = state.human, b = state.bomb, live = scene === 'play' && !teacherPaused();
    setTouchMode(!live ? 'off' : p.alive && !uiOpen(state) ? 'all' : 'pause');
    if (live) setUseLabel(b.carrier === p ? 'Plantar' : b.state === 'planted' && sideOf(state, p) === 'def' ? 'Desactivar' : 'Bomba');
    if (live) setAbilityButton(p.alive && !!p.kept); // story 018: the Cazador button, only while one is kept
    if (live) { setGunLabel(WEAPON[p.cur].name); setStance(p.st.prone ? 'prone' : p.st.stance === 'crouch' ? 'crouch' : 'stand'); }
  }
}
// Turned upright mid-play on a phone: the game pauses, as it does when the mouse leaves on a computer. Like the pause
// key, it pauses with a card open or while dead too, so nothing runs behind the message.
if (TOUCH) matchMedia('(orientation: portrait)').addEventListener('change', e => {
  if (e.matches && scene === 'play') { scene = 'pause'; lookYaw = 0; lookPitch = 0; state.human.scoped = false; state.human.st.aimGun = ''; }
});
function frame() { tick(); requestAnimationFrame(frame); }
export function timer() { if (document.visibilityState === 'visible' && clock.now() - last > 0.1) tick(); }

// ---- What a check can read and drive (?manual=1 stops the loop; players never see it) ----
install({
  get scene() { return scene; },
  get state() { return state; },
  press(code) { hit.add(code); },
  hold(code, on) { on ? down.add(code) : down.delete(code); },
  get events() { return events; },
  step(n = 1, draw = true, alpha = 1) {
    for (let i = 0; i < n; i++) step();
    if (draw) { ALPHA = alpha; drawFrame(); }
  },
  // Dev only (?manual=1): plays a single-player match on a map passed in (a scratch test map, story 011). Not in the menus.
  ...(manual ? { testMap(id: string, data: unknown): void { MAPS[id] = data as MapData; session.map = id; scene = 'play'; startMatch(); } } : {}),
});

// A value the panel (dev server) changes is read again: the default map, on the session screen.
addEventListener('tune', e => {
  if ((e as CustomEvent).detail?.key === 'default_map' && scene === 'title') pickMap(String(tune.default_map));
});
useMap(session.map);
state = blankMatch(seedFrom(CONFIG.seed));
aula.name = savedName();
scene = params.get('scene') || FIRST_SCENE;
if (scene === 'play' || scene === 'pause' || scene === 'results') startMatch();
last = clock.now();
if (manual) drawFrame();
else { requestAnimationFrame(frame); setInterval(timer, 50); }
