// Every tuning value, from data/config.json, with no browser in here so the match rules read it in Node.
// src/config.ts re-exports these and adds the browser side (window.CONFIG, the dev tweak panel).
import data from '../../data/config.json';
import type { Loose } from './types';

/** The whole config, as data/config.json holds it: each value with value, min, max and step. */
export const CONFIG: Record<string, Loose> = data;

/** Live values: tune.speed is CONFIG.speed.value. */
export const tune: Record<string, Loose> = new Proxy({}, { get: (_, k: string) => CONFIG[k].value });
