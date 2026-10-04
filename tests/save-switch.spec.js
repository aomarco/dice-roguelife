// leaving a save while its reply is still being written: the reply is dropped, never lands in the next save, and the
// next game starts normally (its opening reply runs; the new-life form is not wiped)
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

// the line '느리게' gets its answer after 4 seconds; everything else answers at once
const SLOW = String.raw`async(p,o)=>{window.__calls=(window.__calls||0)+1;
 if(p.includes('[이번 입력] 느리게')){await new Promise(r=>setTimeout(r,4000));
   return {admin:'',narration:'OLD LIFE REPLY',system:[],choices:['a'],stat_changes:{gold:999999},clock:{days_passed:0},memory:{},dead:false}}
 return {admin:'',narration:'장면 '+window.__calls,system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;
// the life ledger takes 2.5 seconds and then fails; the death line and other lines answer at once
const LEDGER_FAILS = String.raw`async(p,o)=>{window.__calls=(window.__calls||0)+1;
 if(!p.includes('[이번 입력]')){await new Promise(r=>setTimeout(r,2500));throw Object.assign(new Error('rate'),{code:'rate_limited'})}
 if(p.includes('[이번 입력] 죽는다'))return {admin:'',narration:'죽었다.',system:[],choices:[],stat_changes:{hp:-99999},clock:{days_passed:0},memory:{},dead:true};
 return {admin:'',narration:'장면 '+window.__calls,system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;
const ROWS = "DR.app.turns.map(t=>t.kind+':'+(t.kind==='ai'?t.out.narration:(t.text||'').slice(0,12)))";

async function newGameWhileWaiting(game, accept) {
  const { pg, errs } = await game(claudeMock(SLOW), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg, { name: '첫째' });
  await pg.waitForFunction('DR.app.turns.length>1&&DR.isIdle()', null, { timeout: 20000 });
  const first = await pg.evaluate('DR.app.currentSave.id');
  await pg.fill('#input', '느리게');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction("DR.app.phase==='narrating'", null, { timeout: 5000 });
  await pg.click('[data-tab="saves"]');
  await pg.click('#newGame');
  if (accept) {
    await startLife(pg, { name: '둘째' }); // rolls and accepts before the old reply arrives
  }
  await pg.waitForTimeout(5000); // the old reply has arrived by now
  const out = {
    idle: await pg.evaluate('DR.isIdle()'),
    form: await pg.evaluate("!!document.querySelector('#rollBtn')"),
    rows: accept ? await pg.evaluate(ROWS) : null,
    'same save': (await pg.evaluate('DR.app.currentSave&&DR.app.currentSave.id')) === first,
    'send button': await pg.evaluate("document.querySelector('#sendBtn').textContent"),
  };
  const firstRows = await pg.evaluate(
    `(async()=>(await DR.turnStore.loadAll('${first}')).map(t=>t.kind+':'+(t.kind==='ai'?t.out.narration:(t.text||'').slice(0,12))))()`,
  );
  await pg.close();
  return [out, firstRows, errs];
}

async function newGameDuringLedger(game) {
  const { pg, errs } = await game(claudeMock(LEDGER_FAILS), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg, { name: '첫째' });
  await pg.waitForFunction('DR.app.turns.length>1&&DR.isIdle()', null, { timeout: 20000 });
  await pg.fill('#input', '죽는다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction('DR.app.state.dead&&DR.isIdle()', null, { timeout: 10000 });
  await pg.click('#ledgerBtn');
  await pg.waitForFunction("DR.app.phase==='ledger'", null, { timeout: 5000 });
  await pg.click('[data-tab="saves"]');
  await pg.click('#newGame');
  await startLife(pg, { name: '둘째', wait: 600 });
  await pg.waitForTimeout(3500); // the abandoned ledger has failed by now
  const n = await pg.evaluate('DR.app.turns.length');
  const out = { phase: await pg.evaluate('DR.app.phase') };
  await pg.evaluate("DR.send('걷는다');0");
  await pg.waitForFunction(`DR.app.turns.length>${n}&&DR.isIdle()`, null, { timeout: 10000 });
  out.sent = (await pg.evaluate('DR.app.turns.length')) > n;
  await pg.close();
  return [out, errs];
}

test('form survives late reply', async ({ game }) => {
  // A) new game form open when the old reply arrives: the form stays
  const [a, aFirst, errs] = await newGameWhileWaiting(game, false);
  console.log(
    'A) form still there:',
    a.form,
    '| idle:',
    a.idle,
    '| send button:',
    a['send button'],
    '| old save rows:',
    aFirst.slice(-2),
  );
  if (!a.form) errs.push('the new-life form was wiped by the late reply');
  if (aFirst.some(r => r.includes('OLD LIFE REPLY'))) errs.push('the abandoned reply was written into the old save');
  expect(errs).toEqual([]);
});

test('new life drops old reply', async ({ game }) => {
  // B) new life accepted before the old reply arrives: its opening runs, the old reply goes nowhere
  const [b, bFirst, errs] = await newGameWhileWaiting(game, true);
  console.log('B) rows in the new save:', b.rows, '| idle:', b.idle, '| send button:', b['send button']);
  if (b['same save']) errs.push('still in the first save');
  if (bFirst.some(r => r.includes('OLD LIFE REPLY'))) errs.push('the abandoned reply was written into the old save');
  if ((b.rows || []).some(r => r.includes('OLD LIFE REPLY'))) errs.push('the old reply landed in the new save');
  if (!(b.rows || []).some(r => r.startsWith('ai:장면'))) errs.push('the new life never got its opening reply');
  if (b['send button'] !== '보내기') errs.push('the send button is still a stop button');
  expect(errs).toEqual([]);
});

test('failed ledger does not lock new game', async ({ game }) => {
  // C) new game while the life ledger is being written, and the ledger then fails: the new game is not locked
  const [c, errs] = await newGameDuringLedger(game);
  console.log('C) after the abandoned ledger failed -> phase:', c.phase, '| a new line goes through:', c.sent);
  if (c.phase !== 'idle' || !c.sent) errs.push('the failed ledger of the old save locked the new game');
  expect(errs).toEqual([]);
});
