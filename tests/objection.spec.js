// /판정 that upholds an objection: the question and the wrong reply go, the reply is written again with the fact, the fact is remembered
import { test, expect } from './support/test.js';
import { check, claudeMock, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__prompts=(window.__prompts||[]);window.__prompts.push(p);const n=window.__prompts.length;
  if(p.includes('[판정 질문]'))return{admin:'',narration:'기록을 펼칩니다.',system:[],choices:[],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,objection:window.__uphold?{upheld:true,fact:window.__fact||'새벽에 빈집에서 다섯 시간을 잤다. 수면 부족이 아니다.',remember:!!window.__remember}:null};
  return{admin:'',narration:'답 '+n+(n===3?' 이틀째 제대로 못 잔 몸으로 달린다.':''),system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;

test('objection', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 900] });
  let toasts = [];
  await pg.waitForTimeout(500);
  await startLife(pg);
  await pg.fill('#input', '달린다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(600);
  await pg.evaluate('window.__toasts=[];const t0=DR.toast;DR.toast=(m,ms)=>{window.__toasts.push(m);t0(m,ms)};0');
  // not upheld: the explanation stays
  await pg.fill('#input', '/판정 왜 늦었지');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const kept = await pg.evaluate(
    "DR.app.turns[DR.app.turns.length-1].out&&DR.app.turns[DR.app.turns.length-1].out.judge==='judge'",
  );
  console.log('not upheld -> judge reply kept:', kept);
  check(errs, 'not upheld: the explanation stays', !!kept);
  // upheld: question and wrong reply removed, the reply rewritten with the fact
  await pg.fill('#input', '달린다 다시');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(600);
  const wrong = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].out.narration');
  const n0 = await pg.evaluate('DR.app.turns.length');
  await pg.evaluate('window.__uphold=true;window.__remember=true;0');
  await pg.fill('#input', '/판정 이틀째 못 잤다는 건 틀린 거 아냐?');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(1500);
  let last = await pg.evaluate('window.__prompts.slice(-1)[0]');
  toasts = await pg.evaluate("window.__toasts.filter(m=>m.includes('이의'))");
  console.log('toast:', toasts);
  check(errs, 'upheld: a toast says so', toasts.length >= 1);
  const n1 = await pg.evaluate('DR.app.turns.length');
  const gone = await pg.evaluate("!DR.app.turns.some(t=>t.kind==='user'&&String(t.text).startsWith('/판정 이틀째'))");
  console.log('turns before/after:', n0, n1, '| judge line gone:', gone);
  check(errs, 'upheld: the question and its reply are gone, the wrong reply replaced in place', n1 === n0 && gone);
  const now = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].out.narration');
  console.log(
    'reply replaced:',
    wrong.slice(0, 20),
    '->',
    now.slice(0, 20),
    '| fact in rewrite prompt:',
    last.includes('다섯 시간을 잤다'),
  );
  check(
    errs,
    'upheld: the reply is written again with the fact in the prompt',
    now !== wrong && last.includes('다섯 시간을 잤다'),
  );
  const tr = await pg.evaluate(
    "(()=>{const t=DR.app.turns[DR.app.turns.length-1];const d=[...document.querySelectorAll('.turn')].slice(-1)[0].querySelector('details.objection');return{stored:!!(t.objection&&t.objection.text&&t.objection.q),shown:!!d,open:!!(d&&d.open),text:d?d.innerText.slice(0,80):''}})()",
  );
  console.log('judge text kept on the rewritten reply:', tr);
  check(
    errs,
    'the judge text stays on the rewritten reply, open on the last turn',
    tr.stored && tr.shown && tr.open && tr.text.includes('이의 인정') && tr.text.includes('기록을 펼칩니다'),
  );
  const hist = await pg.evaluate(
    "DR.turnText(DR.app.turns[DR.app.turns.length-1]).includes('기록을 펼칩니다')||DR.turnText(DR.app.turns[DR.app.turns.length-1]).includes('이의 인정')",
  );
  console.log('judge text kept out of the narrator history:', !hist);
  check(errs, 'the judge text is kept out of the narrator history', !hist);
  const cor = await pg.evaluate('JSON.stringify((DR.app.state.corrections||[]).map(c=>c.text))');
  console.log('lasting fact remembered:', cor);
  check(errs, 'a lasting fact is remembered in the corrections', cor.includes('다섯 시간을 잤다'));
  // a passing detail: fixes the reply, not remembered
  await pg.evaluate("window.__remember=false;window.__fact='문은 오른쪽이 아니라 왼쪽에 있었다.';0");
  await pg.fill('#input', '/판정 문 위치 틀렸어');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(1500);
  last = await pg.evaluate('window.__prompts.slice(-1)[0]');
  const rem = await pg.evaluate("(DR.app.state.corrections||[]).some(c=>c.text.includes('왼쪽'))");
  console.log('passing detail: in rewrite prompt', last.includes('왼쪽에 있었다'), '| remembered', rem);
  check(errs, 'a passing detail fixes the reply but is not remembered', last.includes('왼쪽에 있었다') && !rem);
  expect(errs).toEqual([]);
});
