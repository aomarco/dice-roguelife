// the status window is wider on a big screen; small dialogs keep their size; phone unchanged
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, shot, startLife } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async()=>({admin:'',narration:'x',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0,place:'재개발 3구역 빈집'},memory:{quests:[{title:'측정 비용 15만 원 마련',status:'active',note:'은닉금 65,000원'}]},dead:false,items:[{name:'헌 가죽 지갑',qty:4,grade:'F',note:'껍데기'}],ledger:{'할당량':'4/6'}});return f;} return null;}};
`;

async function measure(game, w, h, mobile, path) {
  const { pg, errs } = await game(MOCK, { size: [w, h], mobile });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: false });
  await pg.evaluate(
    "for(let i=0;i<8;i++)DR.app.state.skills.push({name:'스킬'+i,grade:'C',desc:'설명 '+i,lv:1});DR.openStatus();0",
  );
  await pg.waitForTimeout(400);
  const width = await pg.evaluate("document.querySelector('#sheetInner').getBoundingClientRect().width");
  if (path) await pg.screenshot({ path });
  await pg.evaluate("DR.closeSheet();DR.askConfirm('확인할까요?');0");
  await pg.waitForTimeout(200);
  const small = await pg.evaluate("document.querySelector('#sheetInner').getBoundingClientRect().width");
  return { width, small, errs };
}

test('status width', async ({ game }) => {
  // styles.css: a centred dialog is at most 520px, the status window (wide) 780px from 900px up; the bottom sheet is at most 760px
  const pc = await measure(game, 1400, 900, false, shot('status_pc.png'));
  console.log(`PC 1400px   -> status ${pc.width.toFixed(0)} | small dialog ${pc.small.toFixed(0)}`);
  const errs = pc.errs;
  check(
    errs,
    'PC: the status window widens past a 520px dialog to 780px, the small dialog keeps its 760px',
    Math.abs(pc.width - 780) <= 1 && Math.abs(pc.small - 760) <= 1,
  );
  const ph = await measure(game, 390, 844, true, null);
  console.log(`phone 390px -> status ${ph.width.toFixed(0)} | small dialog ${ph.small.toFixed(0)}`);
  errs.push(...ph.errs);
  check(
    errs,
    'phone unchanged: status is the width less 16px margins, the small dialog the full width',
    Math.abs(ph.width - 358) <= 1 && Math.abs(ph.small - 390) <= 1,
  );
  expect(errs).toEqual([]);
});
