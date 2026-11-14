// Touch play (story 014): a left stick to move, a drag on the right half to aim, and round buttons for the rest.
// The controls are DOM elements over the canvases (so they use the whole screen, notch insets included) that push the
// same bound key codes into the `down` / `hit` sets as the keyboard does: main.ts reads them through held() / pressed().
// Only the drag has its own path (`touch.dx / dy`, read by main.ts's readInput). Nothing is built without a touch device.
import { params } from './hook';
import { tune } from './game/tune';
import { down, hit } from './input';
import { bind } from './keys';

/** True on a phone or tablet (a coarse primary pointer and a touch screen), or with ?touch=1 in the address (a desktop check). */
export const TOUCH = params.get('touch') === '1' || (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);

/** Pixels the finger dragged on the right half since the last step (CSS px); main.ts turns them into the aim and empties them. */
export const touch = { dx: 0, dy: 0 };

/** The pixel ratio to draw at: the device's, and on a touch device at most `touch_pixel_ratio` (the phone graphics level). */
export function renderRatio(): number {
  const r = devicePixelRatio || 1;
  return TOUCH ? Math.min(r, tune.touch_pixel_ratio) : r;
}

/** Which controls show: none (menus, pause), only the pause button (a card is open, or you are dead), or all of them. */
export type TouchMode = 'off' | 'pause' | 'all';

/** A button; `id` is the finger holding it (-1 none), so only that finger's lift lets it go. */
interface Btn { el: HTMLElement; action: string; toggle: boolean; id: number }
const btns: Btn[] = [];
const held = new Set<Btn>();
let root: HTMLElement, aimZone: HTMLElement, stickZone: HTMLElement, knob: HTMLElement, base: HTMLElement, useBtn: HTMLElement, gunBtn: HTMLElement, abilityBtn: HTMLElement;
/** The stance buttons (Tumbarse, Agacharse, De pie) and the stance main.ts last reported, which they light and act on. */
const stanceBtns: Record<string, HTMLElement> = {};
let stance = 'stand';
let mode: TouchMode = 'off';
let stickId = -1, aimId = -1, lastX = 0, lastY = 0;

/** Lets go of everything: the stick, the drag, every held or toggled button. Run when the controls change, and when the
 *  page loses focus or is hidden (a finger whose lift the page never sees must not leave a key down or a zone taken). */
function releaseAll(): void {
  setAxes(0, 0); stickId = -1; aimId = -1; touch.dx = 0; touch.dy = 0; knob.style.transform = '';
  for (const b of btns) { down.delete(bind[b.action]); b.el.classList.remove('on'); b.id = -1; }
  held.clear();
  stanceBtns[stance]?.classList.add('on'); // the stance stays lit: it is the player's, not a held key
}

/** Shows the controls for `mode`; a change lets go of everything held, so no key stays down when the controls vanish. */
export function setTouchMode(m: TouchMode): void {
  if (!TOUCH || m === mode) return;
  mode = m;
  releaseAll();
  root.style.display = m === 'off' ? 'none' : 'block';
  const all = m === 'all';
  aimZone.style.display = stickZone.style.display = all ? 'block' : 'none'; base.style.display = all ? 'flex' : 'none';
  for (const b of btns) if (b.action !== 'pause') b.el.style.display = all ? 'flex' : 'none';
}

/** The plant / defuse button's word: 'Plantar' carrying the bomb, 'Desactivar' by a planted bomb; with 'Bomba' (nothing to do
 *  with the bomb) the button hides, so it only shows when it can be used. */
export function setUseLabel(s: string): void {
  if (!TOUCH) return;
  if (useBtn.textContent !== s) useBtn.textContent = s;
  const show = mode === 'all' && s !== 'Bomba' ? 'flex' : 'none';
  if (useBtn.style.display !== show) useBtn.style.display = show;
}

