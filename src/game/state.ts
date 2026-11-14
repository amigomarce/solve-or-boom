// The match: its state, the roster, the weapon and shop tables, and the small helpers every
// rules module shares. No browser in here (no document, window, audio or three.js): the rules
// run in Node as well. What the screen needs to hear or draw comes out as data, in match.events.
import { EYE, MAP, type Cell } from './map';
import type { ParsedQuestion } from './csv';
import { levelFor } from './rules';
import { tune } from './tune';
import { LEVELS, type Level, type Loose } from './types';
import * as QUESTIONS from '../questions';

/** A person's stance, jump and eye height (data/config.json: crouch_*, prone_*, jump_velocity, gravity).
 *  Every player has one (`p.st`); `match.me` is the viewer's. */
export interface Stance { stance: string; prone: boolean; proneT: number; jumpY: number; vy: number; eye: number; sprint: boolean;
  /** The aim (story 013): '' not aiming, the gun being aimed with, or '!' for an aim a gun switch, reload, menu or death ended and that waits for the button to be let go. */
  aimGun: string;
  /** Height of the feet above the ground floor in metres (story 011): 0 on the ground, level_height on the first floor, between on a ramp. jumpY is the jump or fall on top of it. */
  y: number }

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
  /** Seat ids (0..7) played by a person from the first step. Default [0]: the single-player game's one human. */
  humans?: number[];
  /**
   * True for a classroom room: several students share the match and the server owns it. Each student buys and
   * defuses through their own question card and deck (deskOf). Default false.
   */
  classroom?: boolean;
  /** Friendly fire (story 017): shots hurt teammates. Default false (absent = off). Read in src/game/combat.ts. */
  friendlyFire?: boolean;
  /** The buy phase's length in seconds, every round (story 017). Default tune.buy_time; clamped to that entry's min..max. Read in src/game/rounds.ts. */
  buyTime?: number;
  /** The bots' level (story 017): 'facil' | 'normal' | 'dificil'. Default 'normal'; a classroom match is always 'normal'. Read in src/game/bots.ts and combat.ts. */
  botLevel?: BotLevel;
}
/** A bot level: multipliers on the bots' reaction and accuracy ramps, in data/config.json (bot_<level>_react_mult, bot_<level>_acc_mult). */
export type BotLevel = 'facil' | 'normal' | 'dificil';

/**
 * The match. Built field by field in blankMatch(); typing still to do (`Loose` keys).
 * The window.game hook shows this object as `state`.
 */
/** What a classroom server listens for in a match (see Match.count). Only people are ever reported, never bots. */
export interface MatchCount {
  /** Person `p` answered their card: right or wrong, for this topic label and level id ('' when the question has none). */
  answer(p: Loose, right: boolean, topic: string, level: string): void;
  /** `victim` died; `killer` is who shot them (null for the bomb or a self-kill). */
  kill(killer: Loose | null, victim: Loose): void;
}
export interface Match {
  players: Loose[]; feed: Loose[]; hurt: Loose[];
  /** What happened this step, for the screen to play and draw: main.ts reads and empties it after every step. */
  events: Loose[];
  /** The viewer's stance, jump and eye height: the same object as `match.human.st` (players[0].st when there is no viewer). */
  me: Stance;
  /** The player this screen plays and draws (the single-player human, or a classroom client's own seat); null on the server. */
  human: Loose;
  /** True in a classroom room (see MatchOptions.classroom). */
  classroom?: boolean;
  /**
   * Set only by a classroom server (src/server/room.ts) to count what its students do: it is told each judged answer
   * (with the card's topic and level) and each kill. Null in single player. Not enumerable, so the replay is unchanged.
   */
  count?: MatchCount | null;
  /** The match's seeded random numbers: every rules module draws from this, never from Math.random. */
  rng: () => number;
  /** The subject, level and map the match was built with. */
  opts: { subject: string; level: Level; map: string; friendlyFire: boolean; buyTime: number; botLevel: BotLevel };
  /** True once the match is won: step() does nothing more. */
  over: boolean;
  /** What the dead dropped this round (story 016): taken by walking over, gone after pickup_life and at the round's start. */
  pickups: Pickup[];
  [k: string]: Loose;
}

/** The roster: 8 seats, 4 per squad (seats 0..3 squad 0, 4..7 squad 1). The single-player human sits in seat 0. */
export const ROSTER = [
  { name: 'You', role: 'rifleman', squad: 0, human: true }, // human: the single-player seat (main.ts hides its model); a match's own humans come from MatchOptions.humans
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
  { id: 'medkit', name: 'Botiquín', price: 'price_medkit', desc: 'Se guarda y cura vida cuando lo usas' },
];

