// a reply whose row cannot be saved (here: storage full) leaves the state as it was, so 다시 시도 applies it once
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J =
  "async()=>({admin:'',narration:'금화를 줍는다.',system:[],choices:['a'],stat_changes:{gold:500},clock:{days_passed:0},memory:{},dead:false})";
const FULL_ONCE = String.raw`(()=>{const append=DR.turnStore.append.bind(DR.turnStore);
  DR.turnStore.append=async t=>{if(window.__fullOnce&&t.kind==='ai'){window.__fullOnce=false;throw Object.assign(new Error('full'),{code:'quota_exceeded'})}return append(t)};})();0`;
const IDLE = 'DR.isIdle()';

test('unsaved reply', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  await pg.waitForFunction(`DR.app.turns.length>0&&${IDLE}`, null, { timeout: 20000 });
  await pg.evaluate(FULL_ONCE);
  const g0 = await pg.evaluate('DR.app.state.stats.gold');
  await pg.evaluate('window.__fullOnce=true;0');
  await pg.fill('#input', '줍는다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction(`${IDLE}&&window.__fullOnce===false`, null, { timeout: 20000 });
  await pg.waitForTimeout(300);
  const g1 = await pg.evaluate('DR.app.state.stats.gold');
  const last = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].kind');
  await pg.evaluate('DR.closeSheet();0'); // the storage-full sheet
  await pg.waitForSelector('#retryBtn');
  await pg.click('#retryBtn');
  await pg.waitForFunction(`DR.app.turns[DR.app.turns.length-1].kind==='ai'&&${IDLE}`, null, { timeout: 20000 });
  const g2 = await pg.evaluate('DR.app.state.stats.gold');
  console.log('gold before:', g0, '| after the unsaved reply:', g1, '| last row:', last, '| after 다시 시도:', g2);
  if (g1 !== g0) errs.push('the unsaved reply changed the state');
  if (last !== 'user') errs.push('the unsaved reply is still on the page');
  if (g2 <= g0 || g2 - g0 !== (await pg.evaluate('DR.app.turns[DR.app.turns.length-1].deltas.gold'))) {
    errs.push('the retried reply was not applied exactly once');
  }
  expect(errs).toEqual([]);
});
