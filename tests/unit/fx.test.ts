// Vitest: where a shot's tracer is drawn (src/fx.ts tracerSpan; TD-012, docs/tech-debt-register.md). The 3D bar itself
// is drawn by src/scene3d.ts; this is the decision before it: whether there is a bar to see, and where it starts.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { tracerSpan } from '../../src/fx';

const v = (k: keyof typeof config): number => (config[k] as { value: number }).value;
const MIN = v('fx_tracer_min_len'), SKIP = v('fx_scope_tracer_skip');

describe('tracerSpan', () => {
  it('draws a normal shot from the muzzle to where it lands', () => {
    expect(tracerSpan([0, 1.5, 0], [10, 1.5, 0], 0, MIN)).toEqual([0, 1.5, 0]);
  });
  it('draws nothing for a shot shorter than fx_tracer_min_len', () => {
    expect(tracerSpan([0, 1.5, 0], [MIN / 2, 1.5, 0], 0, MIN)).toBeNull();
  });
  it('draws nothing for a shot of zero length', () => {
    expect(tracerSpan([3, 1, 3], [3, 1, 3], 0, MIN)).toBeNull();
  });
  it('starts a scoped sniper tracer fx_scope_tracer_skip metres out', () => {
    const start = tracerSpan([0, 0, 0], [0, 0, 20], SKIP, MIN)!;
    expect(start[2]).toBeCloseTo(SKIP, 6);
  });
  it('draws no scoped tracer for a shot that lands within the skipped metres', () => {
    expect(tracerSpan([0, 0, 0], [0, 0, SKIP * 0.9], SKIP, MIN)).toBeNull();
  });
});
