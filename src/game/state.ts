// The match: its state, the roster, the weapon and shop tables, and the small helpers every
// rules module shares. No browser in here (no document, window, audio or three.js): the rules
// run in Node as well. What the screen needs to hear or draw comes out as data, in match.events.
import { EYE, MAP, type Cell } from './map';
import type { ParsedQuestion } from './csv';
import { levelFor } from './rules';
import { tune } from './tune';
import { LEVELS, type Level, type Loose } from './types';
import * as QUESTIONS from '../questions';

/** The human's stance, jump and eye height (data/config.json: crouch_*, prone_*, jump_velocity, gravity).
 *  Kept off the player and off the match's own keys so a run that never uses them plays exactly as before. */
export interface Stance { stance: string; prone: boolean; proneT: number; jumpY: number; vy: number; eye: number; sprint: boolean }

/** What the match was built from: the question choices and the map. */
export interface MatchOptions {
  /** The seed of the match's random numbers: the same seed and inputs always end in the same state. */
  seed: number;
  /** A subject id from questions.SUBJECTS, or questions.CUSTOM. */
  subject: string;
  /** The level of the whole match (a custom CSV ignores it). */
  level: Level;
  /** The topic ids of the subject (empty for a custom CSV). */
  topics: string[];
  /** The host's own questions, when the subject is custom. */
  custom: ParsedQuestion[];
  /** The name of the host's CSV file. */
  customName: string;
  /** The map id (data/maps/). */
  map: string;
}

/**
 * The match. Built field by field in blankMatch(); typing still to do (`Loose` keys).
 * The window.game hook shows this object as `state`.
 */
export interface Match {
  players: Loose[]; feed: Loose[]; hurt: Loose[];
  /** What happened this step, for the screen to play and draw: main.ts reads and empties it after every step. */
  events: Loose[];
  /** The human's stance, jump and eye height. */
  me: Stance;
  /** The match's seeded random numbers: every rules module draws from this, never from Math.random. */
  rng: () => number;
  /** The subject, level and map the match was built with. */
  opts: { subject: string; level: Level; map: string };
  /** True once the match is won: step() does nothing more. */
  over: boolean;
  [k: string]: Loose;
}

/** The roster: the human plus 3 bot teammates against 4 bots. */
export const ROSTER = [
  { name: 'You', role: 'rifleman', squad: 0, human: true },
  { name: 'Kira', role: 'rusher', squad: 0 }, { name: 'Tomas', role: 'rifleman', squad: 0 }, { name: 'Ana', role: 'sniper', squad: 0 },
  { name: 'Rex', role: 'rusher', squad: 1 }, { name: 'Mila', role: 'rifleman', squad: 1 }, { name: 'Iker', role: 'rifleman', squad: 1 }, { name: 'Sol', role: 'sniper', squad: 1 },
];
/** The roles as the screens show them. */
export const ROLE_NAME: Record<string, string> = { rusher: 'Asaltante', rifleman: 'Fusilero', sniper: 'Francotirador' };
/** The guns: name, whether it fires while held, a bot's range and its accuracy multiplier. */
export const WEAPON: Record<string, { name: string; auto: boolean; range: number; botAcc: number }> = {
  pistol: { name: 'Pistola', auto: false, range: 35, botAcc: 0.8 },
  smg: { name: 'Subfusil', auto: true, range: 30, botAcc: 0.85 },
  rifle: { name: 'Rifle', auto: true, range: 60, botAcc: 1 },
  sniper: { name: 'Francotirador', auto: false, range: 120, botAcc: 1.5 },
};
/** What the buy menu sells; `price` is the data/config.json key. */
export const SHOP: { id: string; name: string; price: string; desc: string }[] = [
  { id: 'smg', name: 'Subfusil', price: 'price_smg', desc: 'Dispara rápido, mejor de cerca' },
  { id: 'rifle', name: 'Rifle', price: 'price_rifle', desc: 'Fuerte a cualquier distancia' },
  { id: 'sniper', name: 'Francotirador', price: 'price_sniper', desc: 'Mata de un tiro, lento. Clic derecho: mira' },
  { id: 'armor', name: 'Blindaje', price: 'price_armor', desc: 'Absorbe la mitad de cada impacto' },
  { id: 'ammo', name: 'Munición', price: 'price_ammo', desc: 'Rellena tu munición de reserva' },
];

/** The simulation step in seconds; motion is per second, never per frame. */
export const STEP = 1 / 60;

/** mulberry32: a seeded generator of numbers in [0, 1). Every gameplay random call reads one of these, never Math.random. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standing, grounded stance. */
export function freshStance(): Stance { return { stance: 'stand', prone: false, proneT: 0, jumpY: 0, vy: 0, eye: EYE, sprint: false }; }

/** The bot-only AI fields, fresh for a round (never on the human): cover and peeking, the staging wait,
 *  the pack rotation, a heard noise, the corner check and the stuck re-path. */
