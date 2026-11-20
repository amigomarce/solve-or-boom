// Where the 1280 x 720 game sits in the window: its scale and the bar above it. The one place for this maths, used by the
// canvases (screen.ts fit()) and by the phone controls that follow the canvas (touch.ts) (TD-011, docs/tech-debt-register.md).

/** The logical size everything is drawn at. */
export const LOGICAL_W = 1280, LOGICAL_H = 720;

/**
 * The game's box in the window now: `k` the scale from logical pixels to CSS pixels (the whole game fits, letterboxed),
 * `top` the CSS pixels of the bar above it.
 * @example const { k, top } = fitBox(); // a 1920 x 1200 window: k = 1.5, top = 60
 */
export function fitBox(): { k: number; top: number } {
  const k = Math.min(innerWidth / LOGICAL_W, innerHeight / LOGICAL_H);
  return { k, top: Math.max(0, Math.floor((innerHeight - LOGICAL_H * k) / 2)) };
}
