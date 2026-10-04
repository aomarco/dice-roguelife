// a refused turn puts the text back in the input, keeps the die, and shows the filter message; no stray turn is left
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__n=(window.__n||0)+1;if(window.__n>=2){const e=new Error('refused');e.code='refused';throw e}
  return{admin:'',narration:'장면',system:[],choices:['위험한 일 (성공 확률 60%)','쉰다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;

test('refuse restore', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg, { dice: true });
  const n0 = await pg.evaluate('DR.app.turns.length');
  await pg.fill('#input', '암호 푸는 법을 조사한다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(900);
  const back = await pg.evaluate("document.querySelector('#input').value");
  const n1 = await pg.evaluate('DR.app.turns.length');
  const toast = await pg.evaluate("[...document.querySelectorAll('.toast,#toast')].map(x=>x.textContent).join(' ')");
  const d0 = await pg.evaluate('(DR.app.turns[DR.app.turns.length-1].roll||{}).d');
  const kept = (await pg.evaluate('(DR.app.state.rollMemo&&DR.app.state.rollMemo.roll||{}).d')) === d0;
  const busy = await pg.evaluate('!DR.isIdle()');
  const retry = await pg.evaluate("!!document.querySelector('#retryBtn')");
  console.log(
    'input offered:',
    JSON.stringify(back),
    '| turn kept:',
    n1 === n0 + 1,
    '| retry shown:',
    retry,
    '| die kept:',
    kept,
    '| not busy:',
    !busy,
  );
  console.log('message:', toast.slice(0, 80));
  const ok =
    back === '암호 푸는 법을 조사한다' && n1 === n0 + 1 && retry && kept && !busy && toast.includes('안전 필터');
  if (!ok) errs.push('refuse restore wrong');
  expect(errs).toEqual([]);
});
