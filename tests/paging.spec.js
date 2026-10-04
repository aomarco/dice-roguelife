// turns stored in pages: paging, a rewrite at a page boundary, fork, trim and load earlier, reopen, a conflict, a full database, state recovery, legacy migration, export and delete
import { test, expect } from './support/test.js';
import { MOCK_BASE, check, same } from './support/harness.js';

const MOCK =
  MOCK_BASE +
  String.raw`
window.__k=0;window.__quota=false;
const baseDoc=window.__dbmock.doc;
window.__dbmock.doc=(p)=>{const r=baseDoc(p);const set=r.set;r.set=async d=>{if(window.__quota&&!__store.has(p))throw Object.assign(new Error('quota'),{code:'quota_exceeded'});return set(d)};return r};
const baseCol=window.__dbmock.collection;
window.__dbmock.collection=(c)=>{const q=baseCol(c);const wrap=q=>new Proxy(q,{get:(t,k)=>k==='doc'?(id=>window.__dbmock.doc(c+'/'+id)):(typeof t[k]==='function'?(...a)=>{const r=t[k](...a);return (r&&r.get&&k!=='get')?wrap(r):r}:t[k])});return wrap(q)};
window.claude={use:async(n)=>{if(n==='db')return window.__dbmock;if(n==='user')return{id:async()=>'u',isOwner:async()=>true,can:async()=>true};
 if(n==='downloads')return{save:async(r)=>{window.__saved=await r.data.text();return{status:'saved'}}};
 if(n==='sample'){const f=async()=>({});f.limits=async()=>({maxPromptBytes:2e5});f.json=async(p)=>{if(p.startsWith('다음은 텍스트 게임 플레이 기록')||p.startsWith('다음 요약들을'))return{summary:'요약본'};return{narration:'턴 '+(++window.__k)+' '+'가나다라'.repeat(40),choices:['a'],stat_changes:{},memory:{lore:[{key:'이름'+window.__k,text:'설정'}]}}};return f}return null}};
`;

// Python's list(range(a, b)) / list(range(n))
const range = (a, b) => (b === undefined ? range(0, a) : Array.from({ length: Math.max(b - a, 0) }, (_, i) => a + i));

