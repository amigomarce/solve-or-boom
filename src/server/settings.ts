// The classroom server's settings: data/aula.json, each with value, min, max and step like data/config.json.
// Kept out of data/config.json on purpose: these are not gameplay values, the browser game never reads them,
// and so they are neither bundled into the page nor shown in the dev tweak panel.
import data from '../../data/aula.json';

/** A setting's name. */
export type AulaKey = keyof typeof data;

/** The value of every setting. A value outside its min..max stops the server at start, saying which. */
export const aula = Object.fromEntries(Object.entries(data).map(([k, e]) => {
  if (!(e.value >= e.min && e.value <= e.max)) throw new Error(`data/aula.json: "${k}" vale ${e.value}, fuera de ${e.min}..${e.max}`);
  return [k, e.value];
})) as Record<AulaKey, number>;
