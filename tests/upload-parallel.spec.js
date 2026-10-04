// Uploading many pictures at once: none is lost from the list, a rate-limited upload is retried, and the same files sent
// again are skipped. The database is slowed down so writes of the same page overlap the way they would live.
import { test, expect } from './support/test.js';
import { claudeMock } from './support/harness.js';

const N = 60;

// a file store whose uploads take a moment (and can fail), and a database whose index writes take a moment
const BEFORE = String.raw`
window.__up={n:0,live:0,max:0,calls:0,failFirst:0};
window.__idxWrites=0;
const __origUse=null;
`;

function hook(fail) {
  return String.raw`
(()=>{
  const base=window.claude.use;
  window.claude.use=async n=>{
    if(n==='assets')return{
      upload:async(blob,o)=>{
        const u=window.__up;u.calls++;u.live++;u.max=Math.max(u.max,u.live);
        await new Promise(r=>setTimeout(r,20+Math.random()*40));
        u.live--;
        if(u.calls<=${fail}){const e=new Error('slow down');e.code='rate_limited';throw e}
        return{id:'a'+(++u.n)};
      },
      list:async()=>({assets:[],files:0,usage:{files:0,maxFiles:5000,bytes:0,maxBytes:1e9}}),
      delete:async()=>{}
    };
    return base(n);
  };
})();
`;
}

// N distinct small png files, named as scenes so no set questions are asked
const MAKE = String.raw`async(n,tag)=>{
  const files=[];
  for(let i=0;i<n;i++){
    const cv=document.createElement('canvas');cv.width=cv.height=8;
    const c=cv.getContext('2d');c.fillStyle='hsl('+(i*6)+',70%,50%)';c.fillRect(0,0,8,8);
    c.fillStyle='#000';c.fillRect(i%8,(i*3)%8,2,2);
    const b=await new Promise(r=>cv.toBlob(r,'image/png'));
    files.push(new File([b],'bg_'+tag+i+'_day.png',{type:'image/png'}));
  }
  const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));
  const inp=document.querySelector('#upl');inp.files=dt.files;inp.dispatchEvent(new Event('change'));
}`;

async function setup(game, fail = 0) {
  const { pg, errs } = await game(claudeMock(undefined, { before: BEFORE }), { size: [900, 900] });
  await pg.waitForSelector('#rollBtn');
  await pg.evaluate(hook(fail));
  await pg.evaluate(() => {
    // the page already holds its capability handles; reconnect the file store through the patched use()
    return window.claude.use('assets').then(a => {
      DR.platform.assets = a;
    });
  });
  await pg.evaluate(() => {
    // every write of an index page takes a moment, so writes of the same page overlap while pictures keep landing
    const db = window.__dbmock;
    const orig = db.doc;
    db.doc = p => {
      const d = orig(p);
      if (String(p).startsWith('imgidx/')) {
        const set = d.set;
        d.set = async x => {
          window.__idxWrites++;
          window.__idxLive = (window.__idxLive || 0) + 1;
          window.__idxMax = Math.max(window.__idxMax || 0, window.__idxLive);
          await new Promise(r => setTimeout(r, 150));
          window.__idxLive--;
          return set.call(d, x);
        };
      }
      return d;
    };
    DR.platform.limits = Object.assign({}, DR.platform.limits, { images: true });
  });
  await pg.click('[data-tab="images"]');
  await pg.waitForSelector('#upl', { state: 'attached' });
  return { pg, errs };
}

async function indexed(pg) {
  // every picture the database's index pages hold
  return pg.evaluate(async () => {
    const q = await DR.platform.shared.collection('imgidx').get();
    return q.docs.flatMap(d => (d.data().rows || []).map(r => r.id));
  });
}

test('sixty pictures sent three at a time all land in the list', async ({ game }) => {
  const { pg, errs } = await setup(game);
  await pg.evaluate(`(${MAKE})(${N},'p')`);
  await pg.waitForFunction(`DR.app.images.length===${N}`, null, { timeout: 60000 });
  await pg.waitForFunction("document.querySelector('#uplStat').textContent===''", null, { timeout: 30000 });
  const ids = await indexed(pg);
  expect(ids.length, 'rows in the database index').toBe(N);
  expect(new Set(ids).size, 'distinct rows').toBe(N);
  const mem = await pg.evaluate(() => DR.app.images.map(x => x.id));
  expect(new Set(mem).size).toBe(N);
  expect([...new Set(mem)].sort()).toEqual([...new Set(ids)].sort());
  const s = await pg.evaluate(() => ({ max: window.__up.max, writes: window.__idxWrites, live: window.__idxMax }));
  const pages = await pg.evaluate(async () => (await DR.platform.shared.collection('imgidx').get()).docs.length);
  expect(pages, 'each of the three lanes fills its own page').toBe(3);
  expect(s.live, 'writes of different pages overlap').toBeGreaterThan(1);
  expect(s.max, 'uploads at the same time').toBeGreaterThan(1);
  expect(s.max).toBeLessThanOrEqual(3);
  expect(s.writes, 'index writes are shared between pictures that land together').toBeLessThan(N);
  console.log('uploads at once:', s.max, '| index writes:', s.writes, 'for', N, 'pictures');
  expect(errs).toEqual([]);
});

