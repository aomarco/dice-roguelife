// moments pop up in the prose where they happen (two per turn), results stay at the end, nothing shows twice
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, same, shot, startLife } from './support/harness.js';

const NARR =
  '칼끝이 턱을 들어 올린다.\n\n[ 위기: 칼자국의 칼끝이 목에 닿았다 ]\n\n[ 경고: 출혈 ]\n\n"다음엔 손목부터 간다." 그가 웃는다.\n\n[ 칭호 획득: 손가락 두 장 ]\n\n당신은 피 묻은 손을 주머니에 넣는다.\n\n【 서울 상공에 S급 게이트가 열렸습니다 】\n\n멀리서 사이렌이 운다.';
const SYSTEM = ['[ 판정 실패 ]', '[ 칭호 획득: 손가락 두 장 ]'];
const MOCK =
  MOCK_BASE +
  String.raw`
window.__hold=null;
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async(p,o)=>{
   if(window.__stream&&o&&o.onText){o.onText({text:'{"scene":null,"speaker":null,"emotion":"neutral","admin":"","narration":"앞 문단.\\n\\n[ 칭호 획득: 첫 피 ]\\n\\n뒤 문'});await new Promise(r=>window.__hold=r)}
   return {admin:'',narration:${JSON.stringify(NARR)},system:${JSON.stringify(SYSTEM)},choices:['기다린다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}};return f;} return null;}};
`;

test('inline sys', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [390, 1400], scale: 2 });
  await pg.waitForTimeout(500);
  await startLife(pg, { world: 'hunter', dice: false });
  const t = "[...document.querySelectorAll('.turn')].slice(-1)[0]";
  const inl = await pg.evaluate(t + ".querySelectorAll('.narr .sysmsg.inl > *').length");
  const order = await pg.evaluate(t + ".querySelector('.narr').innerText.replace(/\\s+/g,' ').slice(0,200)");
  const end = await pg.evaluate(
    '[...' + t + ".querySelectorAll(':scope .body > .sysmsg > *, .sysmsg:not(.inl) > *')].map(e=>e.textContent.trim())",
  );
  console.log('in the prose:', inl, 'windows');
  console.log('reading order:', order);
  console.log('at the end:', end);
  check(errs, 'two of my windows (the cap) and the world message break into the prose', inl === 3);
  const at = ['위기', '경고', '손목부터', '서울 상공', '사이렌'].map(x => order.indexOf(x));
  check(
    errs,
    'windows sit where they happen, in reading order; the third of mine is not in the prose',
    Math.min(...at) >= 0 &&
      same(
        at,
        [...at].sort((a, b) => a - b),
      ) &&
      !order.includes('손가락 두 장'),
  );
  check(
    errs,
    'results stay at the end: the check result, then the title once',
    end.length === 2 && end[0].includes('판정 실패') && end[1].includes('손가락 두 장'),
  );
  const seen = await pg.evaluate(t + '.innerText');
  const twice = ['칼끝이 목에', '출혈', '손가락 두 장', '서울 상공', '판정 실패'].filter(
    x => seen.split(x).length - 1 !== 1,
  );
  check(errs, 'nothing shows twice in the turn: ' + JSON.stringify(twice), twice.length === 0);
  const el = await pg.$$('.turn');
  await el.at(-1).screenshot({ path: shot('inline_sys.png') });
  // live: a bracket line streaming in shows as a window right away
  await pg.evaluate('window.__stream=true;0');
  await pg.fill('#input', '버틴다');
  await pg.press('#input', 'Enter');
  await pg.waitForTimeout(500);
  const lv = await pg.evaluate("document.querySelectorAll('#livePrev .sysmsg.inl').length");
  console.log('live preview window:', lv);
  check(errs, 'a bracket line streaming in shows as a window right away', lv === 1);
  await pg.evaluate('window.__hold&&window.__hold();0');
  await pg.waitForTimeout(500);
  expect(errs).toEqual([]);
});
