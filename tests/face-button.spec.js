// the face button opens the picker on older turns, says why when it cannot, and errors are written down
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J =
  "async()=>{const n=(window.__n=(window.__n||0)+1);return{admin:'',narration:'[[칼자국]]\\n\\n\"왔냐.\" 장면 '+n,speaker:'칼자국',speaker_gender:'male',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}";

test('face button', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 900] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  for (let k = 0; k < 3; k++) {
    await pg.fill('#input', `간다 ${k}`);
    await pg.press('#input', 'Enter');
    await pg.waitForTimeout(500);
  }
  await pg.evaluate(`(()=>{const px='data:image/gif;base64,R0lGODlhAQABAAAAACw=';DR.app.images=[{id:'f1',kind:'char',set:'male1',name:'male1',url:px,tags:['male']},{id:'f2',kind:'char',set:'male2',name:'male2',url:px,tags:['male']}];
      for(const t of DR.app.turns)if(t.kind==='ai')t.img={chars:[{id:'f1',npc:'칼자국'}]};DR.renderLog('keep')})();0`);
  const btns = await pg.evaluate("[...document.querySelectorAll('[data-face]')].map(b=>+b.dataset.face)");
  await pg.evaluate(`document.querySelector('[data-face="${btns[0]}"]').click();0`);
  await pg.waitForTimeout(300);
  const opened = await pg.evaluate("!document.querySelector('#sheet').classList.contains('hidden')");
  await pg.evaluate(
    "DR.closeSheet();DR.app.phase='narrating';window.__t=[];const t0=DR.toast;DR.toast=(m,ms)=>{window.__t.push(m);t0(m,ms)};0",
  );
  await pg.evaluate(`document.querySelector('[data-face="${btns[0]}"]').click();DR.app.phase='idle';0`);
  const said = await pg.evaluate("window.__t.slice(-1)[0]||''");
  await pg.evaluate("DR.openCast=()=>{throw new Error('boom')};0");
  await pg.evaluate(`document.querySelector('[data-face="${btns[0]}"]').click();0`);
  await pg.waitForTimeout(200);
  const logged = await pg.evaluate("DR.ERRLOG.some(e=>e.stage==='face'&&e.msg.includes('boom'))");
  console.log(
    'older turn opens:',
    opened,
    '| while busy says:',
    JSON.stringify(said),
    '| a failure is logged:',
    logged,
  );
  if (!(opened && said.includes('답을 쓰는 중') && logged)) errs.push('face button not robust');
  expect(errs).toEqual([]);
});
