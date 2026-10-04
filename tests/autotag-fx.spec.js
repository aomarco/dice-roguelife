// 자동 분류 never turns an effect picture (kind fx: the dice reveal) into a character or a background
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

// the model calls every picture a smiling character
const J = String.raw`async(p,o)=>{if(o&&o.images){window.__tagged=(window.__tagged||0)+1;return{kind:'char',emotion:'smile',tags:['tagged']}}
  return {admin:'',narration:'장면.',system:[],choices:['a'],stat_changes:{},clock:{days_passed:0},memory:{},dead:false}}`;
const ROWS = [
  { id: 'fx1', kind: 'fx', name: 'dice', file: 'dice.png', tags: ['dice'] },
  { id: 'fx2', kind: 'fx', name: 'dice_success', file: 'dice_success.png', tags: ['dice', 'success'] },
  { id: 'fx3', kind: 'fx', name: 'dice_fail', file: 'dice_fail.png', tags: ['dice', 'fail'] },
  {
    id: 'c1',
    kind: 'char',
    name: 'female9_neutral',
    set: 'female9',
    emotion: 'neutral',
    file: 'female9_neutral.png',
    tags: [],
  },
];
// pictures load from the artifact's file store; here every one is a 1x1 png
const FETCH = String.raw`(()=>{const f=window.fetch;window.fetch=async(u,...a)=>String(u).startsWith('/_blob/')?new Response(new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'})):f(u,...a)})();0`;

test('autotag keeps fx', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(J), { size: [900, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  await pg.evaluate(FETCH);
  // the owner's file store
  await pg.evaluate(rows => {
    DR.app.images.push(...rows);
    DR.platform.limits = Object.assign({}, DR.platform.limits, { images: true });
    DR.platform.assets = {
      list: async () => ({ files: [], usage: { files: 4, maxFiles: 500, bytes: 0, maxBytes: 1e8 } }),
    };
  }, ROWS);
  await pg.click('[data-tab="images"]');
  await pg.waitForSelector('#autoTag');
  await pg.click('#autoTag');
  await pg.waitForFunction("DR.app.images.find(x=>x.id==='c1').autoTagged===true", null, { timeout: 20000 });
  const kinds = JSON.parse(
    await pg.evaluate(
      "JSON.stringify(Object.fromEntries(DR.app.images.filter(x=>['fx1','fx2','fx3','c1'].includes(x.id)).map(x=>[x.name,x.kind])))",
    ),
  );
  const asked = await pg.evaluate('window.__tagged||0');
  console.log('kinds after 자동 분류:', kinds, '| pictures sent to the model:', asked);
  if (['dice', 'dice_success', 'dice_fail'].some(n => kinds[n] !== 'fx')) errs.push('an effect picture lost its kind');
  if (kinds['female9_neutral'] !== 'char' || asked !== 1) {
    errs.push('the untagged character was not the only picture tagged');
  }
  expect(errs).toEqual([]);
});
