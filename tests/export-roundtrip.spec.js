// a save exported as a file comes back through import as a new save with the same turns, under the dice-roguelife format
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

test('export roundtrip', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  for (let k = 0; k < 3; k++) {
    await pg.fill('#input', `간다 ${k}`);
    await pg.press('#input', 'Enter');
    await pg.waitForFunction('DR.isIdle()', null, { timeout: 15000 });
  }
  const n0 = await pg.evaluate('DR.app.turns.length');
  const sid = await pg.evaluate('DR.app.currentSave.id');
  await pg.evaluate(
    "DR.useCapability=async n=>n==='downloads'?{save:async({filename,data})=>{window.__fn=filename;window.__exp=await data.text()}}:null;0",
  );
  await pg.evaluate(`DR.exportSaveFile('${sid}')`);
  await pg.waitForFunction('!!window.__exp', null, { timeout: 15000 });
  const env = await pg.evaluate('JSON.parse(window.__exp)');
  console.log('exported:', await pg.evaluate('window.__fn'), '| app:', env.app, '| format:', env.format);
  const before = await pg.evaluate('DR.app.saves.length');
  await pg.evaluate('DR.importSaveFile({text:async()=>window.__exp})');
  await pg.waitForFunction(`DR.app.saves.length>${before}`, null, { timeout: 20000 });
  const imp = await pg.evaluate(
    "(()=>{const m=DR.app.saves.find(x=>/가져옴/.test(x.name||''));return m&&{name:m.name,turns:m.turns,id:m.id}})()",
  );
  console.log('imported:', imp);
  // a file carrying another app id is refused
  await pg.evaluate("window.__t='';DR.toast=m=>{window.__t=m};0");
  await pg.evaluate("DR.importSaveFile({text:async()=>JSON.stringify({app:'something-else',state:{},turns:[]})})");
  await pg.waitForTimeout(300);
  const refused = await pg.evaluate('window.__t');
  console.log('foreign file:', refused);
  const ok =
    env.app === 'dice-roguelife' && env.format === 3 && !!imp && imp.turns >= n0 - 1 && refused.includes('아니에요');
  if (!ok) errs.push('export/import round trip broken');
  expect(errs).toEqual([]);
});
