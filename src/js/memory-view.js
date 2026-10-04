/* ============ memory view ============ */
import { $, esc, toast } from './util.js';
import { app, isIdle } from './app.js';
import { renamePerson } from './people.js';
import { askConfirm } from './sheet.js';
import { charSets } from './images.js';
import { persist } from './persistence.js';
import { seenSpan } from './reroll.js';

export function renderMemory() {
  const box = $('#memBox');
  if (!app.state) {
    box.innerHTML = `<h3 class="view-title mem-empty-title">기억</h3><p class="muted mem-empty">아직 진행 중인 게임이 없어요. 새 게임을 시작하면 이 저장의 유저 노트, 요약, 설정집, 관계, 캐스팅이 여기에 쌓여요.<br>앱 설정은 위쪽 ⚙ 버튼에 있어요.</p>`;
    return;
  }
  box.innerHTML = `<h3 class="view-title">기억</h3><p class="muted mem-intro">이 저장 슬롯에만 적용됩니다. 다른 저장이나 다른 대화와 섞이지 않아요.</p>
   <div class="field"><label>플레이어 설정 (이번 삶 동안 고정, 다음 삶의 새 게임 화면에서 바꿀 수 있어요)</label><p class="lore mem-profile">${app.state.life.profile ? esc(app.state.life.profile) : '<span class="muted">없음</span>'}</p></div>
   <div class="field"><label for="notes">유저 노트: 매 턴 Claude에게 전달돼요</label><textarea id="notes" rows="5" maxlength="1200" placeholder="예: ADMIN은 더 냉소적으로. 전투 묘사는 짧게. 이 세계엔 마법이 없다. 소꿉친구 한서윤이 옆집에 산다.">${esc(app.state.userNotes)}</textarea>
    <div class="row"><button class="btn" id="saveNotes">노트 저장</button><span class="muted count-note" id="notesCount">${app.state.userNotes.length}/1200</span></div></div>
   <div class="sec"><h4>현재 상황</h4><p class="lore mem-state">${app.state.stateNote ? esc(app.state.stateNote) : '<span class="muted">없음</span>'}</p></div>
   <div class="sec"><h4>지난 이야기 요약 (${app.state.summaries.length})</h4><p class="muted mem-hint">장기 기억이에요. 틀린 사실이 굳으면 여기서 직접 고쳐요. 매 턴 Claude에게 전달돼요.</p>${app.state.summaries.map((x, i) => `<div class="lore"><b>${x.era ? '시대' : x.life + '회차'}</b><textarea data-esum="${i}" rows="3" maxlength="1600" class="mem-edit">${esc(x.text)}</textarea><button class="x" data-dsum="${i}" aria-label="삭제">✕</button></div>`).join('') || '<p class="muted mem-note">창에서 밀려난 턴이 22개 넘게 쌓이면 자동으로 요약돼요.</p>'}</div>
   <div class="sec"><h4>설정집 (${Object.keys(app.state.lore).length})</h4><p class="muted mem-hint">장기 기억이에요. 최근 대화에 이름이 나올 때만 Claude에게 전달돼요. 틀린 설정은 여기서 고치거나 지워요.</p>
    ${
      Object.entries(app.state.lore)
        .map(
          ([k, v]) =>
            `<div class="lore"><b>${esc(k)}</b><input data-elore="${esc(k)}" value="${esc(v)}" maxlength="300" class="mem-edit"><button class="x" data-dlore="${esc(k)}" aria-label="삭제">✕</button></div>`,
        )
        .join('') || '<p class="muted empty">없음</p>'
    }
    <div class="row mem-add"><input id="loreK" placeholder="이름" class="mem-add-input mem-add-key"><input id="loreV" placeholder="설명" class="mem-add-input grow"><button class="btn" id="addLore">추가</button></div></div>
   <div class="sec"><h4>관계 (${Object.keys(app.state.relations).length})</h4>${Object.keys(app.state.relations).length > 1 ? '<p class="muted mem-hint-sm">같은 사람이 이름표 여러 개로 갈라졌으면 "같은 사람과 합치기"로 하나로 묶어요. 앞으로 그 이름으로 불려도 합친 쪽으로 처리돼요.</p>' : ''}${
     Object.entries(app.state.relations)
       .map(
         ([k, v]) =>
           `<div class="lore"><div class="row mem-merge"><b>${esc(k)}${seenSpan(k)}</b><select data-merge="${esc(k)}" class="mem-merge-select"><option value="">같은 사람과 합치기…</option>${Object.keys(
             app.state.relations,
           )
             .filter(o => o !== k)
             .map(o => `<option>${esc(o)}</option>`)
             .join('')}</select></div><p>${esc(v)}</p></div>`,
       )
       .join('') || '<p class="muted empty">없음</p>'
   }</div>
   ${
     (app.state.corrections || []).filter(c => c.until >= app.state.next).length
       ? `<div class="sec"><h4>최근 교정 사항</h4><p class="muted mem-hint">다시 쓰기에서 고른 사유가 10턴 동안 전달돼요.</p>${app.state.corrections
           .filter(c => c.until >= app.state.next)
           .map(
             (c, i) =>
               `<div class="lore"><b>${c.until - app.state.next}턴</b><p>${esc(c.text)}</p><button class="x" data-dcorr="${i}" aria-label="삭제">✕</button></div>`,
           )
           .join('')}</div>`
       : ''
   }
   <div class="sec"><h4>캐스팅 (${Object.keys(app.state.cast).length})</h4><p class="muted mem-hint">인물이 처음 등장할 때 얼굴이 무작위로 정해지고, 이 저장에서는 계속 유지돼요.</p>
    ${
      Object.entries(app.state.cast)
        .map(
          ([n, k]) =>
            `<div class="lore"><b>${esc(n)}</b><select data-cast="${esc(n)}" class="set-select grow">${Object.keys(
              charSets(),
            )
              .map(x => `<option ${x === k ? 'selected' : ''}>${esc(x)}</option>`)
              .join('')}</select><button class="x" data-uncast="${esc(n)}" aria-label="해제">✕</button></div>`,
        )
        .join('') || '<p class="muted empty">아직 없음</p>'
    }</div>
   <div class="sec"><h4>전생 (${app.state.pastLives.length})</h4>${app.state.pastLives.map(p => `<div class="lore"><b>${p.lifeNo}회차</b><p>${esc(p.world)}, ${esc(p.origin)}(${esc(p.tier)}), ${esc(p.score)}점. ${esc(p.epitaph)}</p></div>`).join('') || '<p class="muted empty">아직 없음</p>'}</div>
   <p class="muted mem-footer">앱 설정(모델, 언어 등)은 위쪽 ⚙ 버튼에 있어요.</p>`;
  $('#notes').oninput = e => ($('#notesCount').textContent = e.target.value.length + '/1200');
  $('#saveNotes').onclick = async () => {
    app.state.userNotes = $('#notes').value.trim();
    await persist();
    toast('노트 저장됨');
  };
  box.querySelectorAll('[data-merge]').forEach(
    sel =>
      (sel.onchange = async () => {
        const from = sel.dataset.merge,
          to = sel.value;
        if (!to) return;
        if (!isIdle()) {
          toast('답을 쓰는 중이에요. 끝나면 합칠 수 있어요');
          sel.value = '';
          return;
        }
        if (
          !(await askConfirm(
            `'${from}'을(를) '${to}'에 합칠까요?\n'${from}'의 관계 기록과 얼굴이 '${to}'로 옮겨지고, 앞으로 '${from}'으로 불려도 '${to}'로 처리돼요.`,
            '합치기',
          ))
        ) {
          sel.value = '';
          return;
        }
        renamePerson(from, to);
        await persist();
        toast(`'${to}' 한 사람으로 합쳤어요`);
        renderMemory();
      }),
  );
  box.querySelectorAll('[data-esum]').forEach(
    t =>
      (t.onchange = async () => {
        const x = app.state.summaries[+t.dataset.esum];
        if (!x) return;
        x.text = t.value.trim().slice(0, 1600);
        await persist();
        toast('요약 고쳤어요');
      }),
  );
  box.querySelectorAll('[data-elore]').forEach(
    t =>
      (t.onchange = async () => {
        app.state.lore[t.dataset.elore] = t.value.trim().slice(0, 300);
        await persist();
        toast('설정 고쳤어요');
      }),
  );
  box.querySelectorAll('[data-dlore]').forEach(
    b =>
      (b.onclick = async () => {
        delete app.state.lore[b.dataset.dlore];
        await persist();
        renderMemory();
      }),
  );
  $('#addLore').onclick = async () => {
    const k = $('#loreK').value.trim(),
      v = $('#loreV').value.trim();
    if (!k || !v) return;
    app.state.lore[k.slice(0, 30)] = v.slice(0, 300);
    await persist();
    renderMemory();
  };
  box.querySelectorAll('[data-dsum]').forEach(
    b =>
      (b.onclick = async () => {
        app.state.summaries.splice(+b.dataset.dsum, 1);
        await persist();
        renderMemory();
      }),
  );
  box.querySelectorAll('[data-dcorr]').forEach(
    b =>
      (b.onclick = async () => {
        const live = app.state.corrections.filter(c => c.until >= app.state.next);
        live.splice(+b.dataset.dcorr, 1);
        app.state.corrections = live;
        await persist();
        renderMemory();
      }),
  );
  box.querySelectorAll('[data-cast]').forEach(
    el =>
      (el.onchange = async () => {
        app.state.cast[el.dataset.cast] = el.value;
        await persist();
        toast('캐스팅 변경됨');
      }),
  );
  box.querySelectorAll('[data-uncast]').forEach(
    b =>
      (b.onclick = async () => {
        delete app.state.cast[b.dataset.uncast];
        await persist();
        renderMemory();
      }),
  );
}
