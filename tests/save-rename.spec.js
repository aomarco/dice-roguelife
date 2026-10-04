// renaming a save changes only the name on the freshest card and bumps sv, so a device still playing it with the old
// sv reloads instead of writing the old name back
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const CARD =
  "(()=>{const c=window.__store.get(DR.platform.userPath+'/saves/items/'+DR.app.currentSave.id);return c&&{name:c.name,sv:c.sv,turns:c.turns}})()";

test('save rename', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  for (let k = 0; k < 2; k++) {
    await pg.waitForFunction('DR.isIdle()', null, { timeout: 20000 });
    await pg.fill('#input', `간다 ${k}`);
    await pg.press('#input', 'Enter');
  }
  await pg.waitForFunction('DR.isIdle()&&DR.app.turns.length>=5', null, { timeout: 20000 });
  await pg.waitForTimeout(300);
  const before = await pg.evaluate(CARD);
  const sid = await pg.evaluate('DR.app.currentSave.id');
  // the list's copy is older than the database (as when another device has played since this list loaded)
  await pg.evaluate('(()=>{const s=DR.app.saves.find(x=>x.id===DR.app.currentSave.id);s.turns=1;s.sv=0})()');
  await pg.evaluate("DR.askPrompt=async()=>'새 이름';DR.showTab('saves')");
  await pg.click(`[data-rename="${sid}"]`);
  await pg.waitForFunction(
    "(()=>{const c=window.__store.get(DR.platform.userPath+'/saves/items/'+DR.app.currentSave.id);return c&&c.name==='새 이름'})()",
    null,
    { timeout: 5000 },
  );
  const after = await pg.evaluate(CARD);
  console.log('card before:', before, '| after rename:', after);
  if (after.sv !== before.sv + 1) errs.push('rename did not bump sv');
  if (after.turns !== before.turns) errs.push('rename wrote an older copy of the card');
  // a device that still holds the old sv and the old name tries to save
  await pg.evaluate(`DR.app.currentSave.sv=${before.sv};DR.app.currentSave.name='옛 이름';DR.showTab('play')`);
  await pg.evaluate('DR.persist()');
  await pg.waitForFunction("DR.app.currentSave&&DR.app.currentSave.name==='새 이름'", null, { timeout: 10000 });
  const final = await pg.evaluate(CARD);
  console.log('after the other device saved:', final);
  if (final.name !== '새 이름') errs.push('the old name was written back');
  expect(errs).toEqual([]);
});
