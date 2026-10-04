// a choice can be copied into the input and extended; unchanged it keeps its odds, changed it is free input
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async()=>({admin:'',narration:'장면.',system:[],choices:['담을 넘는다 (성공 확률 30%)','기다린다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,check:{p:60}});return f;} return null;}};
`;

async function setup(game, mobile) {
  const { pg, errs } = await game(MOCK, { size: mobile ? [390, 844] : [420, 860], mobile });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: true });
  return { pg, errs };
}

test('choice edit', async ({ game }) => {
  const { pg, errs } = await setup(game, false);
  const n0 = await pg.evaluate('DR.app.turns.length');
  await pg.click('.cedit >> nth=0');
  await pg.waitForTimeout(200);
  let v = await pg.evaluate("document.querySelector('#input').value");
  let sent = (await pg.evaluate('DR.app.turns.length')) !== n0;
  console.log('1) pencil -> input:', JSON.stringify(v), '| sent anything:', sent);
  check(
    errs,
    '1) the pencil puts the choice, without its odds, in the box and sends nothing',
    v === '담을 넘는다 ' && !sent,
  );
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  let r = await pg.evaluate(
    'JSON.stringify((()=>{const r=DR.app.turns[DR.app.turns.length-2].roll;return{fixed:r.fixed,p:r.p}})())',
  );
  console.log('2) sent unchanged -> roll:', r);
  r = JSON.parse(r);
  check(errs, '2) sent unchanged it is still the choice: its 30% is fixed', r.fixed === true && r.p === 30);
  await pg.click('.cedit >> nth=0');
  await pg.waitForTimeout(100);
  await pg.type('#input', '칼을 입에 문 채로');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const t = await pg.evaluate('DR.app.turns[DR.app.turns.length-2].text');
  r = await pg.evaluate(
    'JSON.stringify((()=>{const r=DR.app.turns[DR.app.turns.length-2].roll;return{fixed:!!r.fixed,p:r.p}})())',
  );
  console.log('3) extended ->', JSON.stringify(t), '| roll:', r);
  r = JSON.parse(r);
  check(
    errs,
    '3) extended it is free input, judged by the narrator at 60%',
    t === '담을 넘는다 칼을 입에 문 채로' && r.fixed === false && r.p === 60,
  );
  await pg.click('[data-choice] >> nth=0', { button: 'right' });
  await pg.waitForTimeout(200);
  v = await pg.evaluate("document.querySelector('#input').value");
  console.log('4) right-click -> input:', JSON.stringify(v));
  check(errs, '4) right-click copies the choice into the box', v === '담을 넘는다 ');
  await pg.fill('#input', '');
  const n1 = await pg.evaluate('DR.app.turns.length');
  await pg.click('[data-choice] >> nth=1');
  await pg.waitForTimeout(700);
  sent = (await pg.evaluate('DR.app.turns.length')) > n1;
  console.log('5) plain click still sends:', sent);
  check(errs, '5) a plain click still sends', sent);
  expect(errs).toEqual([]);
});

test('choice long press phone', async ({ game }) => {
  const { pg: m, errs: merrs } = await setup(game, true);
  const n2 = await m.evaluate('DR.app.turns.length');
  await m.evaluate(
    "(()=>{const b=document.querySelector('[data-choice]');const t=new Touch({identifier:1,target:b,clientX:10,clientY:10});b.dispatchEvent(new TouchEvent('touchstart',{touches:[t],targetTouches:[t],changedTouches:[t],bubbles:true}))})()",
  );
  await m.waitForTimeout(650);
  await m.evaluate(
    "(()=>{const b=document.querySelector('[data-choice]');const t=new Touch({identifier:1,target:b,clientX:10,clientY:10});b.dispatchEvent(new TouchEvent('touchend',{touches:[],targetTouches:[],changedTouches:[t],bubbles:true}));b.click()})()",
  );
  await m.waitForTimeout(500);
  const v = await m.evaluate("document.querySelector('#input').value");
  const kept = (await m.evaluate('DR.app.turns.length')) === n2;
  console.log('6) phone long-press -> input:', JSON.stringify(v), '| did not send:', kept);
  check(merrs, '6) a long press on a phone copies the choice and does not send', v === '담을 넘는다 ' && kept);
  expect(merrs).toEqual([]);
});
