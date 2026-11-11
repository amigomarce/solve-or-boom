// The drawing kit: the 2D overlay canvas, sized to the window, and its text, panels and buttons.
import type * as THREE from 'three';
import { buttons, mouse } from './input';

/** Logical size: everything is drawn at 1280 x 720 and scaled to the window. */
export const W = 1280, H = 720;
/** The game's typeface. */
export const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

const wrap = document.getElementById('wrap') as HTMLDivElement;
/** The 2D overlay canvas: the HUD, menus and cards. */
export const canvas = document.getElementById('game') as HTMLCanvasElement;
/** The WebGL canvas behind it: the 3D world. */
export const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
/** The overlay's 2D context. */
export const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
let renderer: THREE.WebGLRenderer | null = null;

/** Lets fit() resize the 3D renderer with the overlay. */
export function setRenderer(r: THREE.WebGLRenderer): void { renderer = r; }

/** Fills the window at any size and pixel ratio. */
export function fit(): void {
  const k = Math.min(innerWidth / W, innerHeight / H);
  const r = k * (devicePixelRatio || 1);
  canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
  wrap.style.width = Math.round(W * k) + 'px'; wrap.style.height = Math.round(H * k) + 'px';
  wrap.style.top = Math.max(0, Math.floor((innerHeight - H * k) / 2)) + 'px';
  ctx.setTransform(r, 0, 0, r, 0, 0); ctx.imageSmoothingEnabled = true;
  if (renderer) renderer.setSize(Math.round(W * k), Math.round(H * k), false);
}
addEventListener('resize', fit);

/** Fills the whole overlay with one colour. */
export function clear(c: string): void { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }

/** Draws one line of text, centred on y. */
export function text(s: string, x: number, y: number, size: number, c: string, align: CanvasTextAlign = 'center', weight = 'bold'): void {
  ctx.fillStyle = c; ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align;
  ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}

/** A rounded rectangle, filled and/or outlined. */
export function rr(x: number, y: number, w: number, h: number, r: number, fill?: string | null, stroke?: string | null, lw = 2): void {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** Splits text into lines no wider than maxW at the given bold size. */
export function wrapText(s: unknown, maxW: number, size: number): string[] {
  ctx.font = `bold ${size}px ${FONT}`;
  const words = String(s).split(/\s+/), lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Cuts text to fit maxW at the given size and weight, ending it with "…" when it was cut. */
export function clip(s: string, maxW: number, size: number, weight = 'bold'): string {
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (ctx.measureText(s).width <= maxW) return s;
  let n = s.length;
  while (n > 0 && ctx.measureText(s.slice(0, n).trimEnd() + '…').width > maxW) n--;
  return s.slice(0, n).trimEnd() + '…';
}

/** Options for a drawn button. */
export interface ButtonOpts { fill?: string; stroke?: string; color?: string; size?: number; align?: CanvasTextAlign }

/** Draws a button and, with an act, makes it clickable this frame. */
export function button(x: number, y: number, w: number, h: number, label: string, act: string | null, opts: ButtonOpts = {}): void {
  const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  rr(x, y, w, h, 10, opts.fill || (hover ? '#33415c' : '#243049'), opts.stroke || '#0d1220', 3);
  text(label, x + (opts.align === 'left' ? 16 : w / 2), y + h / 2, opts.size || 20, opts.color || '#fff', opts.align || 'center');
  if (act) buttons.push({ x, y, w, h, act });
}
