// Effect decisions with no 3D in them, so the checks can run them in Node (TD-012, docs/tech-debt-register.md). The meshes
// they place are drawn by src/scene3d.ts.

/**
 * Where a shot's tracer starts, or null when there is no bar worth drawing. `skip` metres from the shooter are left out
 * (a scoped sniper's own shot: the magnified view would turn the first metres into a white blob, fx_scope_tracer_skip;
 * 0 otherwise); a bar shorter than `minLen` (fx_tracer_min_len) is not drawn, nor is a scoped shot that lands inside
 * the skipped metres. The tracer always ends where the shot lands.
 * @example tracerSpan([0, 1.5, 0], [10, 1.5, 0], 0, 0.1); // [0, 1.5, 0]: from the muzzle
 */
export function tracerSpan(from: readonly number[], to: readonly number[], skip: number, minLen: number): number[] | null {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], len = Math.hypot(dx, dy, dz);
  if (len < minLen) return null;
  const k = skip > 0 ? Math.min(1, skip / len) : 0;
  if (k >= 1 || len * (1 - k) < minLen) return null;
  return [from[0] + dx * k, from[1] + dy * k, from[2] + dz * k];
}
