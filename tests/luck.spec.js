// everyday luck: ~3% bad, ~3% good, decided once per turn position, kept through retry and stop, never on commands
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__prompts=[];window.__offline=false;window.__gated=false;let release=null;window.__release=()=>release&&release();
const answer={admin:'',narration:'장면.',system:[],choices:['간다','기다린다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false};
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>{throw{code:'upstream_error'}};f.limits=async()=>({maxPromptBytes:262144});
   f.json=async(p,o)=>{window.__prompts.push(p);if(window.__offline)throw{code:'upstream_error',message:'gone'};
     if(window.__gated){const sig=o&&o.signal;await new Promise((r,j)=>{release=r;if(sig)sig.addEventListener('abort',()=>j({code:'cancelled'}))})}
     return answer};return f;} return null;}};
`;

test('luck', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [400, 860] });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: true });
  const rate = await pg.evaluate(
    "(()=>{let b=0,g=0;for(let i=0;i<20000;i++){const r=DR.rollLuck();if(r==='bad')b++;else if(r==='good')g++}return[b/200,g/200]})()",
  );
  console.log(`rate over 20000 draws: bad ${rate[0].toFixed(2)}% good ${rate[1].toFixed(2)}%`);
  check(
    errs,
    'about 3% each: bad and good within 2-4% over 20000 draws',
    rate.every(x => 2 <= x && x <= 4),
  );
  const has = s => "window.__prompts.slice(-1)[0].includes('[생활 운]')";
  // a hit: block in the prompt, note after, stored on the turn
  await pg.evaluate("window.__realLuck=DR.rollLuck;DR.rollLuck=()=>'bad'");
  await pg.fill('#input', '잠을 잔다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  let blk = await pg.evaluate(has(0));
  const notes = await pg.evaluate('JSON.stringify(DR.app.turns[DR.app.turns.length-1].notes)');
  const on = await pg.evaluate('DR.app.turns[DR.app.turns.length-2].luck');
  console.log('1) bad luck -> block in prompt:', blk, '| note:', notes, '| on turn:', on);
  check(
    errs,
    '1) a hit: block in the prompt, a note after, stored on the turn',
    blk && notes.includes('작은 불운') && on === 'bad',
  );
  // no hit: no block
  await pg.evaluate('DR.rollLuck=()=>null');
  await pg.fill('#input', '걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  blk = await pg.evaluate(has(0));
  console.log('2) no luck -> block in prompt:', blk);
  check(errs, '2) no hit: no block', !blk);
  // retry keeps the luck (and the same prompt)
  await pg.evaluate("DR.rollLuck=()=>'good';window.__offline=true");
  await pg.fill('#input', '시장을 둘러본다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const first = await pg.evaluate('window.__prompts.slice(-1)[0]');
  await pg.evaluate('DR.rollLuck=()=>null;window.__offline=false');
  await pg.click('#retryBtn');
  await pg.waitForTimeout(700);
  const again = await pg.evaluate('window.__prompts.slice(-1)[0]');
  console.log('3) retry -> same prompt:', first === again, '| good luck kept:', again.includes('작은 행운'));
  check(errs, '3) a retry resends the same prompt, good luck included', first === again && again.includes('작은 행운'));
  // stop while thinking, then resend: same position keeps its luck
  await pg.evaluate("DR.rollLuck=()=>'bad';window.__gated=true");
  await pg.fill('#input', '문을 두드린다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(250);
  await pg.click('#sendBtn');
  await pg.waitForTimeout(500);
  await pg.evaluate('DR.rollLuck=()=>null;window.__gated=false');
  await pg.fill('#input', '문을 두드린다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const kept = await pg.evaluate("window.__prompts.slice(-1)[0].includes('작은 불운')");
  console.log('4) stop then resend -> bad luck kept:', kept);
  check(errs, '4) stop and resend at the same position keeps the bad luck', kept);
  // commands never get luck
  await pg.evaluate("DR.rollLuck=()=>'bad'");
  await pg.fill('#input', '/뉴스');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  blk = await pg.evaluate(has(0));
  console.log('5) /뉴스 -> block in prompt:', blk);
  check(errs, '5) a command never gets luck', !blk);
  // free input gets the dice block, and with it the judging principles ([판정 원칙], prompts.json judgeCore), which now
  // hold the probability anchors, the no-roll list and the failure scope that used to sit in the dice block itself
  await pg.evaluate('DR.rollLuck=()=>null');
  await pg.fill('#input', '설득한다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const anc = await pg.evaluate(
    "(()=>{const p=window.__prompts.slice(-1)[0];return p.includes('[판정 주사위]')&&p.includes('[판정 원칙]')&&p.includes('80 이상')&&p.includes('판정하지 않는다')&&p.includes('실패는 그 시도 하나만 막는다')})()",
  );
  console.log('6) dice block and principles (anchors, no-roll list, failure scope):', anc);
  check(
    errs,
    '6) free input carries the dice block and the principles with anchors, no-roll list and failure scope',
    anc,
  );
  expect(errs).toEqual([]);
});
