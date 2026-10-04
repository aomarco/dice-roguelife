// while an upheld objection is being rewritten, nothing else can be sent, and no two rows share a number
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__calls=(window.__calls||0)+1;
  if(p.includes('[판정 질문]'))return{admin:'',narration:'기록을 펼칩니다.',system:[],choices:[],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,objection:{upheld:true,fact:'틀린 날짜를 바로잡는다.',remember:false}};
  await new Promise(r=>setTimeout(r,1200));return{admin:'',narration:'답 '+window.__calls,system:[],choices:['선택지 하나'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;

test('objection race', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [1280, 720] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg, { wait: 3000 });
  const idle = 'DR.isIdle()';
  await pg.waitForFunction(`DR.app.turns.length>0&&${idle}`, null, { timeout: 20000 }); // the opening turn is in
  const n = await pg.evaluate('DR.app.turns.length');
  await pg.fill('#input', '걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction(`DR.app.turns.length>${n}&&${idle}`, null, { timeout: 20000 }); // the reply to 걷는다 is in
  const n0 = await pg.evaluate('DR.app.turns.length');
  await pg.fill('#input', '/판정 날짜 틀렸어');
  await pg.press('#input', 'Enter');
  // hammer the choices and the send path while the objection is being handled
  for (let k = 0; k < 40; k++) {
    // only while the objection is being handled; the pause paces the taps, it is not a wait for state
    await pg.waitForTimeout(100);
    if (await pg.evaluate('DR.app.turns.some(t=>t.objection)&&DR.isIdle()')) break;
    await pg.evaluate(
      "(()=>{const c=document.querySelector('[data-choice]');if(c)c.click();try{DR.send('끼어들기')}catch(e){}})();0",
    );
  }
  await pg.waitForFunction(idle, null, { timeout: 20000 });
  const rows = await pg.evaluate(
    "DR.app.turns.map(t=>[t.i,t.kind,(t.text||(t.out&&t.out.narration)||'').slice(0,12)])",
  );
  console.log('rows after:', rows.slice(-4));
  const idx = rows.map(r => r[0]);
  const dup = idx.length !== new Set(idx).size;
  const sneaked = rows.some(r => r[1] === 'user' && ['선택지 하나', '끼어들기'].includes(r[2]));
  console.log('turns', n0, '->', rows.length, '| duplicate numbers:', dup, '| something slipped in:', sneaked);
  // a double tap on a choice when idle sends once
  const m0 = await pg.evaluate("DR.app.turns.filter(t=>t.kind==='user').length");
  await pg.waitForFunction(`${idle}&&!!document.querySelector('[data-choice]')`, null, { timeout: 20000 });
  await pg.evaluate("(()=>{const c=document.querySelector('[data-choice]');c.click();c.click()})();0");
  await pg.waitForFunction(`DR.app.turns.filter(t=>t.kind==='user').length>${m0}`, null, { timeout: 20000 }); // the tap landed
  await pg.waitForFunction(`${idle}&&!!document.querySelector('[data-choice]')`, null, { timeout: 20000 }); // and its reply finished
  const m1 = await pg.evaluate("DR.app.turns.filter(t=>t.kind==='user').length");
  console.log('double tap on a choice -> user lines added:', m1 - m0);
  if (!(!dup && !sneaked && m1 - m0 === 1)) errs.push('race not closed');
  expect(errs).toEqual([]);
});
