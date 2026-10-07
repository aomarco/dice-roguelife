// the player's language, length and correction settings reach the prompt, just before the rules list, even when a
// prompt near the size limit is rebuilt without its lore, background and past lives
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const CHECK = String.raw`(()=>{const p=DR.buildPrompt('간다',null);const at=s=>s?p.indexOf(s):-2;const rules=p.indexOf('\nRules:\n');
  return {lang:at(DR.prompts.lang.en),len:at(DR.pr('lenLong')),tip:at(DR.prompts.tip.en),rules,bytes:new Blob([p]).size}})()`;

test('prompt settings', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  await pg.waitForFunction('DR.app.turns.length>0&&DR.isIdle()', null, { timeout: 20000 });
  const plain = await pg.evaluate(CHECK);
  console.log('default settings:', plain);
  if (plain.lang !== -1 || plain.len !== -1 || plain.tip !== -1) errs.push('blocks present with default settings');
  await pg.evaluate("DR.app.settings.lang='en';DR.app.settings.len='long';DR.app.settings.langTip=true;0");
  const on = await pg.evaluate(CHECK);
  console.log('english, long, correction:', on);
  for (const k of ['lang', 'len', 'tip']) {
    if (on[k] < 0) errs.push(`${k} block missing`);
    else if (on[k] > on.rules) errs.push(`${k} block is not before the rules list`);
  }
  await pg.evaluate(`DR.platform.limits={maxPromptBytes:${Math.floor(on.bytes / 2)}};0`);
  const small = await pg.evaluate(CHECK);
  console.log('rebuilt smaller:', small);
  if (small.bytes >= on.bytes) errs.push('prompt was not rebuilt smaller');
  if (Math.min(small.lang, small.len, small.tip) < 0) errs.push('blocks lost in the smaller rebuild');
  expect(errs).toEqual([]);
});
