// Vitest: the classroom server's input path after the "freezes and drops with more than 4 players" report (2026-11-24).
// A Wi-Fi hiccup delivered a student's held-back inputs at once; each one over the allowance was a strike and 30 strikes
// closed the connection, so a 1.5 s hiccup threw the student out. Protocol 24 also batches the inputs (src/net/protocol.ts).
import { describe, expect, it } from 'vitest';
import { refusalOutcome } from '../../src/server/net';
import { INPUT_BATCH_MAX, PROTOCOL_VERSION, parseClientMessage, type ProtocolLimits } from '../../src/net/protocol';

const LIM: ProtocolLimits = { maxChars: 4096, maxName: 20, maxLook: 3.2 };
const MAX_STRIKES = 30;
const inputMsg = (seq: number, inputs: unknown[]): string => JSON.stringify({ v: PROTOCOL_VERSION, t: 'input', seq, inputs });

describe('refusalOutcome', () => {
  it('never closes a connection for messages over the allowance, however many', () => {
    // Arrange: a fresh connection; a 2 s hiccup is about 120 inputs at once, so ten times that is plenty.
    const c = { strikes: 0, limited: 0 };
    // Act
    const outcomes = Array.from({ length: 1200 }, () => refusalOutcome(c, 'rate_limited', MAX_STRIKES));
    // Assert
    expect(outcomes.every(o => o === 'quiet')).toBe(true);
    expect(c.strikes).toBe(0);
    expect(c.limited).toBe(1200);
  });
  it('closes a connection on its max-strikes-th invalid message', () => {
    // Arrange
    const c = { strikes: 0, limited: 0 };
    // Act
    const outcomes = Array.from({ length: MAX_STRIKES }, () => refusalOutcome(c, 'bad_field', MAX_STRIKES));
    // Assert
    expect(outcomes.slice(0, -1).every(o => o === 'tell')).toBe(true);
    expect(outcomes.at(-1)).toBe('close');
  });
});

describe('parseClientMessage input batches (protocol 24)', () => {
  it('reads a batch of steps in order with the first seq', () => {
    // Arrange
    const text = inputMsg(41, [{ moveF: 1 }, {}, { fire: true, aimYaw: 0.5, aimPitch: 0 }]);
    // Act
    const r = parseClientMessage(text, LIM);
    // Assert
    expect(r.ok && r.msg.t === 'input' ? { seq: r.msg.seq, inputs: r.msg.inputs } : r)
      .toEqual({ seq: 41, inputs: [{ moveF: 1 }, {}, { fire: true, aimYaw: 0.5, aimPitch: 0 }] });
  });
  it('refuses an empty batch and one over the batch limit', () => {
    // Arrange
    const empty = inputMsg(0, []), over = inputMsg(0, Array.from({ length: INPUT_BATCH_MAX + 1 }, () => ({})));
    // Act and assert
    expect(parseClientMessage(empty, LIM)).toEqual({ ok: false, code: 'bad_shape' });
    expect(parseClientMessage(over, LIM)).toEqual({ ok: false, code: 'bad_shape' });
  });
  it('refuses a batch with one bad step', () => {
    // Arrange
    const text = inputMsg(0, [{ moveF: 1 }, { moveF: 2 }]);
    // Act and assert
    expect(parseClientMessage(text, LIM)).toEqual({ ok: false, code: 'bad_field' });
  });
  it('refuses the old single-input shape', () => {
    // Arrange
    const text = JSON.stringify({ v: PROTOCOL_VERSION, t: 'input', seq: 0, input: { moveF: 1 } });
    // Act and assert
    expect(parseClientMessage(text, LIM)).toEqual({ ok: false, code: 'bad_shape' });
  });
});
