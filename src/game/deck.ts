// Solve or Boom: the match deck. Design record: design/gdd/question-bank.md (Core Rules 5 and 6, States and Transitions).
import type { Level } from './types';

/** A question as the cards show it: four choices and the index of the right one. `pool` is the pool it was drawn from. */
export interface Question { q: string; choices: string[]; answer: number; topic: string; level?: Level; pool?: string }
/** A question before its choices are shuffled: the right answer first in `list`. */
export interface RawQuestion { q: string; list: string[]; topic: string; level?: Level }
/** What a deck draws from: one pool (levels ignored), one pool per level, or a generator that takes the level. */
export type DeckSource = RawQuestion[] | Record<Level, RawQuestion[]> | ((level?: Level) => RawQuestion);
/** What a match draws from. */
export interface Deck {
  /**
   * The next question at `level`: the put-back one, a retry that is due, or a fresh one. Choices are shuffled on every draw.
   * A deck with a single pool or a custom list ignores `level`; a level-less draw on a per-level deck uses 'medio'.
   */
  next(level?: Level): Question;
  /** The question was answered wrong: it comes back `retryGap` draws later in the pool it was drawn from, at most `retryMax` times. */
  miss(q: Question): void;
  /** The card was closed with the question unanswered: it is the next draw from its pool, and counts as neither right nor wrong. */
  putBack(q: Question): void;
}

/**
 * Builds a deck.
 * @param source   the pool of questions (reshuffled when used up), a pool per level, or a generator (never runs out)
 * @param rng      the game's seeded random
 * @param retryGap draws between a miss and its retry
 * @param retryMax most retries per question
 */
export function createDeck(source: DeckSource, rng: () => number, retryGap: number, retryMax: number): Deck {
  const gen = typeof source === 'function' ? source : null;
  const single = Array.isArray(source);
  const pools = (gen ? {} : single ? { all: source } : source) as Record<string, RawQuestion[]>;
  const keyOf = (level?: Level): string => (single ? 'all' : level ?? 'medio');
  const sizeOf = (key: string): number => (gen ? Infinity : pools[key].length);
  const orders: Record<string, RawQuestion[]> = {};
  let last: RawQuestion | null = null, draws = 0;
  const pending: { raw: RawQuestion; key: string }[] = [];
  const retries: { raw: RawQuestion; key: string; due: number }[] = [];
  const retried = new Map<string, number>();

  function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function toRaw(q: Question): RawQuestion {
    return { q: q.q, list: [q.choices[q.answer], ...q.choices.filter((_, i) => i !== q.answer)], topic: q.topic, level: q.level };
  }
  function fresh(key: string, level?: Level): RawQuestion {
    if (gen) {
      for (let i = 0; i < 6; i++) { const r = gen(level); if (r.q !== last?.q) return r; }
      return gen(level);
    }
    let order = orders[key] ?? (orders[key] = []);
    if (!order.length) order = orders[key] = shuffle([...pools[key]]);
    const n = order.length;
    if (pools[key].length > 1 && order[n - 1].q === last?.q) {
      if (n > 1) [order[n - 1], order[0]] = [order[0], order[n - 1]];
      else { // the one left is the question just asked (from another pool): start the next round with it at the bottom
        const held = order.pop()!;
        order = orders[key] = shuffle(pools[key].filter(r => r !== held));
        order.unshift(held);
      }
    }
    return order.pop()!;
  }
  function deal(raw: RawQuestion, key: string): Question {
    last = raw;
    const order4 = shuffle(raw.list.map((_, i) => i));
    return { q: raw.q, choices: order4.map(i => raw.list[i]), answer: order4.indexOf(0), topic: raw.topic, level: raw.level, pool: key };
  }

  return {
    next(level?: Level): Question {
      const key = keyOf(level);
      const p = pending.findIndex(x => x.key === key);
      if (p >= 0) return deal(pending.splice(p, 1)[0].raw, key);
      draws++;
      const i = retries.findIndex(r => r.key === key && r.due <= draws && (sizeOf(key) < 2 || r.raw.q !== last?.q));
      return deal(i >= 0 ? retries.splice(i, 1)[0].raw : fresh(key, level), key);
    },
    miss(q: Question): void {
      const n = retried.get(q.q) ?? 0;
      if (n >= retryMax) return;
      retried.set(q.q, n + 1);
      const key = q.pool ?? keyOf();
      // A pool smaller than the gap brings it back after one other question.
      retries.push({ raw: toRaw(q), key, due: draws + (sizeOf(key) < retryGap ? 2 : retryGap) });
    },
    putBack(q: Question): void { pending.push({ raw: toRaw(q), key: q.pool ?? keyOf() }); },
  };
}
