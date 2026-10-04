// the HTML story export carries every picture a turn shows: the scene and everyone on screen, not just the speaker
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

test('export images', async ({ game }) => {
  const { pg, errs } = await game(claudeMock(), { size: [420, 900] });
  await pg.waitForSelector('#rollBtn');
  await startLife(pg);
  await pg.fill('#input', '간다');
  await pg.press('#input', 'Enter');
  await pg.waitForFunction('DR.app.turns.length>2&&DR.isIdle()', null, { timeout: 20000 });
  await pg.evaluate(`(async()=>{
          DR.app.images.push({id:'bg1',kind:'scene',name:'street_day'},{id:'c1',kind:'char',set:'female1',emotion:'neutral'},{id:'c2',kind:'char',set:'male1',emotion:'neutral'});
          const t=DR.app.turns[DR.app.turns.length-1];t.img={scene:'bg1',char:'c1',chars:[{id:'c1',npc:'민아'},{id:'c2',npc:'도윤'}]};await DR.turnStore.update(t);
          DR.toDataUrl=async id=>'data:image/png;base64,'+id;
          DR.useCapability=async n=>n==='downloads'?{save:async({data})=>{window.__html=await data.text()}}:null;
        })()`);
  const sid = await pg.evaluate('DR.app.currentSave.id');
  await pg.evaluate(`DR.exportStory(${JSON.stringify(sid)},'html','all',true,()=>{})`);
  await pg.waitForFunction('!!window.__html', null, { timeout: 15000 });
  const html = await pg.evaluate('window.__html');
  const found = Object.fromEntries(['bg1', 'c1', 'c2'].map(i => [i, html.includes(`base64,${i}`)]));
  console.log('embedded:', found);
  if (!Object.values(found).every(v => v)) errs.push('a picture shown in the turn is missing from the export');
  expect(errs).toEqual([]);
});