/** Story 018: the Cazador button shows only while one is kept to use (`show`); a tap presses the ability control. */
export function setAbilityButton(show: boolean): void {
  if (!TOUCH) return;
  const d = mode === 'all' && show ? 'flex' : 'none';
  if (abilityBtn.style.display !== d) abilityBtn.style.display = d;
}

/** The weapon selector's word: the gun in hand (a tap swaps to the other one). */
export function setGunLabel(name: string): void { const s = name + ' ⇄'; if (TOUCH && gunBtn.textContent !== s) gunBtn.textContent = s; }

/** The player's stance now ('stand', 'crouch' or 'prone'): lights its button and is what the stance buttons act from. */
export function setStance(st: string): void {
  if (!TOUCH || st === stance) return;
  stance = st;
  for (const [k, el] of Object.entries(stanceBtns)) el.classList.toggle('on', k === st);
}

function setAxes(f: number, s: number): void {
  for (const [code, on] of [[bind.forward, f > 0], [bind.back, f < 0], [bind.left, s < 0], [bind.right, s > 0]] as const) {
    if (on) down.add(code); else down.delete(code);
  }
}

if (TOUCH) {
  document.documentElement.classList.add('touch');
  root = document.getElementById('touch') as HTMLElement;
  const u = tune.touch_button_size, stick = tune.touch_stick_size;

  /** One round button that holds `action`'s bound key while it is pressed (or flips it on each tap when `toggle`). */
  const make = (action: string, label: string, size: number, css: string, toggle = false, onTap?: () => void): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'tb'; el.textContent = label;
    el.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.max(label.length > 7 ? 9 : 10, Math.round(u * (label.length > 7 ? 0.17 : 0.2)))}px;${css}`; // long words a little smaller, so they fit the circle
    const b: Btn = { el, action, toggle, id: -1 };
    let fx = 0, fy = 0; // where the finger holding this button was last
    const release = (e: PointerEvent): void => {
      if (b.toggle || !held.has(b) || e.pointerId !== b.id) return;
      held.delete(b); b.id = -1; down.delete(bind[b.action]); el.classList.remove('on');
    };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (onTap) { onTap(); return; }
      const code = bind[action];
      if (b.toggle) { if (down.has(code)) { down.delete(code); el.classList.remove('on'); } else { down.add(code); hit.add(code); el.classList.add('on'); } return; }
      if (held.has(b)) return; // a second finger on a held button changes nothing
      el.setPointerCapture(e.pointerId); b.id = e.pointerId;
      held.add(b); down.add(code); hit.add(code); el.classList.add('on');
      fx = e.clientX; fy = e.clientY;
    });
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release); el.addEventListener('lostpointercapture', release);
    // Fire doubles as a steering finger: dragging from it turns the view, so shooting while turning needs one thumb.
    if (action === 'shoot') el.addEventListener('pointermove', e => {
      if (!held.has(b) || e.pointerId !== b.id) return;
      touch.dx += e.clientX - fx; touch.dy += e.clientY - fy; fx = e.clientX; fy = e.clientY;
    });
    btns.push(b); root.append(el);
    return el;
  };

  // The drag zone: the right half. Added first, so the buttons (added after) sit over it.
  aimZone = document.createElement('div');
  aimZone.className = 'tz'; aimZone.style.cssText = 'left:50%;right:0;top:0;bottom:0';
  aimZone.addEventListener('pointerdown', e => {
    if (aimId >= 0) return;
    e.preventDefault(); aimZone.setPointerCapture(e.pointerId); aimId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
  });
  aimZone.addEventListener('pointermove', e => {
    if (e.pointerId !== aimId) return;
    touch.dx += e.clientX - lastX; touch.dy += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  });
  const endAim = (e: PointerEvent): void => { if (e.pointerId === aimId) aimId = -1; };
  aimZone.addEventListener('pointerup', endAim); aimZone.addEventListener('pointercancel', endAim); aimZone.addEventListener('lostpointercapture', endAim);
  root.append(aimZone);

  // The layout (a Free Fire-like HUD the person drew, HUD.tiff): left thumb, the stick (1) low on the left with Comprar (7) and
  // Botiquín (8) in a column at the edge; right thumb, Fuego (2) big low on the right with Apuntar (3) above it, and the
  // stances Tumbarse (4), Agacharse (5) and De pie (6) in a column at the edge; the weapon selector (9) above Apuntar with
  // Recargar beside it, Saltar left of Fuego, and Plantar / Desactivar left of Apuntar, shown only when it can be used.
  // Positions are fractions of the screen (centre x %, centre y %), the edge columns kept clear of the notch; the right
  // thumb's buttons sit a little above the drawing's spots so Fuego clears the canvas's bomb and ammo boxes, and the stick
  // clears the stance box.
  const at = (x: number, y: number, w: number, h = w): string => `left:calc(${x}% - ${w / 2}px);top:calc(${y}% - ${h / 2}px)`;
  const atLeft = (x: number, y: number, w: number): string => `left:max(calc(${x}% - ${w / 2}px), env(safe-area-inset-left, 0px));top:calc(${y}% - ${w / 2}px)`;
  const atRight = (x: number, y: number, w: number): string => `right:max(calc(${100 - x}% - ${w / 2}px), env(safe-area-inset-right, 0px));top:calc(${y}% - ${w / 2}px)`;
  const pill = (w: number, h: number): string => `width:${w}px;height:${h}px;border-radius:${h / 2}px;padding:0 10px`;

  // 1: the stick. A ring and a knob; the zone around it is a little bigger than the ring, so a thumb need not be exact.
  const pad = Math.round(stick * 0.25);
  base = document.createElement('div');
  base.className = 'ring'; base.style.cssText = `width:${stick}px;height:${stick}px;${at(21.5, 64, stick)}`;
  knob = document.createElement('div');
  knob.className = 'knob'; knob.style.cssText = `width:${Math.round(stick * 0.42)}px;height:${Math.round(stick * 0.42)}px`;
  base.append(knob);
  stickZone = document.createElement('div');
  stickZone.className = 'tz'; stickZone.style.cssText = `width:${stick + 2 * pad}px;height:${stick + 2 * pad}px;${at(21.5, 64, stick + 2 * pad)}`;
  const steer = (e: PointerEvent): void => {
    const r = base.getBoundingClientRect(), R = stick / 2;
    const vx = e.clientX - (r.left + R), vy = e.clientY - (r.top + R), len = Math.hypot(vx, vy), cap = Math.min(len, R) / (len || 1);
    knob.style.transform = `translate(${vx * cap}px,${vy * cap}px)`;
    if (len < tune.touch_deadzone * R) { setAxes(0, 0); return; }
    // 8 ways, like the keys: an axis is on when the knob leans past 22.5 degrees off the other axis.
    setAxes(-vy / len > 0.38 ? 1 : -vy / len < -0.38 ? -1 : 0, vx / len > 0.38 ? 1 : vx / len < -0.38 ? -1 : 0);
  };
  stickZone.addEventListener('pointerdown', e => {
    if (stickId >= 0) return;
    e.preventDefault(); stickZone.setPointerCapture(e.pointerId); stickId = e.pointerId; steer(e);
  });
  stickZone.addEventListener('pointermove', e => { if (e.pointerId === stickId) steer(e); });
  const endStick = (e: PointerEvent): void => { if (e.pointerId === stickId) { stickId = -1; setAxes(0, 0); knob.style.transform = ''; } };
  stickZone.addEventListener('pointerup', endStick); stickZone.addEventListener('pointercancel', endStick); stickZone.addEventListener('lostpointercapture', endStick);
  root.append(base, stickZone);
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // 7 and 8: Comprar and Botiquín, a column at the left edge.
  make('buy', 'Comprar', u, atLeft(5.5, 66.5, u));
  make('medkit', 'Botiquín', u, atLeft(5.5, 85, u)); // story 016: use a carried medkit
  // Story 018: the kept Cazador, above Comprar in the same column (clear of the kill counter and Tabla under the minimap); only while one is kept.
  abilityBtn = make('ability', 'Cazador', u, atLeft(5.5, 47.5, u));
  abilityBtn.style.display = 'none';
  // 2 and 3: Fuego (big) and Apuntar above it.
  const fire = Math.round(u * tune.touch_fire_scale), aim = Math.round(u * tune.touch_aim_scale);
  make('shoot', 'Fuego', fire, at(77, 66, fire)).classList.add('fire');
  make('aim', 'Apuntar', aim, at(77.8, 40, aim));
  // 4, 5 and 6: the stances, a column at the right edge. Tumbarse flips prone; Agacharse flips crouch (standing up first
  // from prone); De pie stands up from either.
  const crouchOff = (): void => { down.delete(bind.crouch); };
  stanceBtns.prone = make('prone', 'Tumbarse', u, atRight(94.3, 55.5, u), false, () => { crouchOff(); hit.add(bind.prone); });
  stanceBtns.crouch = make('crouch', 'Agacharse', u, atRight(94.3, 71.5, u), false, () => {
    if (stance === 'prone') { hit.add(bind.prone); down.add(bind.crouch); } else if (down.has(bind.crouch)) crouchOff(); else down.add(bind.crouch);
  });
  stanceBtns.stand = make('stand', 'De pie', u, atRight(94.3, 87.5, u), false, () => { crouchOff(); if (stance === 'prone') hit.add(bind.prone); });
  stanceBtns.stand.classList.add('on');
  // 9: the weapon selector, the gun in hand (a tap swaps guns), with Recargar beside it at the edge.
  const gw = Math.round(u * 2.1), gh = Math.round(u * 0.75);
  gunBtn = make('swap', 'Pistola ⇄', gw, `${pill(gw, gh)};${at(85, 22, gw, gh)}`);
  make('reload', 'Recargar', u, atRight(94.3, 22, u));
  // Saltar left of Fuego; Plantar / Desactivar left of Apuntar, only while it can be used (setUseLabel).
  make('jump', 'Saltar', u, at(64.5, 66, u));
  const uw = Math.round(u * 1.7), uh = Math.round(u * 0.8);
  useBtn = make('use', 'Plantar', uw, `${pill(uw, uh)};${at(64.5, 44, uw, uh)}`);
  // Story 016: the score table, opened and closed by a tap, beside the kill counter under the minimap (drawn by main.ts at logical y 176..220).
  make('scores', 'Tabla', Math.round(u * 0.8), `left:calc(50% - var(--k) * 640px + var(--k) * 142px);top:calc(var(--bar) + var(--k) * 176px)`, true);
  make('pause', 'Pausa', Math.round(u * 0.8), `left:calc(50% + var(--k) * 240px + 6px);top:calc(var(--bar) + 8px)`);

  /** Where the canvas sits (the same maths as fit() in screen.ts), for the positions that follow it. */
  const layout = (): void => {
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    root.style.setProperty('--k', String(k));
    root.style.setProperty('--bar', Math.max(0, Math.floor((innerHeight - 720 * k) / 2)) + 'px');
  };
  layout(); addEventListener('resize', layout);

  // No long-press menu, no pinch or double-tap zoom (Safari's gesture events), and the first tap asks for a full screen
  // where the browser has one (Android, iPad; not iPhone), landscape-locked where it can be.
  addEventListener('contextmenu', e => e.preventDefault());
  for (const t of ['gesturestart', 'gesturechange'] as const) document.addEventListener(t, e => e.preventDefault());
  addEventListener('click', () => {
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => { /* the browser said no: the page stays as it is */ });
  }, { once: true });
}