test('an upload that is rate limited is retried and nothing is lost', async ({ game }) => {
  const { pg, errs } = await setup(game, 4);
  await pg.evaluate(`(${MAKE})(24,'r')`);
  await pg.waitForFunction('DR.app.images.length===24', null, { timeout: 90000 });
  await pg.waitForFunction("document.querySelector('#uplStat').textContent===''", null, { timeout: 30000 });
  expect((await indexed(pg)).length).toBe(24);
  expect(await pg.evaluate(() => window.__up.calls), 'calls include the retries').toBeGreaterThan(24);
  expect(errs).toEqual([]);
});

test('the same files sent again are skipped', async ({ game }) => {
  const { pg, errs } = await setup(game);
  await pg.evaluate(`(${MAKE})(12,'s')`);
  await pg.waitForFunction('DR.app.images.length===12', null, { timeout: 60000 });
  await pg.waitForFunction("document.querySelector('#uplStat').textContent===''", null, { timeout: 30000 });
  const before = await pg.evaluate(() => window.__up.calls);
  await pg.evaluate(`(${MAKE})(12,'s')`);
  await pg.waitForFunction("document.querySelector('#uplStat').textContent===''", null, { timeout: 30000 });
  await pg.waitForTimeout(500);
  expect(await pg.evaluate(() => DR.app.images.length)).toBe(12);
  expect(await pg.evaluate(() => window.__up.calls), 'no new uploads').toBe(before);
  expect(errs).toEqual([]);
});

test('when the list cannot be saved, those pictures are reported and nothing half-saved stays', async ({ game }) => {
  const { pg, errs } = await setup(game);
  // the database refuses index writes after the first few (storage full)
  await pg.evaluate(() => {
    const db = window.__dbmock;
    const orig = db.doc;
    let writes = 0;
    db.doc = p => {
      const d = orig(p);
      if (String(p).startsWith('imgidx/')) {
        const set = d.set;
        d.set = async x => {
          if (++writes > 3) {
            const e = new Error('full');
            e.code = 'quota_exceeded';
            throw e;
          }
          return set.call(d, x);
        };
      }
      return d;
    };
  });
  await pg.evaluate(`(${MAKE})(30,'q')`);
  await pg.waitForFunction("document.querySelector('#uplStat').textContent===''", null, { timeout: 60000 });
  await pg.waitForTimeout(500);
  const mem = await pg.evaluate(() => DR.app.images.map(x => x.id));
  const ids = await indexed(pg);
  expect(new Set(mem).size, 'no duplicates in memory').toBe(mem.length);
  expect([...mem].sort(), 'what the library shows is exactly what the database holds').toEqual([...ids].sort());
  expect(mem.length, 'some pictures were not saved').toBeLessThan(30);
  expect(errs).toEqual([]);
});

// names made of shadow_{style}_{gender}_... keep their own set (they used to merge into shadow_other)
const NAMES = String.raw`async(names)=>{
  const files=[];
  for(let i=0;i<names.length;i++){
    const cv=document.createElement('canvas');cv.width=cv.height=8;
    const c=cv.getContext('2d');c.fillStyle='hsl('+(i*50)+',70%,50%)';c.fillRect(0,0,8,8);
    const b=await new Promise(r=>cv.toBlob(r,'image/png'));
    files.push(new File([b],names[i],{type:'image/png'}));
  }
  const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));
  const inp=document.querySelector('#upl');inp.files=dt.files;inp.dispatchEvent(new Event('change'));
}`;

