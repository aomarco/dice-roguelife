// the check window names the action the die was for: a chosen option, or the narrator's short name for a free action
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J =
  "async()=>{const n=(window.__n=(window.__n||0)+1);return{admin:'',narration:'장면 '+n,system:[],choices:['칼자국에게 오늘치 삼만 원을 자정 전에 당겨서 내고 온다 (성공 확률 55%)','쉰다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,check:n===2?{p:40,what:'중고 마정석 흥정'}:null}}";

test('check what', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg, { dice: true });
  await pg.fill('#input', '마정석을 사고 정산한다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(900);
  const a = await pg.evaluate(
    "([...document.querySelectorAll('.turn')].slice(-1)[0].querySelector('.win[data-tag=CHECK],.win[data-tag=CRITICAL]')||{}).innerText||''",
  );
  await pg.click('[data-choice] >> nth=0');
  await pg.waitForTimeout(2500);
  await pg.evaluate("document.querySelector('#dice')&&document.querySelector('#dice').click();0");
  await pg.waitForTimeout(400);
  const b2 = await pg.evaluate(
    "([...document.querySelectorAll('.turn')].slice(-1)[0].querySelector('.win[data-tag=CHECK],.win[data-tag=CRITICAL]')||{}).innerText||''",
  );
  console.log('free action window:', a.replaceAll('\n', ' / '));
  console.log('choice window     :', b2.replaceAll('\n', ' / '));
  const ok = a.startsWith('중고 마정석 흥정') && b2.startsWith('칼자국에게 오늘치 삼만 원을 자정 전에');
  if (!ok) errs.push('check name missing');
  expect(errs).toEqual([]);
});
