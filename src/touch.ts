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
let root: HTMLElement, aimZone: HTMLElement, stickZone: HTMLElement, knob: HTMLElement, base: HTMLElement, useBtn: HTMLElement;
let mode: TouchMode = 'off';
let stickId = -1, aimId = -1, lastX = 0, lastY = 0;

/** Lets go of everything: the stick, the drag, every held or toggled button. Run when the controls change, and when the
 *  page loses focus or is hidden (a finger whose lift the page never sees must not leave a key down or a zone taken). */
function releaseAll(): void {
  setAxes(0, 0); stickId = -1; aimId = -1; touch.dx = 0; touch.dy = 0; knob.style.transform = '';
  for (const b of btns) { down.delete(bind[b.action]); b.el.classList.remove('on'); b.id = -1; }
  held.clear();
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

/** The plant / defuse button's word: 'Plantar' with the bomb in a site, 'Desactivar' by a planted bomb, else 'Bomba'. */
export function setUseLabel(s: string): void { if (TOUCH && useBtn.textContent !== s) useBtn.textContent = s; }

function setAxes(f: number, s: number): void {
  for (const [code, on] of [[bind.forward, f > 0], [bind.back, f < 0], [bind.left, s < 0], [bind.right, s > 0]] as const) {
    if (on) down.add(code); else down.delete(code);
  }
}

if (TOUCH) {
  document.documentElement.classList.add('touch');
  root = document.getElementById('touch') as HTMLElement;
  const u = tune.touch_button_size, big = Math.round(u * 1.4), g = 10, stick = tune.touch_stick_size;
  const colB = 14 + big + g, colC = colB + u + g;
  const inset = (side: 'left' | 'right', px: number): string => `calc(env(safe-area-inset-${side}, 0px) + ${px}px)`;
  // Over the canvas's bottom-right corner sit the ammo box and, above it, the bomb carrier's box (up to 142 logical px):
  // the inner columns start over them.
  const above = (px: number): string => `calc(var(--bar) + var(--k) * 148px + ${px}px)`;

  /** One round button that holds `action`'s bound key while it is pressed (or flips it on each tap when `toggle`). */
  const make = (action: string, label: string, size: number, css: string, toggle = false): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'tb'; el.textContent = label;
    el.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.max(10, Math.round(u * 0.2))}px;${css}`;
    const b: Btn = { el, action, toggle, id: -1 };
    let fx = 0, fy = 0; // where the finger holding this button was last
    const release = (e: PointerEvent): void => {
      if (b.toggle || !held.has(b) || e.pointerId !== b.id) return;
      held.delete(b); b.id = -1; down.delete(bind[b.action]); el.classList.remove('on');
    };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
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

  // The stick: a ring and a knob; the zone around it is a little bigger than the ring, so a thumb need not be exact.
  const pad = Math.round(stick * 0.25);
  const sx = inset('left', 28), sy = `calc(var(--bar) + var(--k) * 90px + 6px)`;
  base = document.createElement('div');
  base.className = 'ring'; base.style.cssText = `width:${stick}px;height:${stick}px;left:${sx};bottom:${sy}`;
  knob = document.createElement('div');
  knob.className = 'knob'; knob.style.cssText = `width:${Math.round(stick * 0.42)}px;height:${Math.round(stick * 0.42)}px`;
  base.append(knob);
  stickZone = document.createElement('div');
  stickZone.className = 'tz'; stickZone.style.cssText = `left:calc(${sx} - ${pad}px);bottom:calc(${sy} - ${pad}px);width:${stick + 2 * pad}px;height:${stick + 2 * pad}px`;
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

  // Right thumb, bottom corner outwards: fire (big) with jump and plant / defuse above it; aim and crouch in the next
  // column, reload, swap gun and buy in the third. Pause sits at the top, just right of the score box.
  const right = (px: number): string => `right:${inset('right', px)}`;
  const offset = Math.round((big - u) / 2);
  make('shoot', 'Fuego', big, `${right(14)};bottom:calc(var(--bar) + 14px)`).classList.add('fire');
  make('jump', 'Saltar', u, `${right(14 + offset)};bottom:calc(var(--bar) + ${14 + big + g}px)`);
  useBtn = make('use', 'Bomba', u, `${right(14 + offset)};bottom:calc(var(--bar) + ${14 + big + g + u + g}px);width:auto;min-width:${u}px;padding:0 10px;border-radius:${u / 2}px`);
  make('aim', 'Apuntar', u, `${right(colB)};bottom:${above(0)}`);
  make('crouch', 'Agachar', u, `${right(colB)};bottom:${above(u + g)}`, true);
  make('reload', 'Recargar', u, `${right(colC)};bottom:${above(0)}`);
  make('swap', 'Arma', u, `${right(colC)};bottom:${above(u + g)}`);
  make('buy', 'Comprar', u, `${right(colC)};bottom:${above(2 * (u + g))}`);
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
