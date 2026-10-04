// world and people notes come from free setup only; a later life adds them to the notes it inherits, once
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, startLife } from './support/harness.js';

const NOTE = '이 세계엔 마법이 없다. 소꿉친구 한서윤이 옆집에 산다.';
const MOCK =
  MOCK_BASE +
  String.raw`
window.__prompts=[];
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async(p)=>{window.__prompts.push(p);return{admin:'',narration:'장면.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}};return f;} return null;}};
`;

test('world note', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [420, 1400] });
  await pg.waitForTimeout(600);
  let v = await pg.isVisible('#worldNote');
  console.log('gacha mode: field visible:', v);
  check(errs, 'gacha mode hides the note field', !v);
  // gacha start with a remembered note in settings: it must not leak in
  await pg.evaluate("DR.app.settings.worldNote='예전 노트';document.querySelector('#worldNote').value='예전 노트';0");
  await startLife(pg, { world: 'hunter', dice: false });
  let n = await pg.evaluate('DR.app.state.userNotes');
  console.log('gacha start -> notes:', JSON.stringify(n));
  check(errs, 'a gacha start ignores a remembered note', !n);
  // free start: the note seeds the save and reaches the first scene
  await pg.evaluate('DR.startNewLifeForm();0');
  await pg.waitForTimeout(400);
  await pg.fill('#nm', '진무');
  await pg.click('[data-w="hunter"]');
  await pg.click('#mseg [data-m="free"]');
  v = await pg.isVisible('#worldNote');
  console.log('free mode: field visible:', v);
  check(errs, 'free mode shows the note field', v);
  await pg.fill('#worldNote', NOTE);
  await pg.click('#rollBtn');
  await pg.waitForTimeout(1500);
  await pg.click('#acceptBtn');
  await pg.waitForTimeout(700);
  const a = (await pg.evaluate('DR.app.state.userNotes')) === NOTE;
  const c = (await pg.evaluate('window.__prompts.slice(-1)[0]')).includes(NOTE);
  console.log('free start -> notes:', a, '| first scene carries it:', c);
  check(errs, 'a free start seeds the save with the note and the first scene carries it', a && c);
  // next life in the same save, free with a new note: added once to what it inherits
  await pg.evaluate(
    "DR.app.state.userNotes='전투 묘사는 짧게.\\n'+DR.app.state.userNotes;DR.startNewLifeForm({name:''});0",
  );
  await pg.waitForTimeout(400);
  await pg.click('#mseg [data-m="free"]');
  await pg.fill('#worldNote', '이번 생엔 오빠가 있다.');
  await pg.click('#rollBtn');
  await pg.waitForTimeout(1500);
  await pg.click('#acceptBtn');
  await pg.waitForTimeout(700);
  n = await pg.evaluate('DR.app.state.userNotes');
  console.log('next life notes:', JSON.stringify(n));
  check(
    errs,
    'the next life adds its note once to the notes it inherits',
    n === '전투 묘사는 짧게.\n' + NOTE + '\n이번 생엔 오빠가 있다.',
  );
  expect(errs).toEqual([]);
});
