// rewrite keeps the outcome, a dangling line is replaced, a conflicting rewrite reloads and carries on, critical results get the big window
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__prompts=[];window.__offline=false;window.__check=null;
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>{throw{code:'upstream_error'}};f.limits=async()=>({maxPromptBytes:262144});
   f.json=async(p)=>{window.__prompts.push(p);if(window.__offline)throw{code:'upstream_error'};return{admin:'',narration:'장면 '+window.__prompts.length,system:[],choices:['담을 넘는다 (성공 확률 15%)','기다린다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,check:window.__check}};return f;} return null;}};
`;

test('v191', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [420, 900] });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: true });
  const last = () => pg.evaluate('window.__prompts.slice(-1)[0]');
  // free input judged at 50 and failed; a rewrite keeps the 50 and the failure
  await pg.evaluate('window.__check={p:50};DR.rnd=(()=>{let n=0;return()=>[0.695,0.5,0.5][n++%3]})();0');
  await pg.fill('#input', '설득한다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const first = await pg.evaluate('JSON.stringify(DR.app.turns[DR.app.turns.length-2].roll)');
  await pg.evaluate('window.__check={p:90};DR.reroll();0');
  await pg.waitForTimeout(800);
  let pr = await last();
  console.log(
    '1) rewrite keeps outcome: fixed block',
    pr.includes('이번 행동의 판정은 이미 정해졌다') && pr.includes('성공 확률 50%'),
    '| free block gone',
    !pr.includes('이번 행동의 주사위'),
    '| roll',
    first,
  );
  const r = JSON.parse(first);
  check(
    errs,
    '1) a failed 50% check: the rewrite is told the failure at 50%, not given a new die',
    r.p === 50 &&
      r.ok === false &&
      pr.includes('이번 행동의 판정은 이미 정해졌다: 실패') &&
      pr.includes('성공 확률 50%') &&
      !pr.includes('이번 행동의 주사위'),
  );
  // a turn answered without a check stays without one on rewrite
  await pg.evaluate('window.__check=null;0');
  await pg.fill('#input', '걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  await pg.evaluate('DR.reroll();0');
  await pg.waitForTimeout(800);
  pr = await last();
  console.log(
    '2) no check stays no check:',
    !pr.includes('이번 행동의 주사위') && !pr.includes('이번 행동의 판정은 이미 정해졌다'),
  );
  check(
    errs,
    '2) no check stays no check',
    !pr.includes('이번 행동의 주사위') && !pr.includes('이번 행동의 판정은 이미 정해졌다'),
  );
  // a line that never got its answer is replaced by the next, same die
  await pg.evaluate('window.__offline=true;0');
  await pg.fill('#input', '첫 시도');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const d1 = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].roll&&DR.app.turns[DR.app.turns.length-1].roll.d');
  const n1 = await pg.evaluate('DR.app.turns.length');
  await pg.evaluate('window.__offline=false;0');
  await pg.fill('#input', '다른 말');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const gone = (await pg.evaluate("DR.app.turns.filter(t=>t.kind==='user'&&t.text==='첫 시도').length")) === 0;
  const same =
    (await pg.evaluate('DR.app.turns[DR.app.turns.length-2].roll&&DR.app.turns[DR.app.turns.length-2].roll.d')) === d1;
  const n2 = await pg.evaluate('DR.app.turns.length');
  console.log('3) dangling line replaced:', gone, '| same die:', same, '| turns', n1, '->', n2);
  check(
    errs,
    '3) the dangling line is replaced by the next, same die, plus its reply',
    gone && same && d1 !== null && d1 !== undefined && n2 === n1 + 1,
  );
  // a rewrite that hits a newer copy elsewhere reloads and carries on when it is still the same reply
  await pg.evaluate(
    "(()=>{const k=[...window.__store.keys()].filter(k=>k.includes('/pages/')).sort().pop();const d=window.__store.get(k);window.__store.set(k,Object.assign({},d,{v:(d.v||1)+5}))})();0",
  );
  const c0 = await pg.evaluate('window.__prompts.length');
  await pg.evaluate('DR.reroll();0');
  await pg.waitForTimeout(2500);
  const more = (await pg.evaluate('window.__prompts.length')) > c0;
  const lk = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].kind');
  console.log('4) conflict -> reloaded and rewrote:', more, '| last is a reply:', lk);
  check(errs, '4) a rewrite meeting a newer copy of the same reply reloads and rewrites', more && lk === 'ai');
  // critical result: the big window
  await pg.evaluate('DR.rnd=()=>0.01;0');
  await pg.click('[data-choice] >> nth=0');
  await pg.waitForTimeout(2500);
  await pg.evaluate("document.querySelector('#dice')&&document.querySelector('#dice').click();0");
  await pg.waitForTimeout(500);
  const w = await pg.evaluate(
    "(()=>{const w=[...document.querySelectorAll('.turn')].slice(-1)[0].querySelector('.win.big');return w?w.className+' | '+w.textContent.trim():null})()",
  );
  console.log('5) critical window:', w);
  check(
    errs,
    '5) die 2 at 15% is a critical success in the big window',
    !!w && w.includes('sys-good') && w.includes('대성공') && w.includes('15 이하 필요: 🎲 2'),
  );
  const ph = await pg.evaluate("document.querySelector('#input').placeholder");
  console.log('placeholder:', ph);
  check(
    errs,
    'the desktop placeholder ends with the Shift+Enter hint (Enter sends by default)',
    ph === (await pg.evaluate('DR.inputPh()')) + ' (Shift+Enter 줄바꿈)',
  );
  expect(errs).toEqual([]);
});
