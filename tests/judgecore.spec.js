// the judging principles reach every turn with a die and /판정, once each, and not ordinary no-dice turns
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const J = String.raw`async(p)=>{window.__prompts=(window.__prompts||[]);window.__prompts.push(p);
  if(p.includes('[판정 질문]'))return{admin:'',narration:'기록을 펼칩니다.',system:[],choices:[],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,objection:null};
  return{admin:'',narration:'장면',system:[],choices:['위험한 일 (성공 확률 70%)','쉰다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;

test('judgecore', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg, { dice: true });
  await pg.fill('#input', '걷는다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const free = await pg.evaluate('window.__prompts.slice(-1)[0]');
  await pg.click('[data-choice] >> nth=0');
  await pg.waitForTimeout(2500);
  await pg.evaluate("document.querySelector('#dice')&&document.querySelector('#dice').click();0");
  await pg.waitForTimeout(500);
  const fixed = await pg.evaluate('window.__prompts.slice(-1)[0]');
  await pg.fill('#input', '/판정 왜?');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(900);
  const judge = await pg.evaluate('window.__prompts.slice(-1)[0]');
  const c = x => x.split('[판정 원칙]\n1.').length - 1;
  console.log('principles block -> free:', c(free), '| chosen roll:', c(fixed), '| /판정:', c(judge));
  console.log(
    'free roll block is procedure only:',
    !free.includes('심부름') && free.includes('[판정 주사위]'),
    '| world principle in rules:',
    free.includes('세상과 사람: 세상의 위험과 적의는'),
  );
  const ok = c(free) === 1 && c(fixed) === 1 && c(judge) === 1 && free.includes('세상과 사람: 세상의 위험과 적의는');
  if (!ok) errs.push('principles not delivered');
  expect(errs).toEqual([]);
});
