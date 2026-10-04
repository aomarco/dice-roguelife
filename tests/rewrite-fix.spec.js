// a rewrite keeps a judged action's die and outcome (and adds no check to a turn without one), survives or stops on a newer copy elsewhere; an unanswered line is replaced by the next, keeping its die
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, same, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__prompts=[];window.__check={p:50};window.__offline=false;window.__n=0;
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>{throw{code:'upstream_error'}};f.limits=async()=>({maxPromptBytes:262144});f.json=async(p)=>{window.__prompts.push(p);if(window.__offline)throw{code:'upstream_error'};window.__n++;return{admin:'',narration:'장면 '+window.__n,system:[],choices:['간다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,check:window.__check}};return f;} return null;}};
`;
const last = 'window.__prompts.slice(-1)[0]';

async function fresh(game) {
  const { pg, errs } = await game(MOCK, { size: [420, 900] });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: true });
  return { pg, errs };
}

test('rewrite keeps check', async ({ game }) => {
  // 1) a judged free action: the rewrite keeps 50% and the failure
  const { pg, errs } = await fresh(game);
  await pg.evaluate('DR.rnd=()=>0.545;0');
  await pg.fill('#input', '설득한다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const first = await pg.evaluate('JSON.stringify(DR.app.turns[DR.app.turns.length-2].roll)');
  await pg.evaluate('window.__check={p:90};DR.reroll();0');
  await pg.waitForTimeout(900);
  let pr = await pg.evaluate(last);
  const fixed = pr.includes('이번 행동의 판정은 이미 정해졌다: 실패 (주사위 55, 성공 확률 50%');
  console.log(
    '1) first roll',
    first,
    '| rewrite prompt fixed:',
    fixed,
    '| no free dice block:',
    !pr.includes('이번 행동의 주사위'),
  );
  const r = JSON.parse(first);
  check(
    errs,
    '1) die 55 at 50% fails, and the rewrite is told that outcome instead of a fresh die',
    same([r.d, r.p, r.ok], [55, 50, false]) && fixed && !pr.includes('이번 행동의 주사위'),
  );
  const win = await pg.evaluate(
    "[...document.querySelectorAll('.turn')].slice(-1)[0].querySelector('.sysmsg .win')?.textContent",
  );
  console.log('   window after rewrite:', win);
  check(
    errs,
    '1) the rewritten reply still shows the 50% failure',
    !!win && win.includes('50 이하 필요') && win.includes('55') && win.includes('실패'),
  );
  // 2) a turn that had no check: the rewrite has none either
  await pg.evaluate('window.__check=null;0');
  await pg.fill('#input', '걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  await pg.evaluate('window.__check={p:30};DR.reroll();0');
  await pg.waitForTimeout(900);
  pr = await pg.evaluate(last);
  console.log(
    '2) no-check rewrite: dice block absent:',
    !pr.includes('이번 행동의 주사위') && !pr.includes('[판정 결과] 이번'),
  );
  check(
    errs,
    '2) a turn without a check is rewritten without one',
    !pr.includes('이번 행동의 주사위') && !pr.includes('[판정 결과] 이번'),
  );
  // 3) a newer copy elsewhere with the same last reply: reload and carry on
  await pg.evaluate(
    '(()=>{for(const [k,v] of window.__store){if(/\\/pages\\/\\d+$/.test(k)&&v&&v.rows&&v.rows.some(r=>r.i===DR.app.turns[DR.app.turns.length-1].i)){v.v=(v.v||1)+1}}})();0',
  );
  let n0 = await pg.evaluate('window.__n');
  await pg.evaluate('DR.reroll();0');
  await pg.waitForTimeout(2500);
  let n1 = await pg.evaluate('window.__n');
  const nar = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].out.narration');
  console.log('3) conflict, same reply -> rewrote anyway:', n1 > n0, '| last narration:', nar);
  check(errs, '3) a newer copy with the same last reply: reload and rewrite it', n1 > n0 && nar === `장면 ${n1}`);
  // 4) a newer copy where that reply was replaced elsewhere: stop
  await pg.evaluate(
    "(()=>{for(const [k,v] of window.__store){if(/\\/pages\\/\\d+$/.test(k)&&v&&v.rows&&v.rows.some(r=>r.i===DR.app.turns[DR.app.turns.length-1].i)){v.v=(v.v||1)+1;const r=v.rows.find(r=>r.i===DR.app.turns[DR.app.turns.length-1].i);r.at='2099-01-01T00:00:00.000Z'}}})();0",
  );
  n0 = await pg.evaluate('window.__n');
  await pg.evaluate(
    'window.__toasts=[];const t0=DR.toast;DR.toast=(m,ms)=>{window.__toasts.push(m);t0(m,ms)};DR.reroll();0',
  );
  await pg.waitForTimeout(2500);
  n1 = await pg.evaluate('window.__n');
  const ts = await pg.evaluate('window.__toasts.slice(-1)[0]');
  console.log('4) conflict, reply changed elsewhere -> no rewrite:', n1 === n0, '| toast:', ts);
  check(
    errs,
    '4) the reply was replaced elsewhere: no rewrite, and a toast says it stopped',
    n1 === n0 && (ts || '').includes('멈췄'),
  );
  expect(errs).toEqual([]);
});

test('unanswered line replaced', async ({ game }) => {
  // 5) an unanswered line is replaced by the next one, keeping its die
  const { pg, errs } = await fresh(game);
  await pg.evaluate('window.__offline=true;DR.rnd=()=>0.37;0');
  await pg.fill('#input', '하드만 빼서 보면 된다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const orphan = await pg.evaluate(
    'JSON.stringify({i:DR.app.turns[DR.app.turns.length-1].i,d:DR.app.turns[DR.app.turns.length-1].roll&&DR.app.turns[DR.app.turns.length-1].roll.d,kind:DR.app.turns[DR.app.turns.length-1].kind})',
  );
  await pg.evaluate('window.__offline=false;DR.rnd=()=>0.99;0');
  await pg.fill('#input', '*하드만 빼서 보면 된다* 번호를 준다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(800);
  const tail = await pg.evaluate(
    "JSON.stringify(DR.app.turns.slice(-3).map(t=>[t.i,t.kind,(t.text||'').slice(0,12),t.roll&&t.roll.d]))",
  );
  console.log('5) orphan', orphan, '-> tail', tail);
  const o = JSON.parse(orphan);
  const t = JSON.parse(tail);
  check(
    errs,
    '5) the unanswered line is replaced by the next one at its position, keeping its die',
    o.kind === 'user' &&
      o.d === 38 &&
      same(t.at(-2).slice(0, 2), [o.i, 'user']) &&
      t.at(-2)[2].startsWith('*하드만') &&
      t.at(-2)[3] === o.d &&
      t.at(-1)[1] === 'ai',
  );
  expect(errs).toEqual([]);
});
