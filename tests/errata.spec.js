// an error two replies back: the record stays, the state is fixed within bounds, the old turn is marked, and the next reply mends the story once
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__prompts=(window.__prompts||[]);window.__prompts.push(p);const n=window.__prompts.length;
  if(p.includes('[판정 질문]'))return{admin:'',narration:'기록을 펼칩니다.',system:[],choices:[],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,
    objection:{upheld:true,fact:'폐코어 네 개는 지난번 값인 개당 만 원에 거래됐다.',remember:true,turn_ago:1,fix:{gold:-40000,items:[{name:'저출력 폐코어',qty:4},{name:'없는 물건',qty:-3}],ledger:{'코어 거래':'목요일 추가분 없음'}}}};
  return{admin:'',narration:'답 '+n,system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;

test('errata', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 900] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  await pg.evaluate('DR.app.state.stats.gold=200000;0');
  await pg.fill('#input', '폐코어 4개 산다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(600);
  await pg.fill('#input', '버스 타고 공단 간다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(600);
  const n0 = await pg.evaluate('DR.app.turns.length');
  await pg.fill('#input', '/판정 그때 값 안 깎았어');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(1500);
  const st = await pg.evaluate(
    "({n:DR.app.turns.length,gold:DR.app.state.stats.gold,core:(DR.app.state.items.find(x=>x.name==='저출력 폐코어')||{}).qty,ledger:DR.app.state.ledger&&DR.app.state.ledger['코어 거래'],note:DR.app.state.errataNote,corr:(DR.app.state.corrections||[]).some(c=>c.text.includes('개당 만 원'))})",
  );
  const marked = await pg.evaluate(
    "(()=>{const r=DR.app.turns.filter(t=>t.kind==='ai'&&!(t.out&&t.out.judge));const t=r[r.length-2];return !!(t&&t.errata)})()",
  );
  const judgeLine = await pg.evaluate(
    "[...document.querySelectorAll('.turn')].slice(-1)[0].innerText.includes('정정 반영')",
  );
  console.log(
    'turns',
    n0,
    '->',
    st.n,
    '(judge kept) | gold',
    st.gold,
    '| cores',
    st.core,
    '| ledger',
    st.ledger,
    '| remembered',
    st.corr,
    '| old turn marked',
    marked,
    '| judge shows the fix',
    judgeLine,
  );
  await pg.fill('#input', '색인을 건다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const p1 = await pg.evaluate('window.__prompts.slice(-1)[0]');
  const left = await pg.evaluate('DR.app.state.errataNote||null');
  await pg.fill('#input', '쉰다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const p2 = await pg.evaluate('window.__prompts.slice(-1)[0]');
  console.log(
    'next reply asked to mend:',
    p1.includes('[정정]'),
    '| cleared after:',
    left === null,
    '| the one after asks again:',
    p2.includes('[정정]'),
  );
  const ok =
    st.n === n0 + 2 &&
    st.gold === 160000 &&
    st.core === 4 &&
    st.corr &&
    marked &&
    judgeLine &&
    p1.includes('[정정]') &&
    left === null &&
    !p2.includes('[정정]');
  if (!ok) errs.push('errata wrong');
  expect(errs).toEqual([]);
});
