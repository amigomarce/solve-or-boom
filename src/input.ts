// Input state: keys by position (event.code), clicks on drawn buttons, the pointer.
// The listeners live in main.ts, beside the scenes they steer.

/** Keys held down now. */
export const down = new Set<string>();
/** Keys that went down this step. */
export const hit = new Set<string>();
/** True for one step after the key goes down. */
export const pressed = (code: string): boolean => hit.has(code);
/** Button acts waiting for the next step. */
export const clicks: string[] = [];
/** The pointer in logical (1280 x 720) coordinates. */
export const mouse = { x: -1, y: -1 };
/** A clickable box drawn this frame. */
export interface Button { x: number; y: number; w: number; h: number; act: string }
/** The clickable boxes drawn this frame; each draw empties and refills it. */
export const buttons: Button[] = [];
