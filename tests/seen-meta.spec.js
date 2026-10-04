// every person who appears or whose relation note changes gets first/last turn logged, shown in the memory tab, and merged on rename
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__n=(window.__n||0)+1;const n=window.__n;
  if(p.includes('[판정 질문]'))return{admin:'',narration:'x',system:[],choices:[],stat_changes:{},clock:{days_passed:0},memory:{},dead:false};
  const who=n<=2?'칼자국':'대성통신 사장';
  return{admin:'',narration:'[['+who+']]\n\n"왔냐." 장면 '+n,speaker:who,speaker_gender:'male',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},
    memory:{relations:[{name:who,note:'노트 '+n}]},dead:false}}`;

test('seen meta', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 1000] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  for (let k = 0; k < 4; k++) {
    await pg.fill('#input', `간다 ${k}`);
    await pg.press('#input', 'Enter');
    await pg.waitForFunction('DR.isIdle()', null, { timeout: 15000 });
  }
  const meta = await pg.evaluate('JSON.parse(JSON.stringify(DR.app.state.meta||{}))');
  const nxt = await pg.evaluate('DR.app.state.next');
  console.log('next', nxt, '| meta:', meta);
  await pg.click('[data-tab="memory"]');
  await pg.waitForTimeout(300);
  const shown = await pg.evaluate("[...document.querySelectorAll('.lore b')].map(b=>b.textContent)");
  console.log('relations shown:', shown);
  // merge 칼자국-ish? no; merge 대성통신 사장 into a new label and check meta merges
  await pg.evaluate(
    "DR.app.state.relations['대성통신 주인']='주인';DR.app.state.meta['대성통신 주인']={f:1,l:1};DR.renderMemory();0",
  );
  await pg.waitForTimeout(100);
  await pg.selectOption('select[data-merge="대성통신 사장"]', '대성통신 주인');
  await pg.waitForTimeout(150);
  await pg.click('#dlgOk');
  await pg.waitForTimeout(400);
  const merged = await pg.evaluate("JSON.parse(JSON.stringify(DR.app.state.meta['대성통신 주인']||{}))");
  const gone = await pg.evaluate("!DR.app.state.meta['대성통신 사장']");
  console.log('after merge -> 주인 meta:', merged, '| 사장 meta removed:', gone);
  const k = meta['칼자국'] ?? {};
  const ds = meta['대성통신 사장'] ?? {};
  const ok =
    k.f === 1 &&
    k.l === 3 &&
    ds.f === 5 &&
    ds.l === 9 &&
    shown.some(t => t.includes('턴')) &&
    merged.f === 1 &&
    merged.l === 9 &&
    gone;
  if (!ok) errs.push('seen meta wrong');
  expect(errs).toEqual([]);
});
