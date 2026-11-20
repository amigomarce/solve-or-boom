// Vitest: the teacher page as the server serves it (TD-019, docs/tech-debt-register.md). The page's protocol
// version is filled in from PROTOCOL_VERSION when served, never copied by hand, so a version bump cannot leave
// the page answering "bad_version" to every message.
import { describe, expect, it } from 'vitest';
import page from '../../src/server/profesor.html?raw';
import { fillTeacherPage } from '../../src/server/teacher';
import { PROTOCOL_VERSION } from '../../src/net/protocol';

describe('the served teacher page', () => {
  it('carries the server protocol version', () => {
    const served = fillTeacherPage(page);
    expect(served).toContain(`const V = ${PROTOCOL_VERSION};`);
  });
  it('keeps no version written by hand in the page source', () => {
    expect(page).not.toMatch(/const V = \d+;/);
  });
  it('refuses a page with no version marker', () => {
    expect(() => fillTeacherPage('<script>const V = 1;</script>')).toThrow();
  });
});
