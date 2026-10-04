// two or more writes to the last page at once, with real-world latency: queued, all land, no false conflict
import { test, expect } from './support/test.js';
import { claudeMock, startLife } from './support/harness.js';

const LATENCY = `(()=>{const wrap=ref=>{const o=Object.create(ref);const lag=()=>new Promise(r=>setTimeout(r,5+Math.random()*30));
  o.get=async(...a)=>{await lag();const x=await ref.get(...a);await lag();return x};o.set=async(...a)=>{await lag();const x=await ref.set(...a);await lag();return x};return o};
  const d0=DR.platform.db.doc.bind(DR.platform.db);DR.platform.db.doc=p=>wrap(d0(p))})()`;

async function trial(game, old) {
  const { pg, errs } = await game(claudeMock(), { size: [1280, 720] });
  await pg.waitForTimeout(500);
  await startLife(pg);
  await pg.evaluate(LATENCY + ';0');
  if (old) await pg.evaluate('DR.turnStore.writeTail=function(){return this._writeTail(this.tail)};0');
  const r = await pg.evaluate(`(async()=>{const t=DR.app.turns[DR.app.turns.length-1];const v0=DR.turnStore.tail.v;
      const out=await Promise.allSettled([1,2,3,4].map(()=>DR.turnStore.update(t)));
      return{results:out.map(x=>x.status==='fulfilled'?'ok':'conflict'),v0,v1:DR.turnStore.tail.v}})()`);
  await pg.close();
  return [r, errs];
}

test('write queue', async ({ game }) => {
  const [old] = await trial(game, true);
  console.log('old, unqueued :', old.results);
  const [now, errs] = await trial(game, false);
  console.log('now, queued   :', now.results, '| version', now.v0, '->', now.v1);
  const ok = now.results.every(x => x === 'ok') && now.v1 === now.v0 + 4;
  if (!ok) errs.push('queued writes did not all land');
  expect(errs).toEqual([]);
});
