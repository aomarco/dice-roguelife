// a /판정 reply shows its label while it is still being written, and an ordinary reply does not
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const SLOW =
  "async(p)=>{await new Promise(r=>setTimeout(r,1500));return p.includes('[판정 질문]')?{admin:'',narration:'기록을 펼칩니다.',system:[],choices:[],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,objection:null}:{admin:'',narration:'장면.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}";

test('judge head', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(SLOW), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg, { wait: 2500 });
  await pg.waitForTimeout(1800);
  const live =
    "(()=>{const b=document.querySelector('#liveBox');return b?(b.querySelector('.sysmsg')||{}).textContent||'(no label)':null})()";
  await pg.fill('#input', '/판정 왜');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(500);
  const j = await pg.evaluate(live);
  console.log('while /판정 is being written:', j);
  await pg.waitForTimeout(2000);
  await pg.fill('#input', '걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(500);
  const n = await pg.evaluate(live);
  console.log('while an ordinary reply is being written:', n);
  const ok = j === '[ 판정 근거 ]' && n === '(no label)';
  if (!ok) errs.push('label wrong');
  expect(errs).toEqual([]);
});
