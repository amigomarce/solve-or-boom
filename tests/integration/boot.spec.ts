// Playwright: the single-file build opened from disk, driven through the
// game-state hook (src/hook.ts). npm run smoke runs only the @boot test.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync('data/config.json', 'utf8'));
const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Opens the build and collects every page error and console error. */
async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(build(query));
  await expect.poll(() => page.evaluate(() => typeof window.game?.step)).toBe('function');
  return errors;
}

test('boots to the session screen with no errors @boot', async ({ page }) => {
  const errors = await open(page, 'manual=1&render=cheap');
  expect(await page.evaluate(() => window.game!.scene)).toBe('title');
  const size = await page.locator('#game').boundingBox();
  expect(size && size.width > 0 && size.height > 0).toBe(true);
  expect(errors).toEqual([]);
});

test('buying the SMG asks a question, and the same seed repeats it exactly', async ({ page }) => {
  // ?manual=1 stops the loop, so only step() moves the game.
  async function run(): Promise<Record<string, unknown>> {
    await open(page, 'manual=1&seed=7&render=cheap');
    return page.evaluate(() => {
      const g = window.game!;
      g.press('Enter'); g.step();
      g.press('KeyB'); g.step();
      g.press('Digit1'); g.step();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = g.state as any;
      return {
        scene: g.scene, phase: s.phase, money: s.human.money,
        card: s.card && { kind: s.card.kind, item: s.card.item, q: s.card.q.q, choices: s.card.q.choices, answer: s.card.q.answer },
      };
    });
  }
  const first = await run();
  expect(first.scene).toBe('play');
  expect(first.phase).toBe('buy');
  expect(first.money).toBe(config.start_money.value);
  expect(first.card).toMatchObject({ kind: 'buy', item: 'smg' });
  expect((first.card as { choices: string[] }).choices).toHaveLength(4);
  expect(await run()).toEqual(first);
});
