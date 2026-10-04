/* ============ hall of lives (shared) ============ */
import { $, esc, noteIgnored, nowIso, toast } from './util.js';
import { platform, userCol } from './db.js';
import { turnStore } from './turn-store.js';
import { app } from './app.js';
import { saveSettings } from './settings.js';
import { askConfirm, askPrompt, openSheet } from './sheet.js';
import { renderLog } from './log.js';

export function entryFrom(o, t) {
  const life = t && t.snap ? t.snap.life : app.state.life;
  const st = t && t.snap ? t.snap : app.state;
  return {
    uid: platform.userId,
    nick: (app.settings.nick || '').slice(0, 20),
    charName: life.name,
    world: life.world.name,
    origin: life.origin,
    tier: life.originTier,
    talent: life.talent.name,
    lifeNo: st.lifeNo,
    age: st.stats.age,
    score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))),
    epitaph: String(o.epitaph || '').slice(0, 120),
    summary: String(o.summary || '').slice(0, 400),
    highlights: (o.highlights || []).slice(0, 4).map(x => String(x).slice(0, 80)),
    inherit: o.inherit && o.inherit.name ? `${o.inherit.name} (${o.inherit.grade})` : '',
    createdAt: nowIso(),
  };
}
export async function shareToHall(i) {
  const t = app.turns.find(x => x.i === i);
  if (!t || !t.out || t.out.hallId) return;
  if (!app.settings.nick) {
    const n = await askPrompt('전당에 표시할 이름', app.state.life.name);
    if (n === null) return;
    app.settings.nick = n.trim().slice(0, 20) || app.state.life.name;
    await saveSettings();
  }
  try {
    const e = entryFrom(t.out, t);
    e.public = true;
    const ref = await platform.shared.collection('hall').add(e);
    t.out.hallId = ref.id;
    await turnStore.update(t);
    toast('전당에 올렸어요');
    renderLog();
  } catch (e) {
    toast(
      e.code === 'permission_denied' || e.code === 'not_granted'
        ? '올릴 권한이 없어요'
        : '실패: ' + (e.message || e.code),
    );
  }
}
async function setHallVisibility(r, pub) {
  const from = r.public ? 'hall' : `${platform.userPath}/hall/items`,
    to = pub ? 'hall' : `${platform.userPath}/hall/items`;
  if (from === to) return;
  const data = Object.assign({}, r, { public: pub });
  delete data.id;
  delete data._private;
  const dbFor = path => (path.startsWith('hall') ? platform.shared : platform.db);
  try {
    await dbFor(to).doc(`${to}/${r.id}`).set(data);
    await dbFor(from).doc(`${from}/${r.id}`).delete();
    toast(pub ? '공개로 바꿨어요' : '나만 보기로 바꿨어요');
    renderHall();
  } catch (e) {
    toast('바꿀 수 없어요');
  }
}
export async function renderHall() {
  const box = $('#hallBox');
  box.innerHTML = '<p class="muted">불러오는 중...</p>';
  let rows = [];
  try {
    const q = await platform.shared.collection('hall').orderBy('score', 'desc').limit(100).get();
    rows = q.docs.map(d => Object.assign({ id: d.id }, d.data()));
  } catch (e) {
    box.innerHTML = '<p class="muted">전당을 불러올 수 없어요.</p>';
    return;
  }
  try {
    const q = await userCol('hall/items').limit(100).get();
    rows = rows.concat(q.docs.map(d => Object.assign({ id: d.id, _private: true, public: false }, d.data())));
  } catch (e) {
    noteIgnored('hall: private entries', e);
  }
  rows.sort((a, b) => b.score - a.score);
  box.innerHTML = `<div class="row view-head hall-head"><h3 class="view-title">인생 전당</h3><button class="btn ghost hall-nick" id="nickBtn">${esc(app.settings.nick || '표시 이름')}</button></div>
   <p class="muted hall-intro">결산에서 올린 삶들이에요. 탭하면 공유 카드가 열려요.</p>
   <div class="list">${
     rows
       .map(
         (
           r,
           idx,
         ) => `<div class="item hall-entry" data-row="${r.id}"><div class="row hall-entry-head"><div class="t">${idx + 1}. ${esc(r.charName)} <span class="tier ${r.tier}">${r.tier}</span> <span class="muted hall-by">${esc(r.nick || '')}${r._private ? ' 🔒' : ''}</span></div><b class="hall-score">${r.score}</b></div>
     <div class="m">${esc(r.world)}, ${esc(r.origin)}, ${r.lifeNo}회차, ${r.age}세</div><div class="hall-epitaph">${esc(r.epitaph)}</div>
     ${r.uid === platform.userId ? `<div class="row hall-tools"><button class="x hall-tool" data-vis="${r.id}">${r._private ? '공개로' : '나만 보기'}</button><button class="x hall-tool" data-delh="${r.id}">내리기</button></div>` : ''}</div>`,
       )
       .join('') || '<p class="muted">아직 아무도 없어요.</p>'
   }</div>`;
  $('#nickBtn').onclick = async () => {
    const n = await askPrompt('전당에 표시할 이름', app.settings.nick || '');
    if (n === null) return;
    app.settings.nick = n.trim().slice(0, 20);
    await saveSettings();
    renderHall();
  };
  box.querySelectorAll('[data-row]').forEach(
    el =>
      (el.onclick = e => {
        if (e.target.dataset.delh || e.target.dataset.vis) return;
        openShareCard(rows.find(r => r.id === el.dataset.row));
      }),
  );
  box.querySelectorAll('[data-vis]').forEach(
    b =>
      (b.onclick = () => {
        const r = rows.find(x => x.id === b.dataset.vis);
        setHallVisibility(r, !!r._private);
      }),
  );
  box.querySelectorAll('[data-delh]').forEach(
    b =>
      (b.onclick = async () => {
        if (!(await askConfirm('전당에서 내릴까요?'))) return;
        const r = rows.find(x => x.id === b.dataset.delh);
        try {
          await (r._private ? platform.db : platform.shared)
            .doc(`${r._private ? platform.userPath + '/hall/items' : 'hall'}/${r.id}`)
            .delete();
          renderHall();
        } catch (e) {
          toast('내릴 수 없어요');
        }
      }),
  );
}
export function openShareCard(r) {
  if (!r) return;
  const text = `[주사위가 정한 인생] ${r.charName}의 ${r.lifeNo}번째 삶 ${r.score}점\n${r.world} / ${r.origin}(${r.tier}) / ${r.age}세\n"${r.epitaph}"${r.highlights && r.highlights.length ? '\n- ' + r.highlights.join('\n- ') : ''}`;
  openSheet(
    `<div class="sharecard tier-${r.tier}"><div class="sc-top"><span>주사위가 정한 인생</span><span>${r.lifeNo}번째 삶</span></div>
    <div class="sc-name">${esc(r.charName)} <span class="tier ${r.tier}">${r.tier}</span></div>
    <div class="sc-meta">${esc(r.world)}, ${esc(r.origin)}, ${r.age}세${r.talent ? ', 재능 ' + esc(r.talent) : ''}</div>
    <div class="sc-score"><b>${r.score}</b><small>점</small></div>
    <p class="sc-epi">${esc(r.epitaph)}</p>
    ${(r.highlights || []).map(h => `<div class="sc-h">${esc(h)}</div>`).join('')}
    ${r.inherit ? `<div class="sc-inh">계승: ${esc(r.inherit)}</div>` : ''}
    <div class="sc-foot">${esc(r.nick || '')}${r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleDateString('ko-KR') : ''}</div></div>
   <div class="row card-actions"><button class="btn" id="copyCard">텍스트 복사</button><button class="btn ghost" data-close>닫기</button></div>`.replace(
      ' · ',
      ', ',
    ),
  );
  $('#copyCard').onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('복사됨');
    } catch (e) {
      toast('복사할 수 없어요');
    }
  };
}
