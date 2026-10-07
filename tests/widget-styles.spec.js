// Board and messenger widgets look like what players of the story's language know, unless the player picks a style.
import { test, expect } from './support/test.js';
import { check, claudeMock, startLife } from './support/harness.js';

const BOARD = {
  type: 'gallery',
  site: 'site',
  board: 'board',
  posts: [{ title: 'a post', author: 'u1', views: 1200, likes: 30, comments: 4 }],
  post: {
    title: 'a post',
    author: 'u1',
    body: 'body',
    likes: 30,
    dislikes: 2,
    comments: [{ text: 'c1' }, { text: 'c2', reply: true }],
  },
};
const CHAT = {
  type: 'messenger',
  app: 'app',
  room: 'room',
  messages: [
    { text: 'hi', me: true },
    { from: 'Leon', text: 'yo' },
  ],
};
const reply = `async()=>({admin:'',narration:'.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,widget:window.__W})`;

const widgetClass = async (pg, w) => {
  await pg.evaluate(x => (window.__W = x), w);
  await pg.evaluate(() => DR.send('/board'));
  await pg.waitForFunction(t => DR.app.turns.at(-1).out?.widget?.type === t, w.type);
  return pg.evaluate(() => [...document.querySelectorAll('#log .w')].pop().className);
};

for (const [locale, board, chat] of [
  ['ko-KR', 'w w-gal', 'w w-msg'],
  ['en-US', 'w w-gal g-reddit', 'w w-msg c-wa'],
  ['ja-JP', 'w w-gal g-5ch', 'w w-msg c-line'],
])
  test(`auto styles for ${locale}`, async ({ game }) => {
    const { pg, errs } = await game(claudeMock(reply), { locale });
    await pg.waitForSelector('#rollBtn');
    await startLife(pg, { name: 'Jin' });
    check(errs, `board: ${board}`, (await widgetClass(pg, BOARD)) === board);
    check(errs, `messenger: ${chat}`, (await widgetClass(pg, CHAT)) === chat);
    expect(errs).toEqual([]);
  });

test('/reddit shows a Reddit board in any story language, and its posts open through /reddit', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(reply));
  await pg.waitForSelector('#rollBtn');
  await startLife(pg, { name: 'Jin' });
  await pg.evaluate(x => (window.__W = x), BOARD);
  await pg.evaluate(() => DR.send('/reddit'));
  await pg.waitForFunction(() => DR.app.turns.at(-1).out?.widget?.type === 'gallery');
  const cls = await pg.evaluate(() => [...document.querySelectorAll('#log .w')].pop().className);
  check(errs, `a Korean story's /reddit board is Reddit: ${cls}`, cls === 'w w-gal g-reddit');
  check(
    errs,
    'the look is kept with the reply',
    (await pg.evaluate('DR.app.turns.at(-1).out.widget.look')) === 'reddit',
  );
  await pg.evaluate(() => DR.send('/갤'));
  await pg.waitForFunction(() => DR.app.turns.filter(t => t.out?.widget).length === 2);
  const classes = await pg.evaluate(() => [...document.querySelectorAll('#log .w')].map(w => w.className));
  check(
    errs,
    `/갤 stays DC, the earlier board stays Reddit: ${classes}`,
    classes.join() === 'w w-gal g-reddit,w w-gal',
  );
  const via = await pg.evaluate(() => document.querySelector('#log .g-reddit [data-open]').dataset.via);
  check(errs, `a Reddit board's post opens through /레딧 or /reddit: ${via}`, via === '/레딧');
  await pg.evaluate(() => DR.send('/5ch'));
  await pg.waitForFunction(() => DR.app.turns.filter(t => t.out?.widget).length === 3);
  const last = await pg.evaluate(() => {
    const w = [...document.querySelectorAll('#log .w')].pop();
    return [w.className, w.querySelector('[data-open]').dataset.via];
  });
  check(errs, `/5ch is a 5ch board that opens through /5ch: ${last}`, last.join() === 'w w-gal g-5ch,/5ch');
  expect(errs).toEqual([]);
});

test('a picked style wins over the story language, and every style draws the posts and the thread', async ({
  game,
}) => {
  const { pg, errs } = await game(claudeMock(reply), { locale: 'en-US' });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg, { name: 'Jin' });
  await widgetClass(pg, BOARD);
  for (const s of ['dc', 'reddit', '5ch', 'nico']) {
    const html = await pg.evaluate(s => {
      DR.app.settings.boardStyle = s;
      DR.renderLog('keep');
      return [...document.querySelectorAll('#log .w')].pop().outerHTML;
    }, s);
    check(errs, `${s}: the post opens from the list`, html.includes('data-open="a post"'));
    check(errs, `${s}: both comments`, html.includes('c1') && html.includes('c2'));
  }
  const ch = await pg.evaluate(() => {
    DR.app.settings.boardStyle = '5ch';
    DR.renderLog('keep');
    return [...document.querySelectorAll('#log .res')].map(r => r.textContent);
  });
  check(
    errs,
    `5ch numbers the replies and anchors a reply to the one before: ${ch.join(' / ')}`,
    ch.length === 3 && ch[2].includes('>>2'),
  );
  expect(errs).toEqual([]);
});
