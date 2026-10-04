// The test runner with the `game` fixture: every spec imports { test, expect } from here.
import { test as base, expect } from '@playwright/test';
import { claudeMock, pageUrl } from './harness.js';

export { expect };

export const test = base.extend({
  // Opens the game in a fresh browser context: `const { pg, errs } = await game(script, { size: [420, 900] })`.
  // script is the init script (claudeMock() by default), injected before the page loads. errs starts out collecting
  // uncaught page errors; checks add their failures to it and the test ends with expect(errs).toEqual([]).
  // scale is the device pixel ratio; mobile turns on touch and the mobile viewport. Call it again for a second page.
  game: async ({ browser }, use) => {
    const contexts = [];
    await use(async (script = claudeMock(), { size = [420, 900], scale = 1, mobile = false } = {}) => {
      const ctx = await browser.newContext({
        viewport: { width: size[0], height: size[1] },
        deviceScaleFactor: scale,
        ...(mobile ? { isMobile: true, hasTouch: true } : {}),
      });
      contexts.push(ctx);
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', e => errs.push(String(e)));
      await pg.addInitScript(script);
      await pg.goto(pageUrl());
      return { pg, errs };
    });
    for (const ctx of contexts) await ctx.close();
  },
});
