// Key bindings: each action's key (a KeyboardEvent.code). The defaults, the actions' Spanish
// names and the readable key names are in data/keybinds.json; the player's own set is kept in
// localStorage, and any failure to read or write it falls back to the defaults.
import data from '../data/keybinds.json';

/** A bindable action: its id, its Spanish name and its default key. */
export interface Action { id: string; label: string; key: string }

/** Every bindable action, in the order the Controles screen lists them. */
export const ACTIONS: Action[] = data.actions;
const NAMES: Record<string, string> = data.names;
const STORE = 'solve-or-boom.keys';

/** The key bound to each action now: bind.jump is 'Space' by default. */
export const bind: Record<string, string> = {};

/** Puts every action back on its default key and saves that. */
export function resetKeys(): void {
  for (const a of ACTIONS) bind[a.id] = a.key;
  save();
}

/** Binds an action to a key; an action that had that key gets this action's old one. Returns that action, if any. */
export function setKey(id: string, code: string): Action | undefined {
  const other = ACTIONS.find(a => a.id !== id && bind[a.id] === code);
  if (other) bind[other.id] = bind[id];
  bind[id] = code;
  save();
  return other;
}

/** A key's readable name in Spanish: 'Espacio', 'Mayús izq.', 'W', '1'. */
export function keyName(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

function save(): void {
  try { localStorage.setItem(STORE, JSON.stringify(bind)); } catch { /* not saved: the set still holds for this session */ }
}

// The saved set, action by action: each saved key stands when it is a real key no other action took; an action the
// set lacks (one added since it was saved) or whose key clashes keeps its default when that key is free. A set that
// still ends with two actions on one key is dropped for the defaults.
for (const a of ACTIONS) bind[a.id] = a.key;
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && typeof saved === 'object') {
    const got: Record<string, string> = {}, used = new Set<string>();
    for (const a of ACTIONS) {
      const c = saved[a.id];
      if (typeof c === 'string' && c && c !== 'Escape' && !used.has(c)) { got[a.id] = c; used.add(c); }
    }
    for (const a of ACTIONS) if (!got[a.id] && !used.has(a.key)) { got[a.id] = a.key; used.add(a.key); }
    if (ACTIONS.every(a => got[a.id])) for (const a of ACTIONS) bind[a.id] = got[a.id];
  }
} catch { /* unreadable: the defaults stand */ }
