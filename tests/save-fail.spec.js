// a reply whose page write fails: one retry; if it still fails, the turn and the state are rolled back and nothing desynced is saved
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const A =
  "async()=>({admin:'',narration:'장면.',system:[],choices:['a'],stat_changes:{gold:5000},reasons:{gold:'주웠다'},clock:{days_passed:0},memory:{},dead:false})";
const FAIL =
  "(n)=>{const d0=DR.platform.db.doc.bind(DR.platform.db);window.__fails=n;DR.platform.db.doc=p=>{const ref=d0(p);if(!p.includes('/pages/'))return ref;const o=Object.create(ref);o.set=async(...a)=>{const rows=(a[0]&&a[0].rows)||[];const lastKind=rows.length?rows[rows.length-1].kind:'';if(window.__fails>0&&lastKind===window.__failKind){window.__fails--;throw Object.assign(new Error('write rejected'),{code:'unavailable'})}return ref.set(...a)};return o}}";

test('save fail', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(A), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  const st =
    "(async()=>{const k=[...window.__store.keys()].find(k=>k.includes('/states/items/'));const s=window.__store.get(k);const pk=[...window.__store.keys()].filter(k=>k.includes('/pages/')).sort().pop();const pgd=window.__store.get(pk);return{next:s.next,gold:s.stats.gold,lastOnPage:pgd.rows[pgd.rows.length-1].i}})()";
  // a passing failure: the retry saves it
  await pg.evaluate(`(${FAIL})(1);window.__failKind='ai';0`);
  const g0 = await pg.evaluate('DR.app.state.stats.gold');
  await pg.fill('#input', '줍는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(2000);
  const a = await pg.evaluate(st);
  console.log('1) one failure -> saved after retry:', a, '| gold +5000:', a.gold === g0 + 5000);
  // a lasting failure: the reply is taken back, the state stays where it was, and DB stays consistent
  await pg.evaluate('window.__fails=2;0');
  const g1 = await pg.evaluate('DR.app.state.stats.gold');
  await pg.fill('#input', '또 줍는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(2500);
  const b2 = await pg.evaluate(st);
  const mem = await pg.evaluate(
    '({next:DR.app.state.next,gold:DR.app.state.stats.gold,last:DR.app.turns[DR.app.turns.length-1].kind})',
  );
  console.log('2) lasting failure -> in memory', mem, '| saved', b2);
  let ok = mem.gold === g1 && mem.last === 'user' && b2.next === b2.lastOnPage + 1;
  await pg.evaluate("window.__failKind='user';window.__fails=2;0");
  await pg.fill('#input', '저장 안 되는 말');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(2500);
  const back = await pg.evaluate("document.querySelector('#input').value");
  console.log('3) my line not saved -> back in the box:', JSON.stringify(back));
  ok = ok && back === '저장 안 되는 말';
  console.log(
    '4) errors kept for later:',
    await pg.evaluate(
      "(()=>{const k=[...window.__store.keys()].find(k=>k.endsWith('/diag'));return k?window.__store.get(k).errors.length:0})()",
    ),
  );
  if (!(ok && a.gold === g0 + 5000)) errs.push('save failure handling wrong');
  expect(errs).toEqual([]);
});
