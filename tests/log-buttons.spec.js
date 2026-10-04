// every button in the log does its job: stat reasons, editing a choice, branching, rewriting, a screen's follow-ups,
// accepting a quest, opening a post, the share card and the hall
import { test, expect } from './support/test.js';
import { claudeMock, check, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{
 if(p.includes('인생 결산을'))return {score:42,epitaph:'쥐에게 진 허수아비',summary:'짧았다.',highlights:['시궁쥐와의 사투'],inherit:{name:'지푸라기 투지',grade:'B',desc:'버틴다'}};
 const w=p.includes('[명령] quest')?{type:'quest',board:'길드',quests:[{title:'양 찾기',client:'한스',deadline:'사흘',difficulty:2,body:'양.',reward:'은화'}]}
  :p.includes('[명령] gallery')?{type:'gallery',site:'갤',board:'헌터',posts:[{title:'F급 글',author:'ㅇㅇ',views:1,likes:2,comments:3}]}
  :p.includes('[명령] messenger')?{type:'messenger',app:'톡',room:'방',messages:[{from:'레온',text:'안녕'}]}:null;
 const dead=p.includes('[이번 입력] 죽는다');
 return {admin:'',narration:'장면.',system:[],choices:['문을 연다 (성공 확률 60%)','기다린다'],stat_changes:{gold:100,hp:dead?-99999:0},reasons:{gold:'바닥에서 주웠다'},
  clock:{days_passed:0},memory:{},widget:w,dead}}`;

const users = "DR.app.turns.filter(t=>t.kind==='user').map(t=>t.text)";

test('log buttons', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [420, 1000] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  await pg.evaluate('window.__t=[];DR.toast=m=>window.__t.push(m);0');
  const say = async text => {
    await pg.fill('#input', text);
    await pg.press('#input', 'Enter');
    await pg.waitForFunction('DR.isIdle()', null, { timeout: 10000 });
    await pg.waitForTimeout(200);
  };
  const count = () => pg.evaluate('DR.app.turns.length');
  const input = () => pg.inputValue('#input');

  await say('걷는다');
  // a stat change with a reason: tapping it, or Enter on it, says why
  await pg.click('#log .why[data-why]');
  await pg.focus('#log .why[data-why]');
  await pg.keyboard.press('Enter');
  const toasts = await pg.evaluate('window.__t');
  check(
    errs,
    'a stat reason shows on a tap and on Enter',
    toasts.filter(t => t.includes('바닥에서 주웠다')).length === 2,
  );

  // the pencil on a choice puts it in the input, without the odds and without sending
  let n = await count();
  await pg.click('#log [data-cedit]');
  check(
    errs,
    'editing a choice fills the input and sends nothing',
    (await input()) === '문을 연다 ' && (await count()) === n,
  );
  await pg.fill('#input', '');

  // branching asks first; a no leaves the save as it was
  const save = await pg.evaluate('DR.app.currentSave.id');
  await pg.evaluate('window.__asked=null;DR.askConfirm=async q=>{window.__asked=q;return false};0');
  await pg.click('#log [data-fork] >> nth=-1');
  await pg.waitForTimeout(200);
  const asked = await pg.evaluate('window.__asked');
  check(
    errs,
    'branching asks before it makes a copy, and a no keeps the save',
    !!asked && asked.includes('분기') && (await pg.evaluate('DR.app.currentSave.id')) === save,
  );

  // rewriting opens the reasons; closing the sheet changes nothing
  await pg.click('#log [data-reroll]');
  const reasons = await pg.locator('#sheetInner [data-rr]').count();
  await pg.evaluate('DR.closeSheet();0');
  await pg.waitForTimeout(200);
  check(errs, 'rewrite offers its reasons, and closing it keeps the reply', reasons > 1 && (await count()) === n);

  // a quest board: accepting a quest, then asking for more
  await say('/의뢰');
  await pg.click('#log [data-accept="0"]');
  await pg.waitForTimeout(300);
  const q = await pg.evaluate('({quests:DR.app.state.quests.map(x=>x.title),last:DR.app.turns.at(-1).text})');
  const btn = pg.locator('#log [data-accept="0"]').last();
  check(
    errs,
    'accepting a quest adds it, notes it in the log and turns the button off',
    q.quests.includes('양 찾기') &&
      q.last === '의뢰 수락: 양 찾기' &&
      (await btn.isDisabled()) &&
      (await btn.textContent()) === '수락함',
  );
  await pg.click('#log [data-act="/의뢰 다른 의뢰도 보여줘"]');
  await pg.waitForFunction('DR.isIdle()', null, { timeout: 10000 });
  check(errs, 'a follow-up button sends its line', (await pg.evaluate(users)).includes('/의뢰 다른 의뢰도 보여줘'));

  // a board: opening a post sends the open line; "comment" only starts one in the input
  await say('/갤');
  await pg.click('#log [data-open]');
  await pg.waitForFunction('DR.isIdle()', null, { timeout: 10000 });
  check(errs, 'opening a post asks for it by title', (await pg.evaluate(users)).includes('/갤 "F급 글" 글 열기'));
  n = await count();
  await pg.click('#log [data-act="comment"] >> nth=-1');
  check(
    errs,
    'comment starts a comment in the input and sends nothing',
    (await input()) === '/갤 댓글: ' && (await count()) === n,
  );
  await pg.fill('#input', '');

  // a chat: reply starts a message in the input
  await say('/톡 안녕');
  n = await count();
  await pg.click('#log [data-act="reply"]');
  check(
    errs,
    'reply starts a message in the input and sends nothing',
    (await input()) === '/톡 ' && (await count()) === n,
  );
  await pg.fill('#input', '');

  // the end of a life: the share card, then the hall
  await say('죽는다');
  await pg.click('#ledgerBtn');
  await pg.waitForSelector('#log [data-card]', { timeout: 10000 });
  await pg.click('#log [data-card]');
  const card = await pg.locator('#sheetInner .sharecard .sc-score b').textContent();
  await pg.evaluate('DR.closeSheet();0');
  check(errs, 'the share card shows the life score', card === '42');
  await pg.evaluate("window.__t=[];DR.askPrompt=async()=>'테스터';0");
  await pg.click('#log [data-hall]');
  await pg.waitForFunction("window.__t.includes('전당에 올렸어요')", null, { timeout: 5000 });
  const hall = pg.locator('#log [data-hall]').last();
  check(
    errs,
    'the hall button posts the life once and then stays off',
    (await hall.isDisabled()) && (await hall.textContent()) === '전당에 올림',
  );
  expect(errs).toEqual([]);
});
