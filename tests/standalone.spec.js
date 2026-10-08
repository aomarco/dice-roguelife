import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startServer } from '../tools/server.js';
import { startLife } from './support/harness.js';

let server, url;
const reply = {
  narration: 'A fresh scene unfolds.',
  choices: ['Explore'],
  system: [],
  stat_changes: {},
  memory: {},
  clock: { days_passed: 0 },
  dead: false,
  summary: 'A journey began.',
  score: 20,
  epitaph: 'A brave explorer.',
  highlights: [],
  inherit: { name: 'Memory', grade: 'F', desc: 'Remember the journey.' },
};
test.beforeAll(async () => {
  server = await startServer({
    port: 0,
    fetcher: async () =>
      Response.json({
        model: 'mock-model',
        choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
  });
  url = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
test.use({ locale: 'en-US' });

async function configure(page) {
  await page.goto(url);
  await page.locator('#nm').waitFor();
  await page.evaluate(() => DR.openSettingsSheet());
  await page.selectOption('#apiProvider', 'custom');
  await page.fill('#apiEndpoint', 'https://example.com/v1');
  await page.fill('#apiModel', 'mock-model');
  await page.fill('#apiKey', 'test-secret-never-export');
  await page.click('#apiSave');
  await expect(page.locator('#apiStatus')).toHaveText('Connection saved.');
  await page.evaluate(() => DR.closeSheet());
}

test('standalone narration persists on reload and exports/imports without credentials', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await configure(page);
  await startLife(page, { name: 'Explorer', wait: 100 });
  await expect.poll(() => page.evaluate(() => DR.app.turns.some(t => t.kind === 'ai'))).toBe(true);
  await page.evaluate(() => DR.send('Look around'));
  const saved = await page.evaluate(() => ({ id: DR.app.currentSave.id, turns: DR.app.turns.length }));
  await page.reload();
  await expect.poll(() => page.evaluate(() => DR.app.currentSave?.id)).toBe(saved.id);
  await expect.poll(() => page.evaluate(() => DR.app.turns.length)).toBe(saved.turns);
  expect(await page.evaluate(() => DR.host().id)).toBe('browser');
  expect(await page.evaluate(() => localStorage.getItem('dr:provider-key'))).toBeNull();
  const downloadEvent = page.waitForEvent('download');
  await page.evaluate(id => DR.exportSaveFile(id), saved.id);
  const download = await downloadEvent;
  const bytes = await readFile(await download.path());
  const unpacked = await page.evaluate(async text => {
    const f = JSON.parse(text);
    return JSON.stringify(await DR.gunzipBytes(DR.z85dec(f.d).slice(0, f.n)));
  }, bytes.toString());
  expect(unpacked).not.toContain('test-secret');
  await page.evaluate(
    text => DR.importSaveFile(new File([text], 'save.json', { type: 'application/json' })),
    bytes.toString(),
  );
  expect(await page.evaluate(() => DR.app.saves.length)).toBe(2);
  expect(errors).toEqual([]);
});

test('images survive reload and are embedded in story exports', async ({ page }) => {
  await configure(page);
  await startLife(page, { name: 'Portrait', wait: 100 });
  await expect.poll(() => page.evaluate(() => DR.app.turns.some(t => t.kind === 'ai'))).toBe(true);
  const id = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 4;
    cv.getContext('2d').fillRect(0, 0, 4, 4);
    const blob = await new Promise(resolve => cv.toBlob(resolve));
    const { id } = await DR.platform.assets.upload(blob, { type: 'image/png' });
    await DR.platform.shared.doc('tests/asset').set({ id });
    return id;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!DR.app.state)).toBe(true);
  expect(await page.evaluate(async id => (await fetch(DR.imgUrl(id))).headers.get('content-type'), id)).toBe(
    'image/png',
  );
  await expect.poll(() => page.evaluate(() => DR.app.turns.length)).toBeGreaterThan(0);
  await page.evaluate(async id => {
    DR.app.images.push({ id, kind: 'scene', name: 'test', tags: [] });
    const t = DR.app.turns.find(t => t.kind === 'ai');
    t.img = { scene: id };
    await DR.turnStore.update(t);
  }, id);
  const downloadEvent = page.waitForEvent('download');
  await page.evaluate(() => DR.exportStory(DR.app.currentSave.id, 'html', 'all', true, () => {}));
  const html = (await readFile(await (await downloadEvent).path())).toString();
  expect(/data:image\/(webp|jpeg|png)/.test(html)).toBe(true);
  expect(html).not.toContain('test-secret');
});

test('JSON parser handles braces inside strings and rejects truncation', async ({ page }) => {
  await page.goto(url);
  await page.locator('#nm').waitFor();
  expect(
    await page.evaluate(async () => {
      const sample = DR.platform.sample;
      return !!sample;
    }),
  ).toBe(true);
  // Test the parser through the bundled public debug surface.
  expect(
    await page.evaluate(
      () => DR.parseReply('```json\n{"narration":"brace } and [ text","choices":["a"]}\n```').choices,
    ),
  ).toEqual(['a']);
  expect(
    await page.evaluate(() => {
      try {
        DR.parseReply('{"narration":"unfinished');
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(await page.evaluate(() => DR.parseReply('["one", "two"]'))).toEqual(['one', 'two']);
  expect(await page.evaluate(() => DR.validNarration({ narration: 'ok', stat_changes: { hp: 'Infinity' } }))).toBe(
    false,
  );
});

test('summary model and Life Reviews work without a Claude host', async ({ page }) => {
  await configure(page);
  await page.evaluate(() =>
    DR.configureProvider({ ...DR.providerConfig(), summaryModel: 'mock-summary' }, 'test-key', false),
  );
  await startLife(page, { name: 'Reviewer', wait: 100 });
  await expect.poll(() => page.evaluate(() => DR.app.turns.some(t => t.kind === 'ai'))).toBe(true);
  const used = await page.evaluate(
    async () => (await DR.platform.sample('Say ok', { modelTier: 'quick', cache: false })).text,
  );
  expect(used).toContain('A fresh scene');
  await page.evaluate(async () => {
    const turns = DR.app.turns,
      next = DR.app.state.next;
    DR.app.turns = Array.from({ length: 80 }, (_, i) => ({
      i,
      kind: 'ai',
      out: { narration: 'A long story. '.repeat(120) },
    }));
    DR.app.state.next = 80;
    DR.app.state.summarizedUpto = -1;
    await DR.maybeSummarize();
    DR.app.turns = turns;
    DR.app.state.next = next;
  });
  expect(await page.evaluate(() => DR.app.state.summaries.length)).toBeGreaterThan(0);
  await page.evaluate(async () => {
    DR.app.state.dead = true;
    await DR.persist();
    await DR.runLedger();
  });
  expect(await page.evaluate(() => DR.app.turns.some(t => t.kind === 'ledger'))).toBe(true);
  expect(await page.evaluate(() => DR.app.state.pastLives.length)).toBe(1);
});