export function botFresh(): Loose {
  return {
    coverT: 0, cover: null, peek: null, peekT: 0, peekOut: false, plan: [], threatX: 0, threatZ: 0, wantCover: false, coverTry: -99,
    after: [], waitT: 0, rotating: false, rotT: 0, noiseX: 0, noiseZ: 0, noiseNew: false, investigating: false,
    cleared: false, looks: [], lookT: 0, strictT: -99,
  };
}
function newPlayer(r: Loose, i: number): Loose {
  return {
    id: i, name: r.human ? 'Tú' : 'Bot ' + r.name, role: r.role, squad: r.squad, human: !!r.human,
    x: 0, z: 0, px: 0, pz: 0, yaw: 0, pitch: 0, recoil: 0, hp: 100, armor: 0, alive: true,
    money: tune.start_money, primary: null, cur: 'pistol', ammo: {}, cool: 0, reloadT: 0, scoped: false,
    kills: 0, deaths: 0, right: 0, wrong: 0, moving: false, spotT: -99,
    target: null, reactT: 0, scanT: 0, path: [], pathI: 0, wps: [], arrived: false, holdYaw: 0, holdT: 0,
    routeKind: '', anchor: '', strafe: 1, strafeT: 0, alertT: 0, alertYaw: 0, lastX: 0, lastZ: 0, lastSeenT: -99,
    defusing: false, thinkT: 0, defuseRight: 0, plantT: 0, deadT: 0, walkPh: 0, flashT: 0, stuckT: 0, rotated: false,
    ...(r.human ? {} : botFresh()),
  };
}
/** Takes a player's primary gun and armour away and gives back the pistol with a full magazine. */
export function resetGuns(p: Loose): void {
  p.primary = null; p.cur = 'pistol'; p.armor = 0; p.scoped = false;
  p.ammo = { pistol: { mag: tune.pistol_mag, res: tune.pistol_reserve } };
}

/**
 * A match before its first round: the roster on their pistols, no question deck. This is what the
 * screens read on the session screen. createMatch() (match.ts) builds one ready to play.
 * @example const m = blankMatch(7); m.players.length // 8
 */
export function blankMatch(seed: number): Match {
  const match: Match = {
    t: 0, score: [0, 0], gained: '', round: 0, attSquad: 0, phase: 'buy', phaseT: 0, roundT: 0,
    players: ROSTER.map(newPlayer), human: null, lossStreak: [0, 0],
    bomb: { state: 'carried', carrier: null, x: 0, z: 0, timer: 0, defuser: null, panicT: 0, beepT: 0 },
    attackSite: 'A', alert: null, menu: false, card: null, deck: null, feed: [], msg: '', msgT: 0, banner: null,
    wrongStreak: 0, hurt: [], flashT: 0, hitT: 0, killT: 0, spec: 0, plantT: 0, boomT: 0, gateT: 0, gatesClosed: true, rtrT: 0, bombSeen: false,
    events: [], me: freshStance(), rng: mulberry32(seed), opts: { subject: '', level: 'medio', map: '' }, over: false,
  };
  match.human = match.players[0];
  match.players.forEach(resetGuns);
  return match;
}

/** 'att' or 'def': the side a player is on this half. */
export const sideOf = (match: Match, p: Loose): string => (p.squad === match.attSquad ? 'att' : 'def');
/** A squad as the screens name it. */
export const squadName = (s: number): string => (s === 0 ? 'Tu equipo' : 'Rivales');
/** True while the human has the buy menu or a question card open. */
export const uiOpen = (match: Match): boolean => !!(match.menu || match.card);
/** How far the bots' skill has ramped, 0 to 1. */
export const level = (match: Match): number => levelFor(match.round, tune.ramp_rounds);
/** Shows a HUD message for t seconds (match.msg, match.msgT). */
export function say(match: Match, m: string, t = 3.5): void { match.msg = m; match.msgT = t; }
/** Adds a line to the kill feed (the newest first, at most 5). */
export function feed(match: Match, s: string, mine: boolean): void { match.feed.unshift({ s, t: 6, mine }); match.feed.length = Math.min(match.feed.length, 5); }
/** The loaded map's spawn cells for a side (data/maps/). */
export function spawnSpots(side: string): Cell[] {
  return side === 'att' ? MAP.spawns.att : MAP.spawns.def;
}
/** Moves the spectator to the next living player of the human's squad (any living one when none is left). */
export function nextSpec(match: Match): void {
  const pool = match.players.filter(p => p.alive && p.squad === match.human.squad && !p.human);
  const any = pool.length ? pool : match.players.filter(p => p.alive);
  if (!any.length) return;
  match.spec = (match.spec + 1) % any.length; match.specP = any[match.spec];
}

/**
 * The level of the question an item asks: the match level stepped up by `question_step_<item>`, at most Difícil.
 * No item (the defuse) uses the match level. A custom CSV ignores levels, so it returns undefined.
 */
export function questionLevel(match: Match, item?: string): Level | undefined {
  if (match.opts.subject === QUESTIONS.CUSTOM) return undefined;
  const step = item ? tune['question_step_' + item] : 0;
  return LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(match.opts.level) + step)];
}
/** Opens a question card (kind 'buy' for an item, or 'defuse'); the screen frees the mouse for it. */
export function openCard(match: Match, kind: string, item?: string): void {
  const level = questionLevel(match, item);
  match.card = { kind, item, level, q: match.deck.next(level), picked: -1, wrongT: 0, wrongTotal: 0, okT: 0, anim: 0, got: 0 };
  match.events.push({ type: 'unlock' });
}
/**
 * Closes the open card. A question not yet answered goes back as the next draw (GDD Edge Cases); one in its
 * wrong-answer lockout was already missed, and one already answered right is spent. While a right answer is
 * being confirmed the card stays open unless `force` (death, the round ending, the bomb gone).
 */
export function closeCard(match: Match, force = false): void {
  const c = match.card;
  if (!c || (c.okT > 0 && !force)) return;
  if (c.okT <= 0 && c.wrongT <= 0) match.deck.putBack(c.q);
  match.card = null;
}
