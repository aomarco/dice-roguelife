// the new-game dice checkbox reflects "on unless explicitly off": undefined -> checked, false -> unchecked, true -> checked
import { test, expect } from './support/test.js';
import { claudeMock } from './support/harness.js';

test('dice toggle', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForTimeout(600);
  // new-game screen: the diceMode checkbox
  const res = {};
  for (const [val, setter] of [
    ['undefined', 'delete DR.app.settings.dice'],
    ['false', 'DR.app.settings.dice=false'],
    ['true', 'DR.app.settings.dice=true'],
  ]) {
    await pg.evaluate(`${setter};0`);
    // re-render the new-life form
    await pg.evaluate('DR.startNewLifeForm(false);0');
    await pg.waitForTimeout(120);
    const checked = await pg.evaluate("(document.querySelector('#diceMode')||{}).checked");
    res['new:' + val] = checked;
  }
  console.log(res);
  const ok = res['new:undefined'] === true && res['new:false'] === false && res['new:true'] === true;
  if (!ok) errs.push('toggle mismatch: ' + JSON.stringify(res));
  expect(errs).toEqual([]);
});
