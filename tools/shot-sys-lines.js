// Not a test: a screenshot of the system lines of one turn at a given width, to eyeball their layout.
//   node tools/shot-sys-lines.js 390 /tmp/sys.png
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { build, writePage } from './build.js';
import { MOCK_BASE, startLife } from '../tests/support/harness.js';

const [width, out] = process.argv.slice(2);
if (!width || !out) {
  console.log('usage: node tools/shot-sys-lines.js <width> <out.png>');
  process.exit(1);
}
const SYSLINES = [
  '[ 판정 성공 ]',
  '[ 경고: 내일 해 뜰 때까지 미끼 둘을 끌고 와야 배를 안 열린다 ]',
  '[ 칭호 획득: 손가락 두 장 ]',
  '【 서울 상공에 S급 게이트가 열렸습니다 】',
];
const MOCK =
  MOCK_BASE +
  String.raw`
window.claude={use:async(n)=>{ if(n==='db')return window.__dbmock; if(n==='user')return{id:async()=>'u_test',isOwner:async()=>true,can:async()=>true};
 if(n==='sample'){const f=async()=>({text:''});f.limits=async()=>({maxPromptBytes:262144});f.json=async()=>({admin:'',narration:'장면. "대사."',system:${JSON.stringify(SYSLINES)},choices:['기다린다'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false});return f;} return null;}};
`;

const url = process.env.DR_URL || pathToFileURL(writePage((await build()).html)).href;
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 2 });
await pg.addInitScript(MOCK);
await pg.goto(url);
await pg.waitForTimeout(500);
await startLife(pg, { world: 'hunter', dice: false });
await pg.locator('.turn').last().locator('.sysmsg').first().screenshot({ path: out });
await browser.close();
console.log('saved', out);
