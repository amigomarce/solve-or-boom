// The server's terminal log. Only room ids, counts and timings are ever logged: never a student's name or
// address (design/game-brief.md, Out of scope: no personal data is stored).

/** Prints one line with the time of day. */
export function log(line: string): void {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${line}`);
}

/**
 * A log for anomalies that can repeat fast (bad messages, a slow room): each kind prints at most once per
 * `everyMs`, and the next print says how many were held back.
 * @example const warn = rateLimitedLog(5000, Date.now); warn('mensaje', 'mensajes descartados');
 */
export function rateLimitedLog(everyMs: number, now: () => number): (kind: string, line: string) => void {
  const last = new Map<string, { at: number; held: number }>();
  return (kind, line) => {
    const k = last.get(kind), t = now();
    if (k && t - k.at < everyMs) { k.held++; return; }
    log(k && k.held ? `${line} (y ${k.held} más)` : line);
    last.set(kind, { at: t, held: 0 });
  };
}