test('paging', async ({ game }) => {
  const { pg, errs } = await game(MOCK, { size: [1280, 720] });
  await pg.waitForTimeout(700);
  await pg.evaluate('DR.turnStore.pageMax=6000');
  await pg.fill('#nm', '페이지');
  await pg.evaluate("document.querySelector('#rollBtn').click()");
  await pg.waitForTimeout(1600);
  await pg.click('#acceptBtn');
  await pg.waitForTimeout(400);
  const E = js => pg.evaluate(js);
  const rowsJS =
    "(()=>{const ks=[...__store.keys()].filter(k=>k.includes('/saves/items/'+DR.app.currentSave.id+'/pages/')).sort();const rows=ks.flatMap(k=>__store.get(k).rows.map(r=>r.i));return JSON.stringify({pages:ks.length,rows})})()";
  async function idle() {
    for (let i = 0; i < 100; i++) {
      if (await E('DR.isIdle()')) return;
      await pg.waitForTimeout(30);
    }
  }
  async function send(t) {
    await idle();
    await pg.fill('#input', t);
    await pg.press('#input', 'Enter');
    await pg.waitForTimeout(40);
    await idle();
  }
  function contiguous(rows) {
    return same(rows, range(rows.length));
  }
  // 1) play and check paging
  for (let i = 0; i < 20; i++) await send('걷는다 ' + String(i));
  let r = JSON.parse(await E(rowsJS));
  let nx = await E('DR.app.state.next');
  console.log('1 pages:', r.pages, 'rows contiguous:', contiguous(r.rows), 'n:', r.rows.length, 'app.state.next', nx);
  check(
    errs,
    '1 several pages holding rows 0..next-1 in order',
    r.pages > 1 && contiguous(r.rows) && r.rows.length === nx,
  );
  // 2) reroll exactly at a page boundary
  let hit = false;
  let before;
  await E(
    "(()=>{const orig=DR.turnStore.append.bind(DR.turnStore);DR.turnStore.append=async function(t){if(window.__forceRoll&&t.kind==='ai'){this.tail.bytes=this.pageMax;window.__forceRoll=false}return orig(t)}})()",
  );
  for (let i = 0; i < 3; i++) {
    await E('window.__forceRoll=true');
    await send('더 ' + String(i));
    if (await E("DR.turnStore.tail.rows.length===1&&DR.app.turns[DR.app.turns.length-1].kind==='ai'")) {
      hit = true;
      before = JSON.parse(await E(rowsJS));
      await E('DR.reroll()');
      await pg.waitForTimeout(400);
      const after = JSON.parse(await E(rowsJS));
      const lk = await E('DR.app.turns[DR.app.turns.length-1].kind');
      console.log(
        '2 boundary reroll: pages before',
        before.pages,
        'after',
        after.pages,
        'contiguous',
        contiguous(after.rows),
        'last turn ai',
        lk,
        'len equal',
        after.rows.length === before.rows.length,
      );
      check(
        errs,
        '2 a rewrite at a page boundary replaces the reply: same rows, still contiguous, no page left behind',
        contiguous(after.rows) &&
          lk === 'ai' &&
          after.rows.length === before.rows.length &&
          after.pages <= before.pages,
      );
      break;
    }
  }
  console.log('   boundary hit:', hit);
  check(errs, '2 the page boundary was reached', hit);
  // 3) fork mid-page
  const mid = await E(
    "(()=>{const t=DR.app.turns.filter(x=>x.kind==='ai'&&x.snap);return t[Math.floor(t.length/2)].i})()",
  );
  await E(`(async()=>{DR.askConfirm=async()=>true;await DR.fork(${mid})})()`);
  await pg.waitForTimeout(800);
  const fr = JSON.parse(await E(rowsJS));
  let nt = await E('DR.app.turns.length');
  nx = await E('DR.app.state.next');
  console.log(
    '3 fork at',
    mid,
    'rows end at',
    fr.rows.at(-1),
    'contiguous',
    contiguous(fr.rows),
    'app.turns loaded',
    nt,
    'app.state.next',
    nx,
  );
  check(
    errs,
    '3 a fork keeps rows 0..mid and carries on from mid+1',
    fr.rows.at(-1) === mid && contiguous(fr.rows) && nt === mid + 1 && nx === mid + 1,
  );
  await send('분기 후 행동');
  const fr2 = JSON.parse(await E(rowsJS));
  console.log('   after fork play: contiguous', contiguous(fr2.rows), 'last', fr2.rows.at(-1));
  check(errs, '3 play after the fork appends right after it', contiguous(fr2.rows) && fr2.rows.at(-1) === mid + 2);
  // 4) long play, trim, load earlier
  for (let i = 0; i < 90; i++) await send('긴 ' + String(i));
  const n1 = await E('DR.app.turns.length');
  const first = await E('DR.app.turns[0].i');
  await E('DR.loadEarlier()');
  await pg.waitForTimeout(500);
  let arr = JSON.parse(await E('JSON.stringify(DR.app.turns.map(t=>t.i))'));
  console.log(
    '4 trimmed to',
    n1,
    'first',
    first,
    'after loadEarlier first',
    arr[0],
    'contiguous in memory',
    same(arr, range(arr[0], arr[0] + arr.length)),
  );
  check(
    errs,
    '4 a long game keeps only the recent turns in memory and loads earlier ones in order',
    first > 0 && arr[0] < first && same(arr, range(arr[0], arr[0] + arr.length)),
  );
  // 5) reload save from db
  await E('DR.openSave(DR.app.currentSave.id)');
  await pg.waitForTimeout(500);
  arr = JSON.parse(await E('JSON.stringify(DR.app.turns.map(t=>t.i))'));
  nx = await E('DR.app.state.next');
  console.log(
    '5 reopen: last',
    arr.at(-1),
    '== app.state.next-1',
    arr.at(-1) === nx - 1,
    'contiguous',
    same(arr, range(arr[0], arr[0] + arr.length)),
  );
  check(
    errs,
    '5 reopening loads up to next-1, in order',
    arr.at(-1) === nx - 1 && same(arr, range(arr[0], arr[0] + arr.length)),
  );
  // 6) conflict from another device
  await E(
    "(()=>{const k=[...__store.keys()].filter(k=>k.includes('/saves/items/'+DR.app.currentSave.id+'/pages/')).sort().pop();const d=__store.get(k);d.v+=5;__store.set(k,d)})()",
  );
  before = await E('DR.app.state.next');
  await send('충돌');
  await pg.waitForTimeout(600);
  r = JSON.parse(await E(rowsJS));
  nx = await E('DR.app.state.next');
  console.log('6 conflict: state.next before', before, 'after', nx, 'contiguous', contiguous(r.rows));
  check(
    errs,
    '6 a send that meets a newer copy is not written over it: the save reloads, rows stay contiguous',
    nx === before && contiguous(r.rows),
  );
  await send('충돌 후 정상');
  r = JSON.parse(await E(rowsJS));
  console.log('   after reload play contiguous', contiguous(r.rows));
  check(errs, '6 play after the reload stays contiguous', contiguous(r.rows) && r.rows.length > before);
  // 7) quota on page rollover
  await E('window.__quota=true');
  let got = false;
  for (let i = 0; i < 30; i++) {
    before = await E('DR.app.state.next');
    await send('꽉 ' + String(i));
    await pg.waitForTimeout(100);
    if (
      await E(
        "!!document.querySelector('#sheetInner')&&document.querySelector('#sheetInner').innerText.includes('가득 찼어요')",
      )
    ) {
      got = true;
      nx = await E('DR.app.state.next');
      const rc = contiguous(JSON.parse(await E(rowsJS)).rows);
      console.log(
        '7 quota dialog shown; state.next unchanged:',
        [before, before + 1].includes(nx),
        'rows contiguous',
        rc,
      );
      check(
        errs,
        '7 a full database stops at most the line itself, rows stay contiguous',
        [before, before + 1].includes(nx) && rc,
      );
      break;
    }
  }
  console.log('   quota hit:', got);
  await E('window.__quota=false;DR.closeSheet()');
  check(errs, '7 the full-database dialog was shown', got);
  // 8) state behind turns -> recovery
  await E(
    "(async()=>{const st=__store.get(DR.platform.userPath+'/states/items/'+DR.app.currentSave.id);st.next=st.next-2;__store.set(DR.platform.userPath+'/states/items/'+DR.app.currentSave.id,st);await DR.openSave(DR.app.currentSave.id)})()",
  );
  await pg.waitForTimeout(600);
  arr = JSON.parse(await E('JSON.stringify(DR.app.turns.map(t=>t.i))'));
  nx = await E('DR.app.state.next');
  console.log('8 state recovered: state.next', nx, 'last row', arr.at(-1));
  check(errs, '8 a state behind its turns is brought up to the last row', nx === arr.at(-1) + 1);
  // 9) legacy migration (simulate old format save)
  await E(`(async()=>{const id='legacy1';const meta={id,name:'옛 저장',createdAt:DR.nowIso(),updatedAt:DR.nowIso(),lifeNo:1,turns:6};
      const st=DR.clone(DR.app.state);st.next=6;__store.set(DR.platform.userPath+'/states/items/'+id,st);__store.set(DR.platform.userPath+'/saves/items/'+id,meta);DR.app.saves.push(meta);
      for(let i=0;i<6;i++){const t=i%2?{i,kind:'ai',out:{narration:'옛 '+i},snap:DR.clone(DR.app.state)}:{i,kind:'user',text:'옛 입력 '+i};__store.set(DR.platform.userPath+'/saves/items/'+id+'/turns/'+DR.pad(i),await DR.packTurn(t))}
      await DR.openSave(id);return id})()`);
  await pg.waitForTimeout(600);
  let left = await E("[...__store.keys()].filter(k=>k.includes('/saves/items/legacy1/turns/')).length");
  const pg2 = JSON.parse(await E(rowsJS));
  nt = await E('DR.app.turns.length');
  const flag = await E("DR.app.saves.find(s=>s.id==='legacy1').store");
  console.log('9 migration: legacy left', left, 'page rows', pg2.rows, 'app.turns in memory', nt, 'store flag', flag);
  check(
    errs,
    '9 an old save moves to pages: no turn docs left, rows 0..5, store 2',
    left === 0 && same(pg2.rows, range(6)) && nt === 6 && flag === 2,
  );
  // 10) export all
  await E("DR.exportStory(DR.app.currentSave.id,'md','all',true,()=>{})");
  await pg.waitForTimeout(600);
  const md = await E('window.__saved');
  console.log(
    '10 export md has all legacy turns:',
    [1, 3, 5].every(i => md.includes('옛 ' + String(i))),
  );
  check(
    errs,
    '10 the export holds every migrated reply',
    [1, 3, 5].every(i => (md || '').includes('옛 ' + String(i))),
  );
  // 11) delete save removes pages
  await E(
    "(async()=>{DR.askConfirm=async()=>true;DR.showTab('saves');DR.renderSaves();document.querySelector('[data-del=\"legacy1\"]').click()})()",
  );
  await pg.waitForTimeout(800);
  left = await E("[...__store.keys()].filter(k=>k.includes('/saves/items/legacy1/')).length");
  console.log('11 delete: pages left', left);
  check(errs, '11 deleting a save removes its pages', left === 0);
  console.log('gauge text:', await E("(document.querySelector('#dbGauge')||{}).innerText||''"));
  expect(errs).toEqual([]);
});
