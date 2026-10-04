// a branch copies the whole history; deleting the open save leaves nothing behind; a save deleted elsewhere is closed, not written back
import { test, expect } from './support/test.js';
import { check, claudeMock, pageFn, startLife } from './support/harness.js';

const N =
  "async()=>({admin:'',narration:'장면.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false})";
const keys = '(id)=>[...window.__store.keys()].filter(k=>k.includes(id)).length';

test('delete', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(N), { size: [420, 900] });
  await pg.waitForTimeout(500);
  await pg.evaluate('DR.turnStore.pageMax=900;0'); // small pages, so the branch copy spans several
  await startLife(pg);
  for (let k = 0; k < 6; k++) {
    await pg.fill('#input', `행동 ${k}`);
    await pg.press('#input', 'Enter');
    await pg.waitForTimeout(250);
  }
  const orig = await pg.evaluate('DR.app.currentSave.id');
  // 1) branch from an early reply: the whole history up to it is copied
  const at = await pg.evaluate("DR.app.turns.filter(t=>t.kind==='ai')[2].i");
  await pg.evaluate(`DR.fork(${at});0`);
  await pg.waitForTimeout(300);
  await pg.click('#dlgOk');
  await pg.waitForTimeout(1500);
  const br = await pg.evaluate('DR.app.currentSave.id');
  const full = await pg.evaluate(
    '(async()=>{const r=await DR.turnStore.loadAll(DR.app.currentSave.id);return[r.length,r[0]&&r[0].i,r[r.length-1].i]})()',
  );
  const pages = await pg.evaluate('DR.app.currentSave.pages');
  console.log(
    '1) branch',
    br !== orig,
    '| history in branch: turns',
    full[0],
    'from',
    full[1],
    'to',
    full[2],
    '| branched at',
    at,
    '| pages',
    pages,
  );
  check(
    errs,
    '1) the branch is a new save holding every turn from the first up to the branch point',
    br !== orig && full[1] === 0 && full[2] === at && full[0] === at + 1,
  );
  if (!(pages && pages > 1)) errs.push('the branch fit in one page, so the copy across pages was not tested');
  // 2) delete the save that is open: closed first, nothing left behind, and nothing writes it back
  await pg.click('[data-tab="saves"]');
  await pg.waitForTimeout(300);
  await pg.click(`[data-del="${br}"]`);
  await pg.waitForTimeout(200);
  await pg.click('#dlgOk');
  await pg.waitForTimeout(800);
  await pg.evaluate('DR.persist&&DR.persist();0');
  await pg.waitForTimeout(300);
  const closed2 = await pg.evaluate('DR.app.currentSave===null');
  const left = await pg.evaluate(pageFn(keys), br);
  console.log('2) open save deleted -> session closed:', closed2, '| docs left:', left);
  check(errs, '2) deleting the open save closes it and leaves no document behind', closed2 === true && left === 0);
  // 3) deleted on another device while open here: the next turn closes it instead of resurrecting it
  await pg.evaluate(`DR.openSave('${orig}');0`);
  await pg.waitForTimeout(1200);
  await pg.evaluate(
    `(()=>{for(const k of [...window.__store.keys()])if(k.includes('${orig}'))window.__store.delete(k)})();0`,
  );
  await pg.fill('#input', '다른 기기에서 지운 뒤 행동');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(1200);
  const closed3 = await pg.evaluate('DR.app.currentSave===null');
  const back = await pg.evaluate(pageFn('(id)=>[...window.__store.keys()].filter(k=>k.includes(id))'), orig);
  console.log('3) gone elsewhere -> closed:', closed3, '| docs written back:', back);
  check(
    errs,
    '3) a save deleted on another device is closed by the next turn, not written back',
    closed3 === true && back.length === 0,
  );
  expect(errs).toEqual([]);
});
