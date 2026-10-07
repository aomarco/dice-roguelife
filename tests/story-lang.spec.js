// Each save keeps the story language it began in: the screen language never changes a running story, and the
// story language setting changes only the open save (with no save open, it is the language new games start in).
import { test, expect } from './support/test.js';
import { check, claudeMock, startLife } from './support/harness.js';

const ANSWER = `async(p)=>{(window.__prompts=window.__prompts||[]).push(p);return {admin:'',narration:'.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;
const lastPrompt = pg => pg.evaluate(() => window.__prompts.at(-1));

test('the screen language does not change a running story', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(ANSWER));
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  check(errs, 'a Korean game keeps Korean', (await pg.evaluate('DR.app.state.lang')) === 'ko');
  await pg.evaluate(() => DR.chooseUiLang('en'));
  check(errs, 'the screen is English', (await pg.evaluate('document.documentElement.lang')) === 'en');
  check(errs, 'the story is still Korean', (await pg.evaluate('DR.storyLang()')) === 'ko');
  await pg.evaluate(() => DR.send('간다'));
  const ko = await pg.evaluate(() => DR.prompts.lang.ko);
  const p = await lastPrompt(pg);
  check(errs, 'the next prompt asks for Korean', p.includes(ko));
  check(errs, 'and not for English', !p.includes('must be in English'));

  // the story language setting, with this save open, changes this save only
  await pg.click('#gearBtn');
  await pg.selectOption('#langSel', 'ja');
  await pg.waitForFunction(() => DR.app.state.lang === 'ja');
  check(errs, 'the new-game default is untouched', !(await pg.evaluate('DR.app.settings.lang')));
  check(
    errs,
    'no "same as the screen" choice for a running save',
    (await pg.$$('#langSel option[value=""]')).length === 0,
  );
  expect(errs).toEqual([]);
});

test('a new game starts in the language chosen then', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(ANSWER));
  await pg.waitForSelector('#rollBtn');
  await pg.evaluate(() => DR.chooseUiLang('en'));
  await startLife(pg, { name: 'Jin' });
  check(errs, 'the save is English', (await pg.evaluate('DR.app.state.lang')) === 'en');
  check(
    errs,
    'its world is written in English',
    (await pg.evaluate('DR.app.state.life.world.name')) === 'Modern Hunter',
  );
  await pg.evaluate(() => DR.chooseUiLang('ko'));
  check(errs, 'switching the screen back keeps the story English', (await pg.evaluate('DR.storyLang()')) === 'en');
  expect(errs).toEqual([]);
});

test('saves from before v2.6 get the language they were played in', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(ANSWER));
  await pg.waitForSelector('#rollBtn');
  const langs = await pg.evaluate(() =>
    ['현대 헌터물', 'Modern Hunter', '現代ハンターもの', ''].map(
      name => DR.compat({ life: name ? { world: { id: 'hunter', name }, gender: 'male' } : null }).lang,
    ),
  );
  check(errs, `Korean, English, Japanese, none: ${langs}`, langs.join() === 'ko,en,ja,ko');
  const kept = await pg.evaluate(
    () => DR.compat({ lang: 'ja', life: { world: { id: 'hunter', name: '현대 헌터물' } } }).lang,
  );
  check(errs, 'a stored language is kept', kept === 'ja');
  expect(errs).toEqual([]);
});
