// a scene previewed while a failed reply streamed does not land on the reply that comes after it
import { test, expect } from './support/test.js';
import { claudeMock, library, startLife, pageFn } from './support/harness.js';

// the first call streams the start of a reply that names a place, then fails; later calls answer with no place at all
const J = String.raw`async(p,o)=>{
  if(window.__failNext){window.__failNext=false;
    if(o&&o.onText)o.onText({text:'{"admin":"","scene":"alley, day","speaker":null,"narration":"골목으로'});
    window.__preview=JSON.stringify(DR.app.turn&&DR.app.turn.preview);
    throw Object.assign(new Error('blocked'),{code:'refused'});}
  return {admin:'',narration:'장면.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;

test('preview reset', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await pg.evaluate(pageFn('(L)=>{DR.app.images.push(...L.rows);Object.assign(DR.app.setMeta,L.sets)}'), library());
  await startLife(pg);
  await pg.waitForFunction('DR.app.turns.length>0&&DR.isIdle()', null, { timeout: 20000 });
  const n = await pg.evaluate('DR.app.turns.length');
  await pg.evaluate('window.__failNext=true;0');
  await pg.fill('#input', '골목으로 간다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction('DR.isIdle()&&!!document.querySelector("#retryBtn")', null, { timeout: 20000 });
  const preview = await pg.evaluate('window.__preview');
  console.log('preview while the failed reply streamed:', preview);
  if (!preview || !preview.includes('"scene"'))
    errs.push('the failed reply never previewed a scene, so this test proves nothing');
  await pg.click('#retryBtn');
  await pg.waitForFunction(`DR.app.turns.length>${n}+1&&DR.isIdle()`, null, { timeout: 20000 });
  const img = await pg.evaluate('JSON.stringify(DR.app.turns[DR.app.turns.length-1].img||null)');
  console.log('image of the reply after it:', img);
  if (img.includes('"scene"')) errs.push('stale preview reached the next reply');
  expect(errs).toEqual([]);
});
