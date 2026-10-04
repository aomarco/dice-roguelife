// the gambler's jackpot or abyss is decided once per turn position and kept through retry, stop and rewrite
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__prompts=[];window.__offline=false;window.__gated=false;let release=null;
const answer={admin:'',narration:'장면.',system:[],choices:['간다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false};
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>{throw{code:'upstream_error'}};f.limits=async()=>({maxPromptBytes:262144});
   f.json=async(p,o)=>{window.__prompts.push(p);if(window.__offline)throw{code:'upstream_error'};
     if(window.__gated){const sig=o&&o.signal;await new Promise((r,j)=>{release=r;if(sig)sig.addEventListener('abort',()=>j({code:'cancelled'}))})}
     return answer};return f;} return null;}};
`;

test('fate', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [420, 860] });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: true });
  await pg.evaluate('DR.app.state.rules.gambler=true;0');
  const jack = "window.__prompts.slice(-1)[0].includes('잭팟 ★')";
  const doom = "window.__prompts.slice(-1)[0].includes('나락 ☠')";
  // 1) retry keeps the jackpot
  await pg.evaluate("DR.rollFate=()=>'jackpot';window.__offline=true;0");
  await pg.fill('#input', '문을 연다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const first = await pg.evaluate('window.__prompts.slice(-1)[0]');
  await pg.evaluate('DR.rollFate=()=>null;window.__offline=false;0');
  await pg.click('#retryBtn');
  await pg.waitForTimeout(700);
  const again = await pg.evaluate('window.__prompts.slice(-1)[0]');
  let kept = await pg.evaluate(jack);
  const notes = await pg.evaluate('JSON.stringify(DR.app.turns[DR.app.turns.length-1].notes)');
  console.log('1) retry -> same prompt:', first === again, '| jackpot kept:', kept, '| note:', notes);
  check(
    errs,
    '1) a retry resends the same prompt, jackpot included, and the reply notes it',
    first === again && kept && notes.includes('★ 잭팟'),
  );
  // 2) rewrite keeps it
  await pg.evaluate('DR.reroll();0');
  await pg.waitForTimeout(800);
  kept = await pg.evaluate(jack);
  console.log('2) rewrite -> jackpot kept:', kept);
  check(errs, '2) a rewrite keeps the jackpot', kept);
  // 3) stop while thinking, resend: same position keeps its abyss
  await pg.evaluate("DR.rollFate=()=>'doom';window.__gated=true;0");
  await pg.fill('#input', '뛰어내린다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(250);
  await pg.click('#sendBtn');
  await pg.waitForTimeout(500);
  await pg.evaluate('DR.rollFate=()=>null;window.__gated=false;0');
  await pg.fill('#input', '뛰어내린다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  kept = await pg.evaluate(doom);
  console.log('3) stop then resend -> abyss kept:', kept);
  check(errs, '3) stop and resend at the same position keeps the abyss', kept);
  // 4) commands never get it
  await pg.evaluate("DR.rollFate=()=>'jackpot';0");
  await pg.fill('#input', '/뉴스');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const got = await pg.evaluate(jack);
  console.log('4) /뉴스 -> fate block:', got);
  check(errs, '4) a command never gets a fate block', !got);
  expect(errs).toEqual([]);
});
