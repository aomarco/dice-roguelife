// the turn number counts answers in this life (not reading commands), matches the save list, survives a rewrite, and is filled in for old saves
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

test('turn count', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  const strip = () => pg.evaluate("(document.querySelector('#strip .meta')||{}).textContent||''");
  console.log('after the opening:', await strip());
  for (let k = 0; k < 3; k++) {
    await pg.fill('#input', `걷는다 ${k}`);
    await pg.press('#input', 'Enter');
    await pg.waitForTimeout(500);
  }
  await pg.fill('#input', '/판정 왜');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(500);
  const a = await pg.evaluate('DR.app.state.turnNo');
  console.log('3 actions + /판정:', await strip(), '| turnNo', a);
  await pg.evaluate('DR.reroll();0');
  await pg.waitForTimeout(800);
  console.log('after rewriting the /판정 reply:', await pg.evaluate('DR.app.state.turnNo'));
  await pg.fill('#input', '또 걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(500);
  await pg.evaluate('DR.reroll();0');
  await pg.waitForTimeout(800);
  const b4 = await pg.evaluate('DR.app.state.turnNo');
  console.log('after a rewrite of a real turn:', b4);
  await pg.click('[data-tab="saves"]');
  await pg.waitForTimeout(400);
  const lst = await pg.evaluate(
    "[...document.querySelectorAll('#savesBox .m')].map(e=>e.textContent.split(',').slice(0,2).join(','))[0]",
  );
  console.log('save list:', lst);
  // an old save without the count: filled in on open
  const sid = await pg.evaluate('DR.app.currentSave.id');
  await pg.evaluate(
    `(()=>{const k=[...window.__store.keys()].find(k=>k.endsWith('/states/items/${sid}'));const s=window.__store.get(k);delete s.turnNo;window.__store.set(k,s)})();0`,
  );
  await pg.evaluate(`DR.openSave('${sid}');0`);
  await pg.waitForTimeout(2000);
  const mig = await pg.evaluate('DR.app.state.turnNo');
  console.log('old save filled in on open:', mig);
  const ok = a === 4 && b4 === 5 && mig === 5 && (lst || '').includes('5턴');
  if (!ok) errs.push('turn count wrong');
  expect(errs).toEqual([]);
});
