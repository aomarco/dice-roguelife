// up to 3 titles active at once: new ones auto-enable into free slots, toggling works, all active ones reach the prompt
import { test, expect } from './support/test.js';
import { claudeMock, same, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__n=(window.__n||0)+1;const names=['칭호A','칭호B','칭호C','칭호D'];const t=names[window.__n-1];
  return{admin:'',narration:'장면 '+window.__n,system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,
    title:t,title_effect:t+'효과'}}`;

test('titles multi', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 1100] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  for (let k = 0; k < 4; k++) {
    await pg.fill('#input', `간다 ${k}`);
    await pg.press('#input', 'Enter');
    await pg.waitForFunction('DR.isIdle()', null, { timeout: 15000 });
  }
  const on = await pg.evaluate('DR.titlesOn()');
  const titles = await pg.evaluate('DR.app.state.titles');
  console.log('titles earned:', titles, '| active (cap 3):', on);
  const inPrompt = await pg.evaluate(
    "(()=>{const p=DR.buildPrompt('x',null);return ['칭호A','칭호B','칭호C','칭호D'].filter(t=>new RegExp(t+'[(,) ]').test(p)&&!p.includes('보유: '+t))})()",
  );
  const held = await pg.evaluate("DR.buildPrompt('x',null).includes('보유: 칭호D')");
  console.log('active in prompt:', inPrompt, '| D held:', held);
  await pg.evaluate('DR.openStatus();0');
  await pg.waitForTimeout(200);
  await pg.evaluate("window.__t='';DR.toast=m=>{window.__t=m};0");
  await pg.evaluate('document.querySelector(\'[data-title="칭호D"]\').click();0');
  await pg.waitForTimeout(150);
  const afterD = await pg.evaluate('DR.titlesOn()');
  const msg = await pg.evaluate('window.__t');
  console.log('toggle D when full:', afterD, '| msg:', msg.slice(0, 40));
  await pg.evaluate('document.querySelector(\'[data-title="칭호A"]\').click();0');
  await pg.waitForTimeout(120);
  await pg.evaluate('document.querySelector(\'[data-title="칭호D"]\').click();0');
  await pg.waitForTimeout(120);
  const final = await pg.evaluate('DR.titlesOn()');
  console.log('A off then D on:', final);
  const ok =
    same(on, ['칭호A', '칭호B', '칭호C']) &&
    same([...new Set(inPrompt)].sort(), ['칭호A', '칭호B', '칭호C']) &&
    held &&
    same(afterD, ['칭호A', '칭호B', '칭호C']) &&
    msg.includes('최대') &&
    !final.includes('칭호A') &&
    final.includes('칭호D') &&
    final.length === 3;
  if (!ok) errs.push('titles multi wrong');
  expect(errs).toEqual([]);
});