test('shadow pictures with a style word keep their own set and gender', async ({ game }) => {
  const { pg, errs } = await setup(game);
  const names = [
    'shadow_cyber_male_neutral.png',
    'shadow_cyber_female_neutral.png',
    'shadow_male_neutral.png',
    'shadow_female_neutral_2.png',
  ];
  await pg.evaluate(`(${NAMES})(${JSON.stringify(names)})`);
  await pg.waitForFunction('DR.app.images.length===4', null, { timeout: 30000 });
  await pg.waitForFunction("document.querySelector('#uplStat').textContent===''", null, { timeout: 30000 });
  const got = await pg.evaluate(() =>
    Object.fromEntries(DR.app.images.map(x => [x.file, { set: x.set, emotion: x.emotion, variant: x.variant }])),
  );
  expect(got['shadow_cyber_male_neutral.png']).toMatchObject({ set: 'shadow_cyber_male', emotion: 'neutral' });
  expect(got['shadow_cyber_female_neutral.png']).toMatchObject({ set: 'shadow_cyber_female', emotion: 'neutral' });
  expect(got['shadow_male_neutral.png']).toMatchObject({ set: 'shadow_male' });
  expect(got['shadow_female_neutral_2.png']).toMatchObject({ set: 'shadow_female', variant: '2' });
  const meta = await pg.evaluate(() => DR.app.setMeta);
  expect(meta.shadow_cyber_male).toMatchObject({ gender: 'male', tier: 'generic' });
  expect(meta.shadow_cyber_female).toMatchObject({ gender: 'female', tier: 'generic' });
  expect(meta.shadow_other, 'nothing is merged into shadow_other').toBeUndefined();
  expect(errs).toEqual([]);
});

// 중복 정리 also finds the same picture stored twice (compressed again, other name), but not a picture where only a
// small area differs (a face with another expression)
const PICS = String.raw`async()=>{
  const draw=(extra)=>{
    const cv=document.createElement('canvas');cv.width=240;cv.height=160;const c=cv.getContext('2d');
    c.fillStyle='#202428';c.fillRect(0,0,240,160);
    const g=c.createLinearGradient(0,0,240,160);g.addColorStop(0,'#335577');g.addColorStop(1,'#aa6644');c.fillStyle=g;c.fillRect(20,20,200,120);
    c.fillStyle='#e8d0a8';c.beginPath();c.arc(120,70,34,0,7);c.fill();
    c.fillStyle='#202428';c.fillRect(100,60,8,4);c.fillRect(132,60,8,4);c.fillRect(108,86,24,3);
    if(extra)extra(c);
    return cv;
  };
  const blob=(cv,t,q)=>new Promise(r=>cv.toBlob(r,t,q));
  const A=draw();
  const files=[
    new File([await blob(A,'image/png')],'bg_alpha_day.png',{type:'image/png'}),
    new File([await blob(A,'image/webp',0.8)],'bg_alpha-copy_day.webp',{type:'image/webp'}),
    new File([await blob(draw(c=>{c.fillStyle='#ffffff';c.fillRect(100,56,16,10);c.fillRect(124,56,16,10)}),'image/png')],'bg_alpha-eyes_day.png',{type:'image/png'}),
    new File([await blob((()=>{const cv=document.createElement('canvas');cv.width=240;cv.height=160;const c=cv.getContext('2d');c.fillStyle='#884422';c.fillRect(0,0,240,160);c.fillStyle='#ffee88';c.fillRect(30,100,180,40);return cv})(),'image/png')],'bg_other_day.png',{type:'image/png'}),
  ];
  const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));
  const inp=document.querySelector('#upl');inp.files=dt.files;inp.dispatchEvent(new Event('change'));
}`;

test('중복 정리 finds a recompressed copy but not a picture with only a small change', async ({ game }) => {
  const { pg, errs } = await setup(game);
  // the file store keeps the pictures so they can be read back
  await pg.evaluate(() => {
    window.__blobs = {};
    const up = DR.platform.assets.upload;
    DR.platform.assets.upload = async (blob, o) => {
      const r = await up(blob, o);
      window.__blobs[r.id] = blob;
      return r;
    };
    const f = window.fetch;
    window.fetch = (u, ...a) =>
      String(u).startsWith('/_blob/') ? Promise.resolve(new Response(window.__blobs[String(u).slice(7)])) : f(u, ...a);
  });
  await pg.evaluate(`(${PICS})()`);
  await pg.waitForFunction('DR.app.images.length===4', null, { timeout: 30000 });
  await pg.waitForFunction("document.querySelector('#uplStat').textContent===''", null, { timeout: 30000 });
  await pg.click('#dedupe');
  await pg.waitForSelector('.review-list', { timeout: 30000 });
  const rows = await pg.$$eval('.review-item', els => els.map(e => e.textContent));
  expect(rows.length, 'only the recompressed copy is offered').toBe(1);
  expect(rows[0]).toContain('alpha-copy');
  expect(rows[0]).toContain('같은 그림');
  expect(rows[0]).not.toContain('eyes');
  await pg.click('#rvNo');
  expect(await pg.evaluate(() => DR.app.images.length), 'cancel keeps everything').toBe(4);
  expect(errs).toEqual([]);
});
