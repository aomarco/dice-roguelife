// a change made elsewhere (another device, an old tab, a fix in the database) is not overwritten: the screen reloads it before sending
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

test('stale state', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  await pg.fill('#input', '걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const sid = await pg.evaluate('DR.app.currentSave.id');
  // someone edits the saved state and bumps the save's version
  await pg.evaluate(`(()=>{const ks=[...window.__store.keys()];const sk=ks.find(k=>k.endsWith('/states/items/${sid}'));const st=window.__store.get(sk);st.relations=Object.assign({},st.relations,{'외부 수정':'다른 곳에서 바꿈'});window.__store.set(sk,st);
      const ik=ks.find(k=>k.endsWith('/saves/items/${sid}'));const it=window.__store.get(ik);it.sv=(it.sv||0)+1;window.__store.set(ik,it)})();0`);
  const n0 = await pg.evaluate('DR.app.turns.length');
  await pg.fill('#input', '달린다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(1200);
  const kept = await pg.evaluate("!!(DR.app.state.relations||{})['외부 수정']");
  const sent = (await pg.evaluate('DR.app.turns.length')) - n0;
  const box = await pg.evaluate("document.querySelector('#input').value");
  console.log(
    'external change kept in memory:',
    kept,
    '| app.turns sent:',
    sent,
    '| words back in the box:',
    JSON.stringify(box),
  );
  // sending again now works and keeps the change in the saved state
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(1200);
  const saved = await pg.evaluate(
    `!!((window.__store.get([...window.__store.keys()].find(k=>k.endsWith('/states/items/${sid}')))||{}).relations||{})['외부 수정']`,
  );
  console.log(
    'after resending: turns',
    (await pg.evaluate('DR.app.turns.length')) - n0,
    '| change still saved:',
    saved,
  );
  const ok = kept && sent === 0 && box === '달린다' && saved;
  if (!ok) errs.push('stale app.state not handled');
  expect(errs).toEqual([]);
});
