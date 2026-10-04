// the exact die must never be visible before the reply is done; a rolled turn can be stopped at any point and keeps its die
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__gated=false;window.__order=[];let release=null;window.__release=()=>release&&release();
const answer={admin:'',narration:'장면.',system:[],choices:['담을 넘는다 (성공 확률 30%)','기다린다 (성공 확률 50%, 결정적)'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false};
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});
   f.json=async(p,o)=>{window.__order.push('call:'+p.slice(-20).replace(/\n/g,' '));if(!window.__gated)return answer;
     const sig=o&&o.signal;const cancelled=()=>Promise.reject({code:'cancelled'});
     await new Promise(r=>setTimeout(r,300));if(sig&&sig.aborted)return cancelled();           // thinking, nothing shown yet
     if(window.__stream&&o.onText)o.onText({text:'{"scene":null,"speaker":null,"emotion":"neutral","admin":"30 이하가 필요했는데 66'});
     await new Promise((r,j)=>{release=r;if(sig)sig.addEventListener('abort',()=>j({code:'cancelled'}))});return answer};
   return f;} return null;}};
`;

test('dice reveal', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [400, 860] });
  await pg.waitForTimeout(600);
  await startLife(pg, { world: 'hunter', dice: true });
  const chip = "(document.querySelectorAll('.sysmsg .win[data-tag=CHECK],.sysmsg .win[data-tag=CRITICAL]').length)";
  // A) offered choice: no chip while waiting, chip after; the stop button stays usable while text streams
  await pg.evaluate('window.__gated=true;window.__stream=true');
  await pg.fill('#input', '담을 넘는다 (성공 확률 30%)');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(600);
  const during = await pg.evaluate(chip);
  const btn = await pg.evaluate(
    "[document.querySelector('#sendBtn').textContent,document.querySelector('#sendBtn').disabled]",
  );
  await pg.evaluate('window.__release()');
  await pg.waitForTimeout(700);
  const after = await pg.evaluate(chip);
  console.log('A) chips while waiting:', during, '| after:', after, '| button while text streams:', btn);
  // C) stop after text started: cancels, puts the text back, and the same die waits for the next send
  await pg.fill('#input', '담을 넘는다 (성공 확률 30%)');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(600);
  const d0 = await pg.evaluate('(DR.app.turns[DR.app.turns.length-1].roll||{}).d');
  await pg.click('#sendBtn');
  await pg.waitForTimeout(700);
  const stopped = await pg.evaluate('DR.isIdle()');
  const back = await pg.evaluate("document.querySelector('#input').value");
  const memo = await pg.evaluate('(DR.app.state.rollMemo&&DR.app.state.rollMemo.roll||{}).d');
  await pg.evaluate('window.__gated=false');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(900);
  const d1 = await pg.evaluate("(DR.app.turns.filter(t=>t.kind==='user').slice(-1)[0].roll||{}).d");
  console.log(
    'C) stop while text streams -> stopped:',
    stopped,
    '| input back:',
    !!back,
    '| die kept:',
    memo === d0,
    '| resend used the same die:',
    d1 === d0,
  );
  // B) stop during the silent thinking phase: cancels, keeps the die for the next send
  await pg.evaluate('window.__gated=true;window.__stream=false');
  await pg.fill('#input', '담을 넘는다 (성공 확률 30%)');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(150);
  await pg.click('#sendBtn');
  await pg.waitForTimeout(700);
  const bOk =
    (await pg.evaluate('DR.isIdle()')) &&
    !!(await pg.evaluate("document.querySelector('#input').value")) &&
    (await pg.evaluate('!!DR.app.state.rollMemo'));
  console.log('B) stop while thinking -> cancelled, input restored, die kept:', bOk);
  if (!(
    during === 0 &&
    after >= 1 &&
    btn[0] === '중지' &&
    !btn[1] &&
    stopped &&
    back &&
    memo === d0 &&
    d1 === d0 &&
    bOk
  ))
    errs.push('stop behaviour wrong');
  await pg.evaluate("window.__gated=false;DR.app.state.rollMemo=null;document.querySelector('#input').value='';0");
  // D) decisive offered choice: the dice cinematic plays after the narrator call, not before
  await pg.evaluate(
    String.raw`window.__gated=false;window.__order=[];DR.showDice=async r=>{window.__order.push('dice crit='+r.crit+' fixed='+r.fixed)};0`,
  );
  await pg.fill('#input', '기다린다 (성공 확률 50%, 결정적)');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(900);
  const order = await pg.evaluate('window.__order');
  console.log('D) order:', order);
  const call = order.findIndex(x => x.startsWith('call:'));
  const dice = order.findIndex(x => x.startsWith('dice'));
  check(errs, 'D) the dice cinematic plays after the narrator call, not before', call >= 0 && dice > call);
  expect(errs).toEqual([]);
});
