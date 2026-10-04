// an objection that says the action should not have been judged: the rewrite goes without a die and the check window disappears
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__prompts=(window.__prompts||[]);window.__prompts.push(p);
  if(p.includes('[판정 질문]'))return{admin:'',narration:'기록을 펼칩니다.',system:[],choices:[],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,objection:{upheld:true,fact:'칼자국은 자정 전에 내는 3만 원도 받는다.',remember:true,no_check:true}};
  return{admin:'',narration:'답 '+window.__prompts.length,system:[],choices:['칼자국에게 일찍 낸다 (성공 확률 55%)','쉰다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;

test('objection nocheck', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg, { dice: true });
  await pg.click('[data-choice] >> nth=0');
  await pg.waitForTimeout(2500);
  await pg.evaluate("document.querySelector('#dice')&&document.querySelector('#dice').click();0");
  await pg.waitForTimeout(300);
  const before = await pg.evaluate(
    "!![...document.querySelectorAll('.turn')].slice(-1)[0].querySelector('.win[data-tag=CHECK],.win[data-tag=CRITICAL]')",
  );
  await pg.fill('#input', '/판정 일찍 내는 걸 왜 안 받아');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(2500);
  const last = await pg.evaluate('window.__prompts.slice(-1)[0]');
  const after = await pg.evaluate(
    "!![...document.querySelectorAll('.turn')].slice(-1)[0].querySelector('.win[data-tag=CHECK],.win[data-tag=CRITICAL]')",
  );
  const roll = await pg.evaluate(
    "(()=>{const u=[...DR.app.turns].reverse().find(t=>t.kind==='user');return u&&u.roll})()",
  );
  console.log('check window before:', before, '| after the objection:', after, '| roll on the line:', roll);
  console.log(
    'rewrite prompt has a dice block:',
    last.split('[이번 입력]')[0].slice(-3000).includes('[판정 결과]') || last.includes('이번 행동의 주사위'),
    '| fact remembered:',
    await pg.evaluate("(DR.app.state.corrections||[]).some(c=>c.text.includes('자정 전에'))"),
  );
  const ok =
    before &&
    !after &&
    (roll === null || roll === undefined) &&
    !last.includes('이번 행동의 판정은 이미 정해졌다') &&
    !last.includes('이번 행동의 주사위');
  if (!ok) errs.push('no_check not applied');
  expect(errs).toEqual([]);
});
