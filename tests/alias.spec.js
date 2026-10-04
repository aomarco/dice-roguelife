// merging two labels from the memory tab: notes and face move, and later uses of the old label land on the kept person
import { test, expect } from './support/test.js';
import { claudeMock, same, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__prompts=(window.__prompts||[]);window.__prompts.push(p);const n=window.__prompts.length;
  const who=n<=2?'대성통신 사장':'대성통신 사장';
  return{admin:'',narration:'[['+who+']]\n\n"왔냐." 장면 '+n,speaker:who,system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},dead:false,
    memory:{relations:[{name:who,note:'노트 '+n}]}}}`;

test('alias', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 1200] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  await pg.evaluate(
    "DR.app.state.relations['대성통신 주인']='가게 주인 아저씨';DR.app.state.cast=DR.app.state.cast||{};DR.app.state.cast['대성통신 주인']='male24';DR.app.state.cast['대성통신 사장']='male28';0",
  );
  await pg.click('[data-tab="memory"]');
  await pg.waitForTimeout(300);
  await pg.selectOption('select[data-merge="대성통신 사장"]', '대성통신 주인');
  await pg.waitForTimeout(200);
  await pg.click('#dlgOk');
  await pg.waitForTimeout(500);
  const m = await pg.evaluate(
    "({rel:Object.keys(DR.app.state.relations).filter(k=>k.startsWith('대성')),note:DR.app.state.relations['대성통신 주인'],alias:DR.app.state.aliases,face:DR.app.state.cast['대성통신 주인'],old:DR.app.state.cast['대성통신 사장']||null})",
  );
  console.log('after merge:', m);
  await pg.click('[data-tab="play"]');
  await pg.waitForTimeout(200);
  await pg.fill('#input', '간다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const after = await pg.evaluate(
    "({rel:Object.keys(DR.app.state.relations).filter(k=>k.startsWith('대성')),speaker:DR.app.turns[DR.app.turns.length-1].out.speaker,marker:DR.app.turns[DR.app.turns.length-1].out.narration.slice(0,12)})",
  );
  console.log('next reply used the old label ->', after);
  await pg.fill('#input', '또 간다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const pr = await pg.evaluate('window.__prompts.slice(-1)[0]');
  console.log('narrator sees the alias:', pr.includes('대성통신 주인(= 대성통신 사장)'));
  const ok =
    same(m.rel, ['대성통신 주인']) &&
    m.alias['대성통신 사장'] === '대성통신 주인' &&
    same(after.rel, ['대성통신 주인']) &&
    after.speaker === '대성통신 주인' &&
    pr.includes('대성통신 주인(= 대성통신 사장)');
  if (!ok) errs.push('alias not applied');
  expect(errs).toEqual([]);
});
