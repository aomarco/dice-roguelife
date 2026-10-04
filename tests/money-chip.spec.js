// money and age changes show their amounts in the chips even before awakening; hidden stats stay arrows
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const A =
  "async()=>({admin:'',narration:'은닉금을 꺼낸다.',system:[],choices:['a'],stat_changes:{gold:65000,str:1},reasons:{gold:'보관함에서 꺼냄'},clock:{days_passed:0},memory:{},dead:false})";

test('money chip', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(A), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  await pg.evaluate('DR.statusVisible=()=>false;0');
  const n0 = await pg.evaluate('DR.app.turns.length');
  await pg.fill('#input', '꺼낸다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction(
    `DR.app.turns.length>=${n0}+2&&DR.isIdle()&&(()=>{const t=[...document.querySelectorAll('.turn')].slice(-1)[0];return t&&t.querySelectorAll('.deltas span').length>0})()`,
    null,
    { timeout: 15000 },
  );
  const chips = await pg.evaluate(
    "[...[...document.querySelectorAll('.turn')].slice(-1)[0].querySelectorAll('.deltas span')].map(e=>e.textContent)",
  );
  console.log('chips before awakening:', chips);
  const life = await pg.evaluate(
    '[DR.app.state.life.world.id,DR.app.state.rules&&DR.app.state.rules.dice,JSON.stringify(DR.app.turns[DR.app.turns.length-1].deltas)]',
  );
  const ok = chips.some(c => '소지금 +65,000원' === c) && !chips.some(c => c.startsWith('근력') && /[+-]\d/.test(c)); // a hidden stat may show an arrow or a growth cooldown, never a number
  if (!ok) errs.push('chips wrong: ' + JSON.stringify(chips) + ' life ' + JSON.stringify(life));
  expect(errs).toEqual([]);
});
