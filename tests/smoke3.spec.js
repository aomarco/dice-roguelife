// free setup kept as typed, a failed opening retried once, the speaker's face picked by gender, death at HP 0
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, same, shot } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__fail=0;
window.claude={use:async(n)=>{
 if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});
   f.limits=async()=>({maxPromptBytes:200000});
   f.json=async(p,o)=>{ if(window.__fail>0){window.__fail--;const e=new Error('boom');e.code='rate_limited';throw e}
     if(o&&o.onText){o.onText({text:'{"admin":"","narration":"당신은 \"안녕\" 하고 말하는 *그림자*를 본다. 절'});await new Promise(r=>setTimeout(r,120))}
     return {admin:'',narration:'당신은 "안녕" 하고 말하는 *그림자*를 본다. 절벽 아래로 뛰어내렸다.',system:[],choices:['A','B'],stat_changes:{hp:-999},
       clock:{days_passed:1},speaker:'그림자',speaker_gender:'여',emotion:'미소',memory:{}};};
   return f;}
 return null;}};
`;

test('smoke3', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [400, 860] });
  await pg.waitForTimeout(700);
  await pg.evaluate("DR.app.images.push({id:'a3',kind:'char',set:'female1',emotion:'smile',name:'female1_smile'})");
  await pg.fill('#nm', '자유');
  await pg.click('[data-m="free"]');
  await pg.waitForTimeout(100);
  await pg.fill('#fRace', '요괴');
  await pg.selectOption('#fOT', 'S');
  await pg.fill('#fOrigin', '천마신교 소교주');
  await pg.fill('#talents .trow >> nth=0 >> .tn', '마기 친화');
  await pg.fill('#fAge', '19');
  await pg.click('#rollBtn');
  await pg.waitForTimeout(1600);
  await pg.screenshot({ path: shot('f1.png') });
  await pg.evaluate('window.__fail=1');
  await pg.click('#acceptBtn');
  await pg.waitForTimeout(600);
  const hasRetry = await pg.evaluate("!!document.querySelector('#retryBtn')");
  console.log('retry shown after failure:', hasRetry);
  check(errs, 'a failed opening offers a retry', hasRetry);
  if (hasRetry) await pg.click('#retryBtn');
  await pg.waitForTimeout(600);
  let r = await pg.evaluate(
    'JSON.stringify({life:DR.app.state.life,cast:DR.app.state.cast,dead:DR.app.state.dead,img:DR.app.turns[DR.app.turns.length-1].img,notes:DR.app.turns[DR.app.turns.length-1].notes,turns:DR.app.turns.map(t=>t.kind)})',
  );
  console.log(r);
  r = JSON.parse(r);
  const L = r.life;
  check(
    errs,
    'free setup is kept as typed: race, S origin, talent, age',
    same(
      [L.race, L.originTier, L.origin, L.talent.name, L.age, L.free],
      ['요괴', 'S', '천마신교 소교주', '마기 친화', 19, true],
    ),
  );
  check(
    errs,
    'the speaker 그림자 (gender 여) gets the female face',
    same(r.cast, { 그림자: 'female1' }) && (r.img || {}).char === 'a3',
  );
  check(errs, 'HP to 0 kills, with a note', r.dead === true && (r.notes || []).some(n => n.includes('사망')));
  check(errs, 'the retry leaves one opening reply, nothing doubled', same(r.turns, ['system', 'ai']));
  await pg.screenshot({ path: shot('f2.png') });
  expect(errs).toEqual([]);
});
