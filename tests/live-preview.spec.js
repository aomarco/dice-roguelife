// the banner and face are picked once per streaming reply: a redraw of the log in the middle of the stream keeps them
import { test, expect } from './support/test.js';
import { claudeMock, library, same, startLife } from './support/harness.js';

// the reply streams in two chunks with a redraw of the log between them, as a toast or a tab switch would cause
const J = String.raw`async(p,o)=>{
  if(window.__stream&&o&&o.onText){
    o.onText({text:'{"admin":"어서 와","scene":"alley, day","speaker":null,"narration":"골목으로'});
    window.__first=DR.app.turn&&DR.app.turn.preview; window.__shown1=!!document.querySelector('#liveBox .scene');
    DR.renderLog('live'); window.__shown2=!!document.querySelector('#liveBox .scene');
    o.onText({text:'{"admin":"어서 와","scene":"alley, day","speaker":null,"narration":"골목으로 들어선다'});
    window.__same=DR.app.turn&&DR.app.turn.preview===window.__first; window.__text=document.querySelector('#livePrev').textContent;}
  return {admin:'',narration:'골목으로 들어선다.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,scene:'alley, day'}}`;

test('live preview', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await pg.evaluate(L => {
    DR.app.images.push(...L.rows);
    Object.assign(DR.app.setMeta, L.sets);
  }, library());
  await startLife(pg);
  await pg.waitForFunction('DR.app.turns.length>0&&DR.isIdle()', null, { timeout: 20000 });
  const n = await pg.evaluate('DR.app.turns.length');
  await pg.evaluate('window.__stream=true;0');
  await pg.fill('#input', '골목으로 간다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction(`DR.app.turns.length>${n}+1&&DR.isIdle()`, null, { timeout: 20000 });
  const r = await pg.evaluate(
    '({first:!!window.__first, shown1:window.__shown1, shown2:window.__shown2, same:window.__same, text:window.__text, img:DR.app.turns[DR.app.turns.length-1].img.scene, picked:window.__first&&window.__first.scene})',
  );
  console.log(
    'preview picked:',
    r.first,
    '| banner before / after the redraw:',
    r.shown1,
    r.shown2,
    '| same pick after it:',
    r.same,
    '| live text:',
    JSON.stringify(r.text),
    '| reply banner is the pick:',
    same(r.img, r.picked),
  );
  if (!(r.first && r.shown1 && r.shown2 && r.same && same(r.img, r.picked))) {
    errs.push('the preview was lost or picked again after a redraw');
  }
  if (r.text !== '골목으로 들어선다') errs.push('the live narration did not follow the stream');
  expect(errs).toEqual([]);
});
