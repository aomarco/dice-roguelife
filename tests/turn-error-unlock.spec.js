// an unexpected error while a reply is applied does not leave the game stuck: it is idle again, the live box is gone,
// and the line can be retried
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const BREAK_ONCE = String.raw`(()=>{const cast=DR.earlyCast;DR.earlyCast=async o=>{if(window.__breakOnce){window.__breakOnce=false;throw new Error('injected failure')}return cast(o)}})();0`;
const IDLE = 'DR.isIdle()';

test('turn error unlock', async ({ game }) => {
  let { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  await pg.waitForFunction(`DR.app.turns.length>0&&${IDLE}`, null, { timeout: 20000 });
  const n = await pg.evaluate('DR.app.turns.length');
  await pg.evaluate(BREAK_ONCE);
  await pg.evaluate('window.__breakOnce=true;0');
  await pg.fill('#input', '간다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction('window.__breakOnce===false', null, { timeout: 20000 });
  await pg.waitForTimeout(500);
  const idle = await pg.evaluate(IDLE);
  const live = await pg.evaluate("!!document.querySelector('#liveBox')");
  const retry = await pg.evaluate("!!document.querySelector('#retryBtn')");
  console.log('after the failure -> idle:', idle, '| live box up:', live, '| retry offered:', retry);
  if (!idle || live || !retry) errs.push('the game is stuck after the failure');
  else {
    await pg.click('#retryBtn');
    await pg.waitForFunction(`DR.app.turns.length>${n}+1&&${IDLE}`, null, { timeout: 20000 });
    console.log('retry -> rows:', n, '->', await pg.evaluate('DR.app.turns.length'));
  }
  errs = errs.filter(e => !e.includes('injected failure'));
  expect(errs).toEqual([]);
});
