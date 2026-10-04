// the story's scrollbar shows only while it moves; the status window keeps a visible one
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const LONG =
  "async()=>({admin:'',narration:Array(60).fill('긴 문단입니다.').join('\\n\\n'),system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false})";

test('scrollbar', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(LONG), { size: [1200, 700] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  const col = "getComputedStyle(document.querySelector('#log')).scrollbarColor";
  await pg.waitForTimeout(1200);
  const rest = await pg.evaluate(col);
  console.log('at rest:', rest);
  await pg.evaluate("document.querySelector('#log').scrollTop=300;0");
  await pg.waitForTimeout(150);
  const moving = await pg.evaluate(col);
  console.log('while scrolling:', moving);
  await pg.waitForTimeout(1100);
  const later = await pg.evaluate(col);
  console.log('a moment later:', later);
  await pg.evaluate('DR.openStatus();0');
  await pg.waitForTimeout(300);
  const sw = await pg.evaluate("getComputedStyle(document.querySelector('#sheetInner')).scrollbarColor");
  console.log('status window:', sw);
  const hidden = c => c.startsWith('rgba(0, 0, 0, 0)');
  const ok = hidden(rest) && !hidden(moving) && hidden(later) && !hidden(sw);
  if (!ok) errs.push('scrollbar did not hide and show as intended');
  expect(errs).toEqual([]);
});
