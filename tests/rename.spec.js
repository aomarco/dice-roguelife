// two labels for one person are merged by renames: one face, one set of notes
import { test, expect } from './support/test.js';
import { check, claudeMock, library, pageFn, same, startLife } from './support/harness.js';

const SEQ = [
  {
    speaker: '가게 사장',
    speaker_gender: 'male',
    speaker_weight: 'minor',
    memory: { relations: [{ name: '가게 사장', note: '일을 맡기기로 했다.' }] },
  },
  {
    speaker: '가게 아저씨',
    speaker_gender: 'male',
    speaker_weight: 'minor',
    memory: { relations: [{ name: '가게 아저씨', note: '깨끗한 옷 조건을 걸었다.' }] },
  },
  { renames: { '가게 사장': '가게 아저씨' } },
];
const J =
  // a portrait pick (Pick the portrait...) takes the first face offered and does not count as a turn
  "async(p)=>{if(String(p).startsWith('Pick the portrait')){const m=/- (\\w+)/.exec(p);return{pick:m?m[1]:'none'}}const seq=" +
  JSON.stringify(SEQ) +
  ";const n=(window.__n=(window.__n||0)+1);const x=seq[Math.min(n,seq.length)-1]||{};return Object.assign({admin:'',narration:'장면 '+n,system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false},x)}";

test('rename', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  // a real image library, so each label gets a face
  await pg.evaluate(pageFn('(L)=>{DR.app.images.push(...L.rows);Object.assign(DR.app.setMeta,L.sets)}'), library());
  await startLife(pg);
  const st =
    "JSON.stringify({rel:Object.keys(DR.app.state.relations).filter(k=>k.startsWith('가게')),note:DR.app.state.relations['가게 아저씨']||'',cast:Object.keys(DR.app.state.cast||{}).filter(k=>k.startsWith('가게'))})";
  await pg.fill('#input', '다음 0');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const before = JSON.parse(await pg.evaluate(st));
  console.log('before:', before);
  check(errs, 'before the rename: two labels, two faces', before.rel.length === 2 && before.cast.length === 2);
  await pg.fill('#input', '다음 1');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const after = JSON.parse(await pg.evaluate(st));
  console.log(
    'after :',
    after,
    '| note on the turn:',
    await pg.evaluate("(DR.app.turns[DR.app.turns.length-1].notes||[]).join(', ')"),
  );
  check(
    errs,
    'after the rename: one person keeps both notes',
    same(after.rel, ['가게 아저씨']) && after.note.includes('일을 맡기기로') && after.note.includes('깨끗한 옷'),
  );
  check(errs, 'after the rename: one face', same(after.cast, ['가게 아저씨']));
  expect(errs).toEqual([]);
});
