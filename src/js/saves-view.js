/* ============ saves view ============ */
import { host } from './host.js';
import { $, clone, esc, noteIgnored, nowIso, stripMarks, toast, uid } from './util.js';
import {
  dget,
  dset,
  gunzipBytes,
  gzipBytes,
  packTurn,
  platform,
  thaw,
  userCol,
  userDoc,
  z85dec,
  z85enc,
} from './db.js';
import { DB_DOC_CAP, savePageDoc, turnStore } from './turn-store.js';
import { app, APP_VERSION } from './app.js';
import { logErr } from './diag.js';
import { askConfirm, askPrompt, closeSheet, openSheet } from './sheet.js';
import { showTab } from './shell.js';
import { loadSaves, useCapability } from './boot.js';
import { IMGX } from './library.js';
import { imgUrl } from './images.js';
import { startNewLifeForm } from './new-life.js';
import { closeGone, openSave } from './persistence.js';
import { renderTurn } from './log.js';
import { widgetOf } from './widgets.js';

/* ============ story export ============ */
function openExport(id) {
  const meta = app.saves.find(s => s.id === id);
  if (!meta) return;
  openSheet(`<h3>이야기 내보내기</h3><p class="muted sheet-intro">${esc(meta.name)}. 다른 기기나 브라우저에서 읽을 수 있는 파일로 저장해요.</p>
    <div class="field"><label>형식</label><div class="seg" id="exFmt"><button type="button" data-f="html" aria-pressed="true">HTML (이미지 포함)</button><button type="button" data-f="md" aria-pressed="false">Markdown (텍스트만)</button></div></div>
    <div class="field export-field"><label>범위</label><div class="seg" id="exRange"><button type="button" data-r="all" aria-pressed="true">전체 (모든 회차)</button><button type="button" data-r="life" aria-pressed="false">마지막 삶만</button></div></div>
    <label class="row opt export-opt"><input type="checkbox" id="exMine" checked> 내 입력도 포함</label>
    <div class="row actions"><button class="btn primary" id="exGo">내보내기</button><button class="btn ghost" data-close>취소</button><span class="muted count-note" id="exStat"></span></div>`);
  let fmt = 'html',
    range = 'all';
  const root = $('#sheetInner');
  root.querySelectorAll('#exFmt button').forEach(
    b =>
      (b.onclick = () => {
        fmt = b.dataset.f;
        root.querySelectorAll('#exFmt button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      }),
  );
  root.querySelectorAll('#exRange button').forEach(
    b =>
      (b.onclick = () => {
        range = b.dataset.r;
        root.querySelectorAll('#exRange button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      }),
  );
  $('#exGo').onclick = async () => {
    const bt = $('#exGo');
    bt.disabled = true;
    try {
      await exportStory(id, fmt, range, $('#exMine').checked, m => {
        const e = $('#exStat');
        if (e) e.textContent = m;
      });
    } catch (e) {
      toast('내보내기 실패: ' + (e.code || e.message));
    }
    const b2 = $('#exGo');
    if (b2) b2.disabled = false;
  };
}
async function loadAllTurns(id, onStat) {
  return await turnStore.loadAll(id, onStat);
}
function splitLives(list) {
  let life = 1;
  const out = [];
  for (const t of list) {
    if (t.kind === 'system') {
      const m = /^(\d+)번째 삶/.exec(t.text || '');
      if (m) life = +m[1];
    } else if (t.snap && t.snap.lifeNo) life = t.snap.lifeNo;
    out.push([life, t]);
  }
  return out;
}
export let toDataUrl = async function toDataUrl(id) {
  try {
    const b = await (await fetch(imgUrl(id))).blob();
    const bmp = await createImageBitmap(b);
    const k = Math.min(1, 960 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/webp', 0.82);
    return u.startsWith('data:image/webp') ? u : c.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    try {
      const b = await (await fetch(imgUrl(id))).blob();
      return await new Promise(r => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.onerror = () => r('');
        fr.readAsDataURL(b);
      });
    } catch (e2) {
      return '';
    }
  }
};
function mdTurn(t, mine) {
  if (t.kind === 'user') return mine ? `> **나:** ${t.text}\n` : '';
  if (t.kind === 'system') return `*${t.text}*\n`;
  if (t.kind === 'ledger') {
    const o = t.out || {};
    return `### 인생 결산: ${o.score ?? ''}점\n\n> ${o.epitaph || ''}\n\n${o.summary || ''}\n${(o.highlights || []).map(h => '- ' + h).join('\n')}\n`;
  }
  const o = t.out || {};
  let s = '';
  if (o.admin) s += `> **ADMIN:** ${o.admin}\n\n`;
  if (o.narration) s += stripMarks(o.narration).trim() + '\n\n';
  if (o.system && o.system.length) s += o.system.map(x => '`' + x + '`').join(' ') + '\n\n';
  const w = widgetOf(o.widget);
  if (w) s += w.markdown(o.widget);
  return s;
}
// a save as one file: its card, its state and every turn, so it survives a new clone or a new version
export async function exportSaveFile(id) {
  const meta = app.saves.find(x => x.id === id);
  if (!meta) {
    toast('저장을 찾을 수 없어요');
    return;
  }
  const st = $('#dbGauge');
  const say = t => {
    if (st) st.textContent = t;
  };
  try {
    say('저장 파일 준비 중');
    const stDoc = await userDoc(`states/items/${id}`).get();
    const state = stDoc.exists ? thaw(stDoc.data()) : null;
    if (!state) {
      say('');
      toast('상태가 없어요');
      return;
    }
    const all =
      app.currentSave && app.currentSave.id === id ? await turnStore.loadAll(id) : await turnStore.loadAll(id);
    const file = {
      app: 'dice-roguelife',
      format: 1,
      appVersion: 'Dice Roguelife, v' + APP_VERSION, // the export format keeps this exact wording
      exportedAt: nowIso(),
      save: meta,
      state,
      turns: all,
    };
    const raw = await gzipBytes(file);
    if (!raw) {
      say('');
      toast('이 브라우저에선 압축을 쓸 수 없어요');
      return;
    }
    const enc = z85enc(raw);
    const data = JSON.stringify({ app: 'dice-roguelife', format: 3, n: enc.bytes, d: enc.text });
    const fname = `${meta.name}_${new Date().toISOString().slice(0, 10)}.json`.replace(/[\\/:*?"<>|]/g, '_'); // a json envelope around a sealed payload
    const dl = await useCapability('downloads');
    if (!dl) {
      say('');
      toast('이 화면에선 파일 저장을 쓸 수 없어요. 게시된 링크에서 열어 주세요');
      return;
    }
    await dl.save({ filename: fname, data: new Blob([data], { type: 'application/json' }) });
    say('');
    toast(`저장 파일로 내보냈어요 (${Math.round(data.length / 1024)}KB, ${all.length}턴)`, 4000);
  } catch (e) {
    say('');
    if (e && e.code === 'declined') toast('취소했어요');
    else toast('내보내기 실패: ' + (e.code || e.message));
  }
}
export async function importSaveFile(f) {
  let j = null;
  const text = await f.text();
  try {
    j = JSON.parse(text);
  } catch {
    // not JSON: reported as an unknown file below
  }
  if (j && j.format === 3 && j.d) {
    try {
      j = await gunzipBytes(z85dec(j.d, j.n));
    } catch (e) {
      j = null;
    }
  } // a json envelope around a gzip+z85 payload
  if (!j) {
    toast('읽을 수 없는 파일이에요');
    return;
  }
  if (!j || j.app !== 'dice-roguelife' || !j.state || !Array.isArray(j.turns)) {
    toast('이 앱의 저장 파일이 아니에요');
    return;
  }
  const st = $('#dbGauge');
  const say = t => {
    if (st) st.textContent = t;
  };
  const id = uid();
  const meta = Object.assign({}, j.save || {}, {
    id,
    name: `${(j.save && j.save.name) || '가져온 삶'} (가져옴)`,
    updatedAt: nowIso(),
    parent: null,
    store: 2,
  });
  try {
    say('턴 저장 중');
    const rows = [];
    for (const t of j.turns) rows.push(await packTurn(t));
    const pages = turnStore.paginate(rows);
    for (let k = 0; k < pages.length; k++) {
      await savePageDoc(id, k).set(pages[k]);
      say(`턴 저장 중 ${k + 1}/${pages.length}`);
    }
    meta.pages = pages.length;
    meta.turns = j.turns.length;
    await userDoc(`states/items/${id}`).set(j.state);
    await userDoc(`saves/items/${id}`).set(meta);
    await loadSaves();
    say('');
    toast(`가져왔어요: ${meta.name} (${j.turns.length}턴)`, 4000);
    renderSaves();
  } catch (e) {
    say('');
    toast('가져오기 실패: ' + (e.code || e.message));
    logErr('import', e);
  }
}
export async function exportStory(id, fmt, range, mine, stat) {
  const meta = app.saves.find(s => s.id === id);
  const st = app.currentSave && app.currentSave.id === id ? app.state : await dget(`states/items/${id}`);
  stat('기록 불러오는 중');
  if (!(app.currentSave && app.currentSave.id === id)) {
    try {
      await turnStore.ensure(id, stat);
    } catch (e) {
      noteIgnored('export: load every page', e);
    }
  }
  let list = splitLives(await loadAllTurns(id, stat));
  if (range === 'life' && list.length) {
    const ln = Math.max(...list.map(([l]) => l));
    list = list.filter(([l]) => l === ln);
  }
  const lives = [...new Set(list.map(([l]) => l))];
  const title = meta.name;
  const date = new Date().toLocaleDateString('ko-KR');
  let data, fname;
  if (fmt === 'md') {
    let md = `# ${title}\n\n${st ? st.life.name + ', ' : ''}${lives.length}개의 삶, ${date}\n\n`;
    for (const ln of lives) {
      md += `\n## ${ln}번째 삶\n\n`;
      for (const [l, t] of list) if (l === ln) md += mdTurn(t, mine) + '\n';
    }
    md += `\n---\n주사위가 정한 인생에서 내보냄\n`;
    data = md;
    fname = `${title}.md`;
  } else {
    const prevD = app.settings.discreet;
    app.settings.discreet = false;
    let body = '';
    try {
      for (const ln of lives) {
        body += `<h2 class="xlife">${ln}번째 삶</h2>`;
        for (const [l, t] of list) if (l === ln && (mine || t.kind !== 'user')) body += renderTurn(t, false);
      }
    } finally {
      app.settings.discreet = prevD;
    }
    // every picture the turns actually show (scene, everyone on screen, ADMIN's face) goes into the file
    const at = host()
      .assetUrl('')
      .replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); // the file store's URL prefix, as a pattern
    const ids = new Set([...body.matchAll(new RegExp(at + `([^'")]+)`, 'g'))].map(m => m[1]));
    const urls = {};
    let n = 0;
    for (const i of ids) {
      stat(`이미지 ${++n}/${ids.size}`);
      urls[i] = await toDataUrl(i);
    }
    body = body
      .replace(new RegExp(`style="background-image:url\\('${at}([^']+)'\\)"`, 'g'), 'data-bg="$1"')
      .replace(new RegExp(`src="${at}([^"]+)"`, 'g'), 'data-src="$1"');
    const imgScript = `<script>const I=${JSON.stringify(urls)};document.querySelectorAll('[data-bg]').forEach(e=>{const u=I[e.dataset.bg];if(u)e.style.backgroundImage="url('"+u+"')"});document.querySelectorAll('[data-src]').forEach(e=>{const u=I[e.dataset.src];if(u)e.src=u})<\/script>`;
    const css = document.querySelector('style').textContent;
    data = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}
html,body{height:auto;overflow:auto}main.x{max-width:760px;margin:0 auto;padding:24px 16px 60px}.tools,.choices,.qa button,.fu{display:none!important}
.xhead h1{font-family:var(--display);font-weight:400;font-size:30px;margin:0}.xhead p{color:var(--sub);margin:4px 0 20px}.xlife{font-family:var(--display);font-weight:400;font-size:22px;margin:32px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.turn{margin-bottom:14px}.xfoot{margin-top:40px;font-size:12px}</style></head><body><main class="x"><div class="xhead"><h1>${esc(title)}</h1><p>${st ? esc(st.life.name) + ', ' : ''}${lives.length}개의 삶, ${date}</p></div>${body}<p class="muted xfoot">주사위가 정한 인생에서 내보냄</p></main>${imgScript}</body></html>`;
    fname = `${title}.html`;
  }
  stat('저장 준비');
  const dl = await useCapability('downloads');
  if (!dl) {
    stat('');
    if (fmt === 'md') {
      try {
        await navigator.clipboard.writeText(data);
        toast('파일 저장을 못 써서 클립보드에 복사했어요');
      } catch (e) {
        toast('이 화면에선 파일 저장을 쓸 수 없어요');
      }
    } else toast('이 화면에선 파일 저장을 쓸 수 없어요');
    return;
  }
  try {
    await dl.save({ filename: fname.replace(/[\\/:*?"<>|]/g, '_'), data: new Blob([data]) });
    stat('');
    toast('저장했어요');
    closeSheet();
  } catch (e) {
    stat('');
    if (e && e.code === 'declined') toast('저장을 취소했어요');
    else toast('저장 실패: ' + (e.code || e.message));
  }
}

// Changes only the name, on the freshest card in the database (the list's copy may be older than what another device
// wrote), and bumps sv so a device that is playing this save reloads instead of writing its old name back.
async function renameSave(id, name) {
  const d = await userDoc(`saves/items/${id}`).get();
  if (!d.exists) return false;
  const card = thaw(d.data());
  card.name = name;
  card.sv = (card.sv || 0) + 1;
  await dset(`saves/items/${id}`, card);
  const i = app.saves.findIndex(x => x.id === id);
  if (i >= 0) app.saves[i] = clone(card);
  if (app.currentSave && app.currentSave.id === id) {
    app.currentSave.name = name;
    app.currentSave.sv = card.sv;
  }
  return true;
}
export function renderSaves() {
  const box = $('#savesBox');
  box.innerHTML = `<div class="row view-head"><h3 class="view-title">저장된 삶</h3><div class="row saves-tools"><label class="btn ghost file-btn" title="다른 복제본에서 내보낸 저장 파일(.json)을 이 앱에 넣어요">저장 파일 가져오기<input type="file" id="saveImport" accept=".json,.txt,application/json,text/plain" hidden></label><button class="btn primary" id="newGame">새 게임</button></div></div>
   <div id="dbGauge" class="muted db-gauge">저장 공간 계산 중...</div>
   <div class="list">${
     app.saves
       .map(
         s => `<div class="item"><div class="t">${esc(s.name)}${app.currentSave && app.currentSave.id === s.id ? ' <span class="muted playing-tag">(플레이 중)</span>' : ''}</div>
     <div class="m">${s.lifeNo}번째 삶, ${s.lifeTurns != null ? s.lifeTurns : s.turns}턴, 문서 약 ${docsOf(s)}개, ${new Date(s.updatedAt).toLocaleString('ko-KR')}${s.parent ? `<br>분기: ${esc(s.parent.name)}의 ${s.parent.turnNo != null ? s.parent.turnNo : s.parent.turn}턴에서` : ''}</div>
     <div class="row save-actions"><button class="btn" data-open="${s.id}">이어하기</button><button class="btn ghost" data-rename="${s.id}">이름 변경</button><button class="btn ghost" data-export="${s.id}">이야기 내보내기</button><button class="btn ghost" data-savefile="${s.id}" title="이 저장을 파일로. 다른 복제본이나 새 버전에서 가져올 수 있어요">저장 파일</button><button class="btn danger" data-del="${s.id}">삭제</button></div></div>`,
       )
       .join('') || '<p class="muted">아직 저장된 삶이 없어요. 새 게임으로 첫 운명을 굴려 보세요.</p>'
   }</div>`;
  $('#newGame').onclick = () => {
    showTab('play');
    app.state = null;
    app.turns = [];
    startNewLifeForm();
  };
  box.querySelectorAll('[data-savefile]').forEach(b => (b.onclick = () => exportSaveFile(b.dataset.savefile)));
  const si = $('#saveImport');
  if (si)
    si.onchange = e => {
      const f = e.target.files[0];
      if (f) importSaveFile(f);
      e.target.value = '';
    };
  dbUsage()
    .then(({ used, cap }) => {
      const g = $('#dbGauge');
      if (!g) return;
      const r = used / cap,
        col = r >= 0.95 ? 'var(--danger)' : r >= 0.8 ? 'var(--gold)' : 'var(--sys)';
      g.innerHTML = `<div class="row gauge-head"><span>저장 공간 (문서 수)</span><span><b style="color:${col}">약 ${used.toLocaleString()}</b> / ${cap.toLocaleString()}</span></div><div class="gauge-bar"><i style="display:block;height:100%;width:${Math.min(100, r * 100).toFixed(1)}%;background:${col}"></i></div>${r >= 0.8 ? `<p class="gauge-msg" style="color:${col}">공간이 ${r >= 0.95 ? '거의 없어요' : '얼마 안 남았어요'}. 오래된 저장이나 분기를 내보내기 한 뒤 삭제하면 늘어나요.</p>` : ''}`;
    })
    .catch(e => noteIgnored('saves-view: dbUsage.then var', e));
  box.querySelectorAll('[data-open]').forEach(b => (b.onclick = () => openSave(b.dataset.open)));
  box.querySelectorAll('[data-export]').forEach(b => (b.onclick = () => openExport(b.dataset.export)));
  box.querySelectorAll('[data-rename]').forEach(
    b =>
      (b.onclick = async () => {
        const s = app.saves.find(x => x.id === b.dataset.rename);
        const n = await askPrompt('새 이름', s.name);
        if (!n) return;
        await renameSave(s.id, n.slice(0, 40));
        renderSaves();
      }),
  );
  box.querySelectorAll('[data-del]').forEach(
    b =>
      (b.onclick = async () => {
        const s = app.saves.find(x => x.id === b.dataset.del);
        if (!(await askConfirm(`'${s.name}'을(를) 삭제할까요? 되돌릴 수 없습니다.`))) return;
        closeGone(s.id); // close it first, so nothing still running writes it back while the documents go
        await turnStore.deleteAll(s.id);
        await userDoc(`states/items/${s.id}`)
          .delete()
          .catch(e => noteIgnored('saves-view: userDoc.delete states/items', e));
        await userDoc(`saves/items/${s.id}`)
          .delete()
          .catch(e => noteIgnored('saves-view: userDoc.delete saves/items', e));
        renderSaves(); // closeGone above already dropped the card, the last-save setting and the open game
      }),
  );
}

let hallCount = null;

function docsOf(s) {
  return (s.store === 2 ? s.pages || Math.ceil((s.turns || 0) / 20) : s.turns || 0) + 2;
}

async function dbUsage() {
  if (hallCount == null) {
    hallCount = 0;
    try {
      hallCount += (await platform.shared.collection('hall').limit(1000).get()).docs.length;
    } catch (e) {
      noteIgnored('storage usage: shared hall count', e);
    }
    try {
      hallCount += (await userCol('hall/items').limit(1000).get()).docs.length;
    } catch (e) {
      noteIgnored('storage usage: private hall count', e);
    }
  }
  const used =
    new Set(IMGX.map.values()).size +
    Object.keys(app.setMeta).length +
    app.saves.reduce((a, s) => a + docsOf(s), 0) +
    hallCount +
    8;
  return { used, cap: DB_DOC_CAP };
}

// the functions above that tests may replace (window.DR.mock): each setter swaps the binding every caller uses
export const mocks = {
  toDataUrl: f => (toDataUrl = f),
};
