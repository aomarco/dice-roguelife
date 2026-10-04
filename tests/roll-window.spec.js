// the roll shows once, as the first window of the reply's end block; the bubble stays clean
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, same, shot, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__n=0;
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async()=>{window.__n++;return{admin:'',narration:'장면.',system:['[ 판정 성공 ]','[ 오늘 밤 일정 확정: 21시 구형 PC ]'],choices:['간다 (성공 확률 60%)','버틴다 (성공 확률 90%)'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}};return f;} return null;}};
`;

test('roll window', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [390, 1000], scale: 2 });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: true });
  await pg.evaluate('DR.rnd=()=>0.31;0');
  await pg.click('[data-choice] >> nth=0');
  await pg.waitForTimeout(800);
  const last = "[...document.querySelectorAll('.turn')].slice(-1)[0]";
  const clean = await pg.evaluate("!document.querySelector('.rollchip')");
  console.log('bubble chip gone:', clean);
  check(errs, 'the bubble stays clean: no roll chip', clean);
  const end = await pg.evaluate(
    '[...' + last + ".querySelectorAll('.sysmsg:not(.inl) > *')].map(e=>(e.dataset.tag||'')+' '+e.textContent.trim())",
  );
  console.log('end block:', end);
  check(
    errs,
    "the roll shows once, first in the end block (die 32 at 60% succeeds); the model's own result line is dropped, the other line kept",
    end.length === 2 &&
      end[0].startsWith('CHECK') &&
      end[0].includes('60 이하 필요: 🎲 32 → 성공') &&
      !end.some(e => e.includes('판정')) &&
      end[1].includes('오늘 밤 일정'),
  );
  const el = await pg.$$('.turn');
  await el.at(-1).screenshot({ path: shot('rollwin.png') });
  // a critical failure: 90% choice and a high die
  await pg.evaluate('DR.rnd=()=>0.95;0');
  await pg.click('[data-choice] >> nth=1');
  await pg.waitForTimeout(2500);
  await pg.evaluate("document.querySelector('#dice')&&document.querySelector('#dice').click();0");
  await pg.waitForTimeout(500);
  const cw = await pg.evaluate(
    '[...' +
      last +
      ".querySelectorAll('.sysmsg:not(.inl) > .win')].map(e=>e.className+' '+e.dataset.tag+' '+e.textContent.trim())[0]",
  );
  console.log('critical fail window:', cw);
  const tags = await pg.evaluate(
    '[...' + last + ".querySelectorAll('.sysmsg:not(.inl) > *')].map(e=>e.dataset.tag||'')",
  );
  check(
    errs,
    'die 96 at 90% is a critical failure: the big window, first and only roll in the end block',
    !!cw &&
      cw.startsWith('win big sys-bad CRITICAL') &&
      cw.includes('대실패') &&
      cw.includes('90 이하 필요: 🎲 96') &&
      same(tags.slice(0, 1), ['CRITICAL']) &&
      tags.filter(t => t === 'CRITICAL').length + tags.filter(t => t === 'CHECK').length === 1,
  );
  const hid = await pg.evaluate(
    '!(' + last + ".querySelector('.deltas')||{textContent:''}).textContent.includes('이하 필요')",
  );
  console.log('crit note hidden in chips:', hid);
  check(errs, 'the roll is not repeated in the change chips', hid);
  expect(errs).toEqual([]);
});
