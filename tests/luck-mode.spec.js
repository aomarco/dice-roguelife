// the luck mode is chosen at the start of a save: off = plausibility and the player's lead, on = code dice and everyday luck
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, same } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__prompts=[];
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async(p)=>{window.__prompts.push(p);return{admin:'',narration:'장면.',system:[],choices:['담을 넘는다 (성공 확률 30%)','기다린다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false,check:{p:50}}};return f;} return null;}};
`;

async function start(pg, check) {
  await pg.waitForSelector('#nm');
  await pg.fill('#nm', '진무');
  await pg.click('[data-w="hunter"]');
  const box = await pg.$('#diceMode');
  const shown = box !== null;
  const dflt = box ? await box.isChecked() : null;
  if (box && check !== dflt) await box.click();
  await pg.click('#rollBtn');
  await pg.waitForTimeout(1500);
  await pg.click('#acceptBtn');
  await pg.waitForTimeout(700);
  return [shown, dflt];
}

async function turn(pg, text) {
  await pg.evaluate("DR.rollLuck=()=>'bad';0");
  await pg.fill('#input', text);
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(700);
  const last = await pg.evaluate('window.__prompts.slice(-1)[0]');
  return {
    rule: await pg.evaluate('DR.app.state.rules.dice'),
    roll: await pg.evaluate('!!DR.app.turns[DR.app.turns.length-2].roll'),
    dice_block: last.includes('이번 행동의 주사위'),
    fixed_block: last.includes('이번 행동의 판정은 이미 정해졌다'),
    nodice_block: last.includes('[판정 방식]'),
    luck_block: last.includes('[생활 운]'),
    odds_on_buttons: await pg.evaluate("document.querySelectorAll('.choices .odds').length"),
  };
}

test('luck mode', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [420, 900] });
  await pg.waitForTimeout(500);
  let [shown, dflt] = await start(pg, false);
  console.log('form: checkbox shown', shown, '| default checked', dflt);
  check(errs, 'the form offers the luck mode, on by default', shown === true && dflt === true);
  const off = await turn(pg, '담을 넘는다');
  console.log('OFF:', off);
  check(
    errs,
    'OFF: no die, no luck, no odds on buttons, the no-dice rule in the prompt',
    same(off, {
      rule: false,
      roll: false,
      dice_block: false,
      fixed_block: false,
      nodice_block: true,
      luck_block: false,
      odds_on_buttons: 0,
    }),
  );
  await pg.evaluate('DR.startNewLifeForm();0');
  await pg.waitForTimeout(400);
  [shown, dflt] = await start(pg, true);
  console.log('next form remembers last choice (off):', dflt === false);
  check(errs, 'the next form remembers the last choice (off)', dflt === false);
  const on = await turn(pg, '담을 넘는다');
  console.log('ON :', on);
  check(
    errs,
    'ON: the offered choice sent as-is rolls at its fixed odds, with everyday luck and odds on the button',
    same(on, {
      rule: true,
      roll: true,
      dice_block: false,
      fixed_block: true,
      nodice_block: false,
      luck_block: true,
      odds_on_buttons: 1,
    }),
  );
  // a save made before this feature (rule stored as null) keeps its dice
  await pg.evaluate('DR.app.state.rules.dice=null;0');
  const old = await turn(pg, '다시 넘는다');
  console.log('old save:', old);
  check(
    errs,
    'a save from before the mode (null) keeps dice: free input gets the dice block and luck',
    old.roll && old.dice_block && old.luck_block && !old.nodice_block && old.odds_on_buttons === 1,
  );
  expect(errs).toEqual([]);
});
