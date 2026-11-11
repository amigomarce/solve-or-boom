/**
 * Shared types for the game's rules. `Loose` marks objects the code builds field by field
 * (players, bots, the bomb, the match state) that are not typed yet: typing still to do.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;

/** A question's difficulty, in the order easiest to hardest. */
export type Level = 'facil' | 'medio' | 'dificil';
/** The levels, easiest first. */
export const LEVELS: Level[] = ['facil', 'medio', 'dificil'];
