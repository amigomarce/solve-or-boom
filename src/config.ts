// Every tuning value, from data/config.json: each with value, min, max and step.
// The game reads them live through `tune`; the tweak panel (dev server only) edits the same object.
import data from '../data/config.json';
import type { Loose } from './game/types';

/** The whole config, as data/config.json holds it. */
export const CONFIG: Record<string, Loose> = data;
window.CONFIG = CONFIG;

/** Live values: tune.speed is CONFIG.speed.value. */
export const tune: Record<string, Loose> = new Proxy({}, { get: (_, k: string) => CONFIG[k].value });

if (import.meta.env.DEV) await import('./dev/tune');

declare global {
  interface Window { CONFIG: Record<string, Loose> }
}
