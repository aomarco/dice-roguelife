// the Enter key setting lives in each browser, not in the account settings
import { test, expect } from './support/test.js';
import { MOCK_BASE, check } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async()=>({admin:'',narration:'x',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false});return f;} return null;}};
`;

async function openCtx(game, mobile) {
  const { pg, errs } = await game(MOCK, { size: mobile ? [390, 844] : [1200, 900], mobile });
  await pg.waitForTimeout(500);
  return { pg, errs };
}

test('enter', async ({ game }) => {
  const { pg: d, errs } = await openCtx(game, false);
  const { pg: m, errs: merrs } = await openCtx(game, true);
  const ds = await d.evaluate('DR.enterSends()');
  let ms = await m.evaluate('DR.enterSends()');
  console.log('defaults -> desktop sends:', ds, '| phone sends:', ms);
  check(errs, 'defaults: Enter sends on desktop, not on a phone', ds === true && ms === false);
  // desktop turns Enter-to-send off
  await d.evaluate(
    "(()=>{const c=document.querySelector('#enterTog');c.checked=false;c.dispatchEvent(new Event('change'))})()",
  );
  let s = await d.evaluate('DR.enterSends()');
  let st = await d.evaluate("localStorage.getItem('dr:enterSend')");
  const acc = await d.evaluate("'enterSend' in DR.app.settings");
  console.log('desktop after toggle off -> sends:', s, '| stored here:', st, '| in account app.settings:', acc);
  check(
    errs,
    'toggle off: stored as never in this browser, not in the account settings',
    s === false && st === 'never' && acc === false,
  );
  ms = await m.evaluate('DR.enterSends()');
  console.log('phone unaffected -> sends:', ms);
  check(errs, 'phone keeps its own default', ms === false);
  // survives a reload in the same browser
  await d.reload();
  await d.waitForTimeout(400);
  s = await d.evaluate('DR.enterSends()');
  const cb = await d.evaluate("document.querySelector('#enterTog')?.checked");
  console.log('desktop after reload -> sends:', s, '| checkbox:', cb);
  check(errs, 'after reload Enter still does not send and the checkbox is off', s === false && cb === false);
  // the settings select reads and writes the same place
  await d.evaluate('DR.openSettingsSheet()');
  await d.waitForTimeout(200);
  const sel = await d.evaluate("document.querySelector('#enterSel').value");
  console.log('settings select shows:', sel);
  check(errs, 'settings select shows the stored never', sel === 'never');
  await d.selectOption('#enterSel', 'auto');
  await d.waitForTimeout(100);
  st = await d.evaluate("localStorage.getItem('dr:enterSend')");
  s = await d.evaluate('DR.enterSends()');
  console.log('back to auto -> stored:', st, '| sends:', s);
  check(errs, 'auto clears the stored choice and the desktop sends again', st === null && s === true);
  errs.push(...merrs);
  expect(errs).toEqual([]);
});