/**
 * Something a dead player left on the floor (story 016): a medkit or ammo for one gun. `id` is unique in the match
 * (match.nextPickupId), `x`, `z` and `y` (feet height) say where, and `age` is the seconds it has lain there.
 */
export interface Pickup { id: number; kind: 'medkit' | 'ammo'; gun: string; x: number; z: number; y: number; age: number }

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
export function freshStance(): Stance {
  const st = { stance: 'stand', prone: false, proneT: 0, jumpY: 0, vy: 0, eye: EYE, sprint: false, aimGun: '' } as Stance;
  // The feet height (story 011): not enumerable, like bomb.y, so a flat match's serialised state is unchanged.
  return Object.defineProperty(st, 'y', { value: 0, enumerable: false, writable: true });
}

/** The bot-only AI fields, fresh for a round (never on the human): cover and peeking, the staging wait,
 *  the pack rotation, a heard noise, the corner check and the stuck re-path. */
export function botFresh(): Loose {
  return {
    coverT: 0, cover: null, peek: null, peekT: 0, peekOut: false, plan: [], threatX: 0, threatZ: 0, wantCover: false, coverTry: -99,
    after: [], waitT: 0, rotating: false, rotT: 0, noiseX: 0, noiseZ: 0, noiseNew: false, investigating: false,
    cleared: false, looks: [], lookT: 0, strictT: -99,
  };
}
function newPlayer(r: Loose, i: number, human: boolean): Loose {
  const p = {
    id: i, name: human ? 'Tú' : 'Bot ' + r.name, role: r.role, squad: r.squad, human,
    x: 0, z: 0, px: 0, pz: 0, yaw: 0, pitch: 0, recoil: 0, hp: 100, armor: 0, alive: true,
    money: tune.start_money, primary: null, cur: 'pistol', ammo: {}, cool: 0, reloadT: 0, scoped: false,
    kills: 0, deaths: 0, right: 0, wrong: 0, moving: false, spotT: -99,
    target: null, reactT: 0, scanT: 0, path: [], pathI: 0, wps: [], arrived: false, holdYaw: 0, holdT: 0,
    routeKind: '', anchor: '', strafe: 1, strafeT: 0, alertT: 0, alertYaw: 0, lastX: 0, lastZ: 0, lastSeenT: -99,
    defusing: false, thinkT: 0, defuseRight: 0, plantT: 0, deadT: 0, walkPh: 0, flashT: 0, stuckT: 0, rotated: false,
    ...(human ? {} : botFresh()),
  };
  // Not enumerable, like Match.classroom: the same-seed replay compares the serialised state, which must not change.
  // `medkits` (story 016), the bought medkits carried, and `healT`, the seconds left of a medkit being used, are hidden for the same reason.
  return Object.defineProperties(p, { st: { value: freshStance(), enumerable: false, writable: true }, medkits: { value: 0, enumerable: false, writable: true }, healT: { value: 0, enumerable: false, writable: true } });
}
/** Takes a player's primary gun, armour and medkits away and gives back the pistol with a full magazine. */
export function resetGuns(p: Loose): void {
  p.primary = null; p.medkits = 0; p.healT = 0; p.cur = 'pistol'; p.armor = 0; p.scoped = false; p.st.aimGun = '';
  p.ammo = { pistol: { mag: tune.pistol_mag, res: tune.pistol_reserve } };
}

/**
 * A match before its first round: the roster on their pistols, no question deck. This is what the
 * screens read on the session screen. createMatch() (match.ts) builds one ready to play.
 * `humans` are the seats a person plays (default seat 0, the single-player game); the viewer `match.human` is the
 * first of them, or null for none (the server).
 * @example const m = blankMatch(7); m.players.length // 8
 */
