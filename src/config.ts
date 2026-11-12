// Every tuning value, from data/config.json: each with value, min, max and step.
// The game reads them live through `tune`; the tweak panel (dev server only) edits the same object.
// The values themselves live in src/game/tune.ts (no browser, so the match rules run in Node).
import { CONFIG, tune } from './game/tune';
import type { Loose } from './game/types';

export { CONFIG, tune };
window.CONFIG = CONFIG;

if (import.meta.env.DEV) await import('./dev/tune');

declare global {
  interface Window { CONFIG: Record<string, Loose> }
}
