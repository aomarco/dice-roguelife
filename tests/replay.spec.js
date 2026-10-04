// the runtime keeps a finished answer even when the page lost the call; a retry of the same send must replay it for free
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__calls=0;window.__offline=false;window.__emptyOnce=false;window.__log=[];const store=new Map();
const answer=n=>({admin:'',narration:'장면 '+n,system:[],choices:['간다','기다린다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,check:{p:40}});
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){
   const f=async(p,o)=>{window.__log.push({verb:'text',cache:o&&o.cache});if(window.__offline)throw{code:'upstream_error',message:'gone'};window.__calls++;return{text:JSON.stringify(answer(window.__calls))}};
   f.limits=async()=>({maxPromptBytes:262144});
   f.json=async(p,o)=>{const c=o&&o.cache;window.__log.push({verb:'json',cache:c,tail:p.slice(-30)});
     if(c!==false&&!(c&&c.refresh)&&store.has(p)){return store.get(p)}           // replay: Claude not contacted
     window.__calls++;let a=answer(window.__calls);if(window.__emptyOnce){window.__emptyOnce=false;a=Object.assign({},a,{narration:''})}
     if(c!==false)store.set(p,a);                                               // the host finished and kept it
     if(window.__offline)throw{code:'upstream_error',message:'page lost the stream'};
     return a};
   return f;} return null;}};
`;

test('replay', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [400, 860] });
  await pg.waitForTimeout(600);
  await startLife(pg, { world: 'hunter', dice: true });
  // 1) send while the page loses the stream: the answer finishes on the host side but the page fails
  const c0 = await pg.evaluate('window.__offline=true;window.__log=[];window.__calls');
  await pg.fill('#input', '문을 연다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(900);
  const calls1 = await pg.evaluate('window.__calls');
  const retry = await pg.evaluate("!!document.querySelector('#retryBtn')");
  const first = await pg.evaluate("window.__log.find(x=>x.verb==='json')");
  const roll1 = await pg.evaluate('JSON.stringify(DR.app.turns[DR.app.turns.length-1].roll)');
  // 2) come back and retry: same request, same dice, replayed without a new generation
  await pg.evaluate('window.__offline=false;window.__log=[]');
  await pg.click('#retryBtn');
  await pg.waitForTimeout(900);
  const calls2 = await pg.evaluate('window.__calls');
  const again = await pg.evaluate("window.__log.find(x=>x.verb==='json')");
  console.log('1) failed send -> retry button:', retry, '| generations so far:', calls1);
  check(
    errs,
    '1) the page lost the call: a retry button, and the host finished one generation',
    retry && calls1 - c0 === 1,
  );
  let nar = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].out.narration');
  const dice =
    roll1 !== 'null' &&
    (await pg.evaluate('DR.app.turns[DR.app.turns.length-2].roll&&DR.app.turns[DR.app.turns.length-2].roll.d')) ===
      JSON.parse(roll1).d;
  console.log(
    '2) retry: same tail:',
    first.tail === again.tail,
    '| new generations:',
    calls2 - calls1,
    '| narration:',
    nar,
    '| dice kept:',
    dice,
  );
  check(
    errs,
    '2) the retry sends the same request and replays the kept answer for free, same die',
    first.tail === again.tail && calls2 === calls1 && nar === `장면 ${calls1}` && dice,
  );
  // 3) a rewrite is a new request: it generates
  let c = await pg.evaluate('window.__calls');
  await pg.evaluate('DR.reroll()');
  await pg.waitForTimeout(900);
  const c3 = await pg.evaluate('window.__calls');
  nar = await pg.evaluate('DR.app.turns[DR.app.turns.length-1].out.narration');
  console.log('3) rewrite -> new generations:', c3 - c, '| narration:', nar);
  check(errs, '3) a rewrite is a new request: one generation, its answer shown', c3 - c === 1 && nar === `장면 ${c3}`);
  // 4) an answer we reject is not replayed on retry: the retry asks fresh
  await pg.evaluate('window.__emptyOnce=true;window.__offline=false;window.__log=[]');
  // make the text fallback fail too, so the turn fails and leaves a retry
  await pg.evaluate(
    "(()=>{const orig=DR.platform.sample;const wrapped=async(p,o)=>{throw{code:'upstream_error',message:'gone'}};wrapped.json=orig.json;wrapped.limits=orig.limits;DR.platform.sample=wrapped})()",
  );
  await pg.fill('#input', '다시 문을 연다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(900);
  c = await pg.evaluate('window.__calls');
  await pg.evaluate('window.__log=[]');
  await pg.click('#retryBtn');
  await pg.waitForTimeout(900);
  const j = await pg.evaluate("window.__log.find(x=>x.verb==='json')");
  const ref = Boolean(j && j.cache && j.cache.refresh);
  const c4 = await pg.evaluate('window.__calls');
  nar = await pg.evaluate(
    "DR.app.turns[DR.app.turns.length-1].kind==='ai'?DR.app.turns[DR.app.turns.length-1].out.narration:'(none)'",
  );
  console.log('4) retry after a rejected answer: refresh:', ref, '| new generations:', c4 - c, '| narration:', nar);
  check(
    errs,
    '4) a rejected answer is not replayed: the retry asks fresh and shows the new answer',
    ref && c4 - c === 1 && nar === `장면 ${c4}`,
  );
  expect(errs).toEqual([]);
});