export function blankMatch(seed: number, humans: number[] = [0]): Match {
  const match: Match = {
    t: 0, score: [0, 0], gained: '', round: 0, attSquad: 0, phase: 'buy', phaseT: 0, roundT: 0,
    players: ROSTER.map((r, i) => newPlayer(r, i, humans.includes(i))), human: null, lossStreak: [0, 0],
    bomb: { state: 'carried', carrier: null, x: 0, z: 0, timer: 0, defuser: null, panicT: 0, beepT: 0 },
    attackSite: 'A', alert: null, menu: false, card: null, deck: null, feed: [], msg: '', msgT: 0, banner: null,
    wrongStreak: 0, hurt: [], flashT: 0, hitT: 0, killT: 0, spec: 0, plantT: 0, boomT: 0, gateT: 0, gatesClosed: true, rtrT: 0, bombSeen: false,
    events: [], me: null as unknown as Stance, rng: mulberry32(seed), opts: { subject: '', level: 'medio', map: '', friendlyFire: false, buyTime: tune.buy_time, botLevel: 'normal' }, over: false,
    pickups: [], // made non-enumerable below
  };
  Object.defineProperty(match, 'classroom', { value: false, enumerable: false, writable: true });
  Object.defineProperty(match, 'count', { value: null, enumerable: false, writable: true });
  match.human = humans.length ? match.players[humans[0]] : null;
  match.me = (match.human ?? match.players[0]).st;
  // The bomb's height (feet level, like p.st.y): not enumerable, so the same-seed replay's serialised state is unchanged.
  Object.defineProperty(match.bomb, 'y', { value: 0, enumerable: false, writable: true });
  // Story 016, hidden for the same reason: what the dead dropped (Pickup[]), the next pickup id, and whether this round's first kill is made.
  Object.defineProperties(match, {
    pickups: { value: [], enumerable: false, writable: true }, nextPickupId: { value: 1, enumerable: false, writable: true },
    firstKill: { value: false, enumerable: false, writable: true },
  });
  match.players.forEach(resetGuns);
  return match;
}

/** 'att' or 'def': the side a player is on this half. */
export const sideOf = (match: Match, p: Loose): string => (p.squad === match.attSquad ? 'att' : 'def');
/** A squad as the screens name it. */
export const squadName = (s: number): string => (s === 0 ? 'Tu equipo' : 'Rivales');
/** True while `d` has the buy menu or a question card open: a match (its viewer's) or a deskOf(). */
export const uiOpen = (d: Loose): boolean => !!(d.menu || d.card);
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
/** Moves the spectator to the next living player of the viewer's squad (any living one when none is left). */
export function nextSpec(match: Match): void {
  if (!match.human) return;
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
/**
 * Where a person's buy menu, question card, wrong-answer streak and deck live (`menu`, `card`, `wrongStreak`, `deck`):
 * the match itself for the viewer and in single player (as before story 005 Part B), else the player's own desk.
 * A classroom server (no viewer) gives each student a desk with their own deck, built on first use from
 * `match.newDeck` (createMatch) and kept for the whole match, through a rejoin.
 * @example deskOf(room.match, room.match.players[2]).card // seat 2's open card, or null
 */
export function deskOf(match: Match, p: Loose): Loose {
  if (p === match.human || !match.classroom) return match;
  if (!p.desk) Object.defineProperty(p, 'desk', { value: { menu: false, card: null, wrongStreak: 0, deck: match.newDeck ? match.newDeck(p.id) : match.deck }, enumerable: false, writable: true });
  return p.desk;
}
/** Pushes an event for person `p`: in a classroom it carries `p` (the player id), so only that student's snapshot gets it. */
export function personal(match: Match, p: Loose, e: Loose): void { match.events.push(match.classroom ? { ...e, p: p.id } : e); }
/** Shows `p` a HUD message: the viewer's via say(); a classroom student's as a 'say' event for their snapshot. */
export function tell(match: Match, p: Loose, m: string, t = 3.5): void {
  if (p === match.human) say(match, m, t);
  else if (match.classroom) match.events.push({ type: 'say', p: p.id, text: m, t });
}
/** Opens a question card for `p` (kind 'buy' for an item, or 'defuse'), drawn from their deck; the screen frees the mouse for it. */
export function openCard(match: Match, p: Loose, kind: string, item?: string): void {
  const level = questionLevel(match, item), d = deskOf(match, p);
  d.card = { kind, item, level, q: d.deck.next(level), picked: -1, wrongT: 0, wrongTotal: 0, okT: 0, anim: 0, got: 0 };
  personal(match, p, { type: 'unlock' });
}
/**
 * Closes `p`'s open card. A question not yet answered goes back as the next draw (GDD Edge Cases); one in its
 * wrong-answer lockout was already missed, and one already answered right is spent. While a right answer is
 * being confirmed the card stays open unless `force` (death, the round ending, the bomb gone).
 */
export function closeCard(match: Match, p: Loose, force = false): void {
  const d = deskOf(match, p), c = d.card;
  if (!c || (c.okT > 0 && !force)) return;
  if (c.okT <= 0 && c.wrongT <= 0) d.deck.putBack(c.q);
  d.card = null;
}
/** Closes `p`'s buy menu and any card, even one confirming a right answer (death, the round's start or end, a bot taking the seat). */
export function closeDesk(match: Match, p: Loose): void { deskOf(match, p).menu = false; closeCard(match, p, true); }
