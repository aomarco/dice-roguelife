/* ============ images view ============ */
import { $, esc, noteIgnored, nowIso, sha256Hex, toast } from './util.js';
import { EMOS, WORLDS } from './data.js';
import { platform } from './db.js';
import { app } from './app.js';
import { saveSettings } from './settings.js';
import { logErr } from './diag.js';
import { answerDialog, askConfirm, askPrompt, askReview, openDialog, openSheet } from './sheet.js';
import { findManifestAsset, IMGDOC, imgError, IMGX, restoreFromManifest, SETDOC } from './library.js';
import { charSetsAll, genderOf, imgUrl, setCover, setWorlds, worldChips, worldsOf } from './images.js';
import { capTags, isGeneric, isIdTag, setIds, setTier, TIERS_CAST, toEnglishTags } from './casting.js';
import { exportPack } from './images-export.js';
import { setStat, statText } from './stat.js';
import { groupSimilar, visualSig } from './image-sim.js';
import { persist } from './persistence.js';
import { fillTemplate, prompts } from './prompt.js';

let imgFilter = 'all';
export async function renderImages() {
  const box = $('#imgBox');
  if (!box.dataset.zoom) {
    box.dataset.zoom = '1';
    box.addEventListener('click', e => {
      const t = e.target.closest('[data-big]');
      if (t) showBigImage(t.dataset.big, t.dataset.cap);
    });
  }
  if (!platform.assets) {
    box.innerHTML = `<h3 class="view-title img-off-title">이미지</h3><p class="muted">이미지 업로드는 이 앱의 소유자만 할 수 있어요. 게시된 링크에서 열어 주세요.</p>`;
    return;
  }
  let usage = null;
  try {
    usage = (await platform.assets.list()).usage;
  } catch (e) {
    noteIgnored('images-view: asset usage', e);
  }
  const canAuto = platform.limits && platform.limits.images;
  const sets = charSetsAll();
  const orphan = usage ? Math.max(0, usage.files - app.images.length) : 0;
  box.innerHTML =
    imagesHeaderHtml(usage, orphan, canAuto) + '\n' + setsSectionHtml(sets) + '\n' + allImagesSectionHtml();
  bindImagesToolbar(box);
  box.querySelectorAll('[data-set]').forEach(bindSetCard);
  bindImgGrid();
}

// the top of the tab: notices, the guide, storage use and the action buttons
function imagesHeaderHtml(usage, orphan, canAuto) {
  return `<h3 class="view-title">이미지</h3>
   ${imgError ? `<div class="notice img-notice">이미지 목록을 읽지 못했어요 (${esc(imgError)}). 새로고침해 보세요.</div>` : ''}
   ${orphan > 0 ? `<div class="notice img-notice">저장소에는 ${usage.files}장이 있는데 목록에는 ${app.images.length}장뿐이에요. <button class="btn inline-action" id="recover">목록 복구</button></div>` : ''}
   <details class="odds guide img-guide"><summary>도움말: 태그와 파일 이름</summary>
      <p><b>태그는 두 종류</b>. 원칙은 하나예요: 고유명사만 그 언어 그대로, 나머지는 전부 영어.</p>
      <div class="g"><code>묘사</code><span>영어. <code>black hair</code>, <code>armor</code>. 내레이터가 외형을 영어로 주고 코드가 단어 단위로 비교해요. 한국어로 치면 저장할 때 영어로 바뀌고, 영어는 철자만 고쳐요.</span><code>정체</code><span><code>key:value</code>. key는 영어(<code>faction</code>, <code>company</code>, 아무 단어나), value는 고유명사를 그 언어 그대로(<code>faction:사천당가</code>, <code>company:넥슨</code>). 번역하지 않고 그대로 비교해요. 세트의 모든 프레임에 붙어야 하니 세트 카드에서 추가하고, "소속 태그 뽑기"가 설명에서 뽑아 줘요.</span></div>
      <p><b>파일 이름 규칙</b> (안 맞으면 올릴 때 물어봐요)</p>
      <div class="g"><code>{set}_{emotion}</code><span>캐릭터. <code>female1_smile.png</code>. 같은 세트는 한 인물의 여러 표정이에요.</span><code>shadow_{gender}</code><span>엑스트라용 그림자. <code>shadow_male_neutral.png</code>, <code>shadow_female_2.png</code>. 성별별 세트로 묶여요</span><code>bg_{place}_{time}</code><span>배경. <code>bg_tavern_night.png</code></span><code>admin_{emotion}</code><span>게임 마스터</span><code>dice</code><span>주사위 연출. <code>dice</code>, <code>dice_success</code>, <code>dice_fail</code>. 라벨링이 필요 없고 자동 분류도 건너뛰어요</span></div>
      <p>같은 파일을 다시 올리면 건너뛰어요.</p>
    </details>
   ${usage ? `<div class="img-usage"><div class="row img-usage-head"><span>${usage.files} / ${usage.maxFiles}개</span><span>${(usage.bytes / 1048576).toFixed(1)} / ${(usage.maxBytes / 1048576).toFixed(0)} MB</span></div><div class="meter"><i style="width:${Math.min(100, (usage.bytes / usage.maxBytes) * 100)}%"></i></div></div>` : ''}
   <div class="row img-toolbar"><label class="btn primary file-btn">이미지 올리기<input type="file" id="upl" accept="image/*" multiple hidden></label>
    <label class="btn file-btn">tags.json 가져오기<input type="file" id="tagsIn" accept=".json,application/json" hidden></label>
    ${canAuto && platform.sample ? `<button class="btn" id="autoTag">자동 분류</button>` : ''}<button class="btn" id="dedupe">중복 정리</button><button class="btn" id="expPack" title="이미지를 올릴 때 쓰는 이름으로 zip에 담고 tags.json까지 넣어 내려받아요">팩 내보내기</button><button class="btn" id="expTags" title="이미지 없이 tags.json만 내려받아요">태그만 내보내기</button><button class="btn" id="saveMan" title="복제본에서 이미지 목록을 자동 복원할 수 있게 저장">복제용 목록 저장</button><button class="btn" id="tagsEn" title="한국어 등 영어가 아닌 태그를 영어로 바꿔요">태그 영어로</button><button class="btn" id="idTags" title="세트 설명에서 문파, 가문, 회사 같은 소속을 정체 태그(faction:이름)로 뽑아요. 적용 전에 목록을 보여줘요">소속 태그 뽑기</button><button class="btn danger" id="wipeAll">전체 삭제</button><span class="muted img-upl-stat" id="uplStat">${esc(statText())}</span></div>`;
}

function setsSectionHtml(sets) {
  return `   <div class="sec"><h4>캐릭터 세트 (${Object.keys(sets).length})</h4>
    <div class="row img-search"><input id="setQ" value="${esc(setQuery)}" placeholder="세트, 이름, 역할, 태그로 검색" class="search-pill"><button class="btn ghost sort-toggle" id="setSort">${setRecent ? '최근 올린 순' : '올린 순서'}</button></div><div class="img-gap"></div>
    ${setListHtml(sets)}</div>`;
}

// the character sets matching the search, one page of cards and the pager
function setListHtml(sets) {
  const q = setQuery.trim().toLowerCase();
  let all = Object.entries(sets).filter(([k, imgs]) => {
    if (!q) return true;
    const m = app.setMeta[k] || {};
    return [k, m.charName, m.role, ...(m.aliases || []), ...worldsOf(m), ...imgs.flatMap(x => x.tags || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
  if (setRecent) {
    const newest = imgs => imgs.reduce((m, x) => (String(x.createdAt || '') > m ? String(x.createdAt || '') : m), '');
    all = [...all].sort((a, b) => newest(b[1]).localeCompare(newest(a[1])));
  }
  const pages = Math.max(1, Math.ceil(all.length / SET_PER));
  if (setPage >= pages) setPage = pages - 1;
  const list = all.slice(setPage * SET_PER, (setPage + 1) * SET_PER);
  const pager =
    all.length > SET_PER
      ? `<div class="row pager"><button class="btn ghost" data-spg="-1" ${setPage === 0 ? 'disabled' : ''}>이전</button><span class="muted pager-count">${setPage + 1} / ${pages} (${all.length}개)</span><button class="btn ghost" data-spg="1" ${setPage >= pages - 1 ? 'disabled' : ''}>다음</button></div>`
      : '';
  return (
    (list.length ? '' : '<p class="muted empty">검색 결과가 없어요.</p>') +
    list.map(([k, imgs]) => setCardHtml(k, imgs)).join('') +
    pager
  );
}

// one set card: cover, faces, gender, role, standing, fixed name, tags and worlds
function setCardHtml(k, imgs) {
  const m = app.setMeta[k] || {};
  const face = setCover(k, imgs);
  return `<div class="item set-card" data-set="${esc(k)}"><div class="set-head"><div class="who"><img src="${imgUrl(face.id)}" data-big="${face.id}" data-cap="${esc(k + (m.charName ? ' · ' + m.charName : ''))}" loading="lazy" decoding="async" alt=""><div class="names"><b>${esc(k)}</b>${m.charName ? ` <span class="char-name">· ${esc(m.charName)}</span>` : ''}<div class="muted role">${esc(m.role || '')}</div></div></div><div class="muted flags"><span class="count">${imgs.length}장</span><label title="얼굴 없는 범용 이미지로 써요. 엑스트라 여럿이 같이 쓰고, 조연·주연에게는 안 가요"><input type="checkbox" data-sgen ${isGeneric(k) ? 'checked' : ''} ${(app.setMeta[k] || {}).charName ? 'disabled title="이름이 박힌 그림은 그림자로 쓰지 않아요"' : isGeneric(k) && (app.setMeta[k] || {}).tier !== 'generic' ? 'disabled title="파일명(shadow_)으로 그림자가 됐어요"' : ''}>그림자</label><label><input type="checkbox" data-soff ${m.off ? 'checked' : ''}>제외</label></div></div>
     ${imgs.length > 1 ? `<div class="row cover-row"><span class="muted cover-label">대표:</span>${imgs.map(x => `<button type="button" data-cover="${x.id}" title="${esc(x.emotion || '')}" class="cover-pick${x.id === face.id ? ' on' : ''}"><img src="${imgUrl(x.id)}" loading="lazy" alt="" class="cover-thumb"></button>`).join('')}</div>` : ''}
     <div class="row set-row"><select data-sf="gender" class="set-select">${[
       ['', '성별 자동'],
       ['female', '여'],
       ['male', '남'],
       ['other', '기타'],
     ]
       .map(([v, n]) => `<option value="${v}" ${(m.gender || '') === v ? 'selected' : ''}>${n}</option>`)
       .join('')}</select>
     <input data-sf="role" value="${esc(m.role || '')}" placeholder="역할, 분위기 (예: 기사, 냉정)" class="set-input"></div>
     <div class="row set-row"><select data-sf="tier" class="set-select" title="배역: 표정이 많은 세트는 주요 인물에, 한 장뿐인 세트는 엑스트라에 배정돼요">${[
       ['', '배역 자동 (' + { extra: '엑스트라', minor: '조연', major: '주요' }[setTier(k)] + ')'],
       ['major', '주요 인물'],
       ['minor', '조연'],
       ['extra', '엑스트라'],
       ['generic', '전용 그림자'],
     ]
       .map(([v, n]) => `<option value="${v}" ${(m.tier || '') === v ? 'selected' : ''}>${n}</option>`)
       .join(
         '',
       )}</select><input data-sf="charName" value="${esc(m.charName || '')}" maxlength="20" placeholder="고정 이름 (그림에 이름이 박혀 있으면)" class="set-input"><button class="btn ghost" data-srename title="세트 이름을 바꾸면 모든 프레임의 이름과 지금 저장의 캐스팅이 따라가요">이름 바꾸기</button><input data-sf="aliases" value="${esc((m.aliases || []).join(', '))}" placeholder="다른 호칭 (쉼표로)" class="set-input set-input-narrow"></div><div class="set-row">${worldChips(worldsOf(m), 'data-sw')}</div>
     <div class="seg set-tags">${(() => {
       const all = [...new Set(imgs.flatMap(x => x.tags || []))];
       return [...all.filter(isIdTag), ...all.filter(t => !isIdTag(t))]
         .map(
           t =>
             `<button type="button" data-stag="${esc(t)}" aria-pressed="true" title="${isIdTag(t) ? '정체 태그: 번역하지 않고 그대로 비교해요' : '묘사 태그: 영어, 단어 단위로 비교해요'}" class="chip-sm set-tag${isIdTag(t) ? ' id' : ''}">${esc(t)} ✕</button>`,
         )
         .join('');
     })()}<input data-stagadd placeholder="태그 추가 (소속은 faction:사천당가 처럼)" class="set-tag-input"></div></div>`;
}

function allImagesSectionHtml() {
  return `   <div class="sec"><div class="row img-all-head"><h4 class="img-all-title">모든 이미지 (${app.images.length})</h4><div class="seg">${[
    ['all', '전체'],
    ['char', '캐릭터'],
    ['scene', '배경'],
  ]
    .map(([v, n]) => `<button data-flt="${v}" aria-pressed="${imgFilter === v}">${n}</button>`)
    .join('')}</div></div>
    <div class="row img-search img-search-all"><input id="imgQ" value="${esc(imgQuery)}" placeholder="이름, 세트, 태그, 세계로 검색" class="search-pill"><button class="btn ghost sort-toggle" id="imgSort">${imgRecent ? '최근 올린 순' : '올린 순서'}</button></div><div id="imgGridBox" class="img-grid-box">${imgGrid()}</div></div>`;
}

// the buttons, filters, search boxes and pagers above the sets and the grid
function bindImagesToolbar(box) {
  $('#upl').onchange = e => {
    const files = [...e.target.files];
    e.target.value = ''; // choosing the same files again must fire again
    exclusiveJob('올리기', () => uploadFiles(files));
  };
  $('#tagsIn').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    exclusiveJob('태그 가져오기', () => importTags(f));
  };
  const at = $('#autoTag');
  if (at) at.onclick = () => exclusiveJob('자동 분류', autoTagAll);
  $('#dedupe').onclick = () => exclusiveJob('중복 정리', dedupeImages);
  const rc = $('#recover');
  if (rc) rc.onclick = () => exclusiveJob('목록 복구', recoverImages);
  $('#wipeAll').onclick = () => exclusiveJob('전체 삭제', wipeAllImages);
  $('#expPack').onclick = () => exportPack(true);
  $('#expTags').onclick = () => exportPack(false);
  $('#saveMan').onclick = () => exclusiveJob('목록 저장', saveManifest);
  $('#tagsEn').onclick = () => exclusiveJob('태그 영어로', tagsToEnglish);
  $('#idTags').onclick = () => exclusiveJob('소속 태그', idTagsFromDesc);
  box.querySelectorAll('[data-flt]').forEach(
    b =>
      (b.onclick = () => {
        imgFilter = b.dataset.flt;
        imgPage = 0;
        renderImages();
      }),
  );
  const redraw = () => {
    $('#imgGridBox').innerHTML = imgGrid();
    bindImgGrid();
    bindPager();
  };
  const bindPager = () => {
    box.querySelectorAll('[data-pg]').forEach(
      b =>
        (b.onclick = () => {
          imgPage += +b.dataset.pg;
          redraw();
          $('#imgGridBox').scrollIntoView({ block: 'start' });
        }),
    );
  };
  bindPager();
  box.querySelectorAll('[data-spg]').forEach(
    b =>
      (b.onclick = () => {
        setPage += +b.dataset.spg;
        renderImages();
      }),
  );
  const ss = $('#setSort');
  if (ss)
    ss.onclick = () => {
      setRecent = !setRecent;
      setPage = 0;
      renderImages();
    };
  let sqt = null;
  const sq = $('#setQ');
  if (sq) {
    sq.oninput = e => {
      clearTimeout(sqt);
      sqt = setTimeout(() => {
        setQuery = e.target.value;
        setPage = 0;
        const pos = e.target.selectionStart;
        renderImages().then(() => {
          const n = $('#setQ');
          if (n) {
            n.focus();
            n.setSelectionRange(pos, pos);
          }
        });
      }, 300);
    };
  }
  let qt = null;
  $('#imgQ').oninput = e => {
    clearTimeout(qt);
    qt = setTimeout(() => {
      imgQuery = e.target.value;
      imgPage = 0;
      redraw();
    }, 200);
  };
  $('#imgSort').onclick = () => {
    imgRecent = !imgRecent;
    imgPage = 0;
    renderImages();
  };
}

// what each control on one set card changes; every change is saved to the shared set card
// the set card fields typed in the images tab: how each is stored (undefined removes it)
const SET_FIELDS = {
  aliases: v =>
    v
      .split(',')
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 6),
  charName: v => v.slice(0, 20) || undefined,
  tier: v => v || undefined,
};
// changes one set card and saves it; resolves true when saved (a failure is told, and logged)
async function saveSetMeta(k, change) {
  const m = (app.setMeta[k] = app.setMeta[k] || {});
  change(m);
  try {
    await SETDOC(k).set(m);
    return true;
  } catch (err) {
    logErr('set', err);
    if (KEY_RE.test(k)) toast('저장 실패: ' + (err.code || err.message));
    else
      toast(
        `세트 이름 "${k}"에 한글이나 기호가 있어서 저장할 수 없어요. 세트 카드의 "이름 바꾸기"로 영문 이름을 주세요`,
        6000,
      );
    return false;
  }
}
function bindSetCard(card) {
  const k = card.dataset.set;
  card.querySelectorAll('[data-sf]').forEach(
    el =>
      (el.onchange = () =>
        saveSetMeta(k, m => {
          const f = el.dataset.sf;
          const v = SET_FIELDS[f] ? SET_FIELDS[f](el.value.trim()) : el.value.trim();
          if (v === undefined) delete m[f];
          else m[f] = v;
        })),
  );
  card.querySelectorAll('[data-cover]').forEach(
    b =>
      (b.onclick = async () => {
        await saveSetMeta(k, m => (m.cover = b.dataset.cover));
        renderImages();
      }),
  );
  const rn = card.querySelector('[data-srename]');
  if (rn) rn.onclick = () => renameSet(k);
  const gen = card.querySelector('[data-sgen]');
  if (gen)
    gen.onchange = async () => {
      const saved = await saveSetMeta(k, m => {
        if (gen.checked) m.tier = 'generic';
        else if (m.tier === 'generic') delete m.tier;
      });
      if (saved) toast(gen.checked ? `${k}: 전용 그림자예요 (실제 얼굴로는 안 써요)` : `${k}: 일반 세트로 돌아왔어요`);
      renderImages();
    };
  const off = card.querySelector('[data-soff]');
  if (off)
    off.onchange = async () => {
      const saved = await saveSetMeta(k, m => {
        if (off.checked) m.off = true;
        else delete m.off;
      });
      if (saved) toast(off.checked ? `${k}: 앞으로 배정되지 않아요` : `${k}: 다시 배정돼요`);
    };
  card.querySelectorAll('[data-stag]').forEach(
    b =>
      (b.onclick = async () => {
        const t = b.dataset.stag;
        let fail = null;
        for (const x of app.images.filter(i => i.kind === 'char' && (i.set || i.name) === k)) {
          if ((x.tags || []).includes(t)) {
            x.tags = x.tags.filter(v => v !== t);
            try {
              await IMGDOC(x.id).set(x);
            } catch (err) {
              fail = err;
            }
          }
        }
        if (fail) {
          toast('저장 실패: ' + (fail.code || fail.message));
          logErr('tag', fail);
        }
        renderImages();
      }),
  );
  const add = card.querySelector('[data-stagadd]');
  if (add)
    add.onkeydown = async e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      let t = add.value.trim();
      if (!t) return;
      add.disabled = true;
      t = (await toEnglishTags([t]))[0];
      let fail = null;
      for (const x of app.images.filter(i => i.kind === 'char' && (i.set || i.name) === k)) {
        x.tags = capTags([...(x.tags || []), t]);
        try {
          await IMGDOC(x.id).set(x);
        } catch (err) {
          fail = err;
        }
      }
      if (fail) {
        toast('저장 실패: ' + (fail.code || fail.message));
        logErr('tag', fail);
      }
      renderImages();
    };
  card.querySelectorAll('[data-sw]').forEach(
    b =>
      (b.onclick = e => {
        e.preventDefault();
        saveSetMeta(k, m => {
          const ws = new Set(worldsOf(m));
          const id2 = b.dataset.sw;
          if (ws.has(id2)) ws.delete(id2);
          else ws.add(id2);
          setWorlds(m, [...ws]);
          card.querySelectorAll('[data-sw]').forEach(x => x.setAttribute('aria-pressed', String(ws.has(x.dataset.sw))));
        });
      }),
  );
}
let imgQuery = '',
  imgPage = 0,
  imgRecent = true;
const IMG_PER = 60;
let setQuery = '',
  setPage = 0,
  setRecent = false;
const SET_PER = 10;
function showBigImage(id, caption) {
  openSheet(
    `<div class="big-image"><img src="${imgUrl(id)}" alt="" class="big-image-pic">${caption ? `<p class="muted big-image-cap">${esc(caption)}</p>` : ''}<div class="row actions centered"><button class="btn" data-close>닫기</button></div></div>`,
    { center: true },
  );
}
function imgGrid() {
  const q = imgQuery.trim().toLowerCase();
  let all = app.images
    .filter(x => imgFilter === 'all' || x.kind === imgFilter)
    .filter(
      x =>
        !q ||
        [x.name, x.file, x.set, x.emotion, ...(x.tags || []), ...worldsOf(x)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
  if (imgRecent) all = [...all].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); // what you just uploaded is at the top
  const pages = Math.max(1, Math.ceil(all.length / IMG_PER));
  if (imgPage >= pages) imgPage = pages - 1;
  const list = all.slice(imgPage * IMG_PER, (imgPage + 1) * IMG_PER);
  const pager =
    all.length > IMG_PER
      ? `<div class="row pager pager-below"><button class="btn ghost" data-pg="-1" ${imgPage === 0 ? 'disabled' : ''}>이전</button><span class="muted pager-count">${imgPage + 1} / ${pages} (${all.length}장)</span><button class="btn ghost" data-pg="1" ${imgPage >= pages - 1 ? 'disabled' : ''}>다음</button></div>`
      : '';
  if (!list.length) return '<p class="muted">' + (q ? '검색 결과가 없어요.' : '아직 이미지가 없어요.') + '</p>';
  const sel = 'class="img-field-select"';
  return `<div class="imggrid">${list
    .map(
      x => `<div class="img" data-id="${x.id}"><img class="th th-img" data-big="${x.id}" data-cap="${esc(x.file || x.name || '')}" src="${imgUrl(x.id)}" loading="lazy" decoding="async" alt=""><div class="f">
    <select data-f="kind" ${sel}><option value="char" ${x.kind === 'char' ? 'selected' : ''}>캐릭터</option><option value="scene" ${x.kind === 'scene' ? 'selected' : ''}>배경</option><option value="fx" ${x.kind === 'fx' ? 'selected' : ''}>연출(주사위)</option></select>
    ${
      x.kind === 'char'
        ? `<input data-f="set" value="${esc(x.set || x.name || '')}" placeholder="세트 (female1)"><select data-f="emotion" ${sel}>${EMOS.map(e => `<option ${(x.emotion || 'neutral') === e ? 'selected' : ''}>${e}</option>`).join('')}</select>`
        : x.kind === 'fx'
          ? `<input data-f="name" value="${esc(x.name || '')}" placeholder="dice, dice_success, dice_fail">`
          : `<input data-f="name" value="${esc(x.name || '')}" placeholder="배경 이름 (tavern_night)">${worldChips(worldsOf(x), 'data-w')}`
    }
    <input data-f="tags" value="${esc((x.tags || []).join(', '))}" placeholder="${x.kind === 'char' ? '태그: 갑옷, 부상, 야간' : '태그: 객잔, 밤, 비, 붐빔'}">
    <button class="btn danger img-del" data-delimg>삭제</button></div></div>`,
    )
    .join('')}</div>${pager}`;
}
function bindImgGrid() {
  document.querySelectorAll('.img[data-id]').forEach(card => {
    const id = card.dataset.id;
    const x = app.images.find(i => i.id === id);
    card.querySelectorAll('[data-w]').forEach(
      b =>
        (b.onclick = async e => {
          e.preventDefault();
          const ws = new Set(worldsOf(x));
          const id2 = b.dataset.w;
          if (ws.has(id2)) ws.delete(id2);
          else ws.add(id2);
          setWorlds(x, [...ws]);
          card.querySelectorAll('[data-w]').forEach(y => y.setAttribute('aria-pressed', String(ws.has(y.dataset.w))));
          try {
            await IMGDOC(id).set(x);
          } catch (err) {
            toast('저장 실패: ' + (err.code || err.message));
            logErr('img', err);
          }
        }),
    );
    card.querySelectorAll('[data-f]').forEach(
      el =>
        (el.onchange = async () => {
          const f = el.dataset.f;
          x[f] =
            f === 'tags'
              ? capTags(
                  await toEnglishTags(
                    el.value
                      .split(',')
                      .map(t => t.trim())
                      .filter(Boolean),
                  ),
                )
              : el.value.trim();
          if (f === 'tags') el.value = x.tags.join(', ');
          if (f === 'set' && x.set && !KEY_RE.test(x.set)) {
            toast('세트 이름은 영문, 숫자, _ - 만 돼요', 4000);
            el.value = x.set = el.dataset.prev || '';
            return;
          }
          if (f === 'set') el.dataset.prev = x.set;
          if (x.kind === 'char' && (f === 'set' || f === 'emotion') && x.set)
            x.name = `${x.set}_${x.emotion || 'neutral'}${x.variant ? '_' + x.variant : ''}`;
          try {
            await IMGDOC(id).set(x);
          } catch (err) {
            toast('저장 실패: ' + (err.code || err.message));
            logErr('img', err);
          }
          if (f === 'kind' || f === 'set') renderImages();
        }),
    );
    const del = card.querySelector('[data-delimg]');
    if (del)
      del.onclick = async () => {
        if (!(await askConfirm('이 이미지를 삭제할까요? 되돌릴 수 없습니다.'))) return;
        try {
          await platform.assets.delete(id);
        } catch (e) {
          noteIgnored('delete image: asset', e);
        }
        await IMGDOC(id)
          .delete()
          .catch(e => noteIgnored('images-view: IMGDOC.delete', e));
        app.images = app.images.filter(i => i.id !== id);
        renderImages();
      };
  });
}
async function compress(file) {
  try {
    const bmp = await createImageBitmap(file);
    const portrait = bmp.height > bmp.width * 1.1;
    const max = portrait ? 1100 : 1400;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.type === 'image/webp') return { blob: file, portrait }; // already stored size: keep the bytes (no second compression)
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k);
    cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.84));
    return { blob: blob || file, portrait };
  } catch (e) {
    return { blob: file, portrait: false };
  }
}
// "smile" or "smile2" (a number glued to the emotion): the emotion plus the number, else null
function splitEmoNum(tok) {
  const m = /^([a-z]+?)(\d*)$/.exec(tok || '');
  return m && EMOS.includes(m[1]) ? { emo: m[1], num: m[2] } : null;
}
function parseName(fname, portrait) {
  const base = fname.replace(/\.[^.]+$/, '');
  const parts = base
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(s => s.toLowerCase());
  if (parts[0] === 'bg' || parts[0] === 'background')
    return { kind: 'scene', name: parts.slice(1).join('_') || base, tags: parts.slice(1) };
  if (/^(dice|fx)/.test(parts[0] || '')) return { kind: 'fx', name: base.toLowerCase(), tags: parts };
  if (/^(shadow|generic|silhouette)$/.test(parts[0] || '')) {
    const gender = w =>
      /^(female|woman|women|girl)/.test(w) ? 'female' : /^(male|man|men|boy)/.test(w) ? 'male' : null;
    // shadow_{male|female}_..., or with a style word first: shadow_cyber_male_... (its own set shadow_cyber_male)
    let g = gender(parts[1] || ''),
      at = 1,
      style = '';
    if (
      !g &&
      /^[a-z0-9-]+$/.test(parts[1] || '') &&
      /^(female|woman|women|girl|male|man|men|boy)$/.test(parts[2] || '')
    ) {
      style = parts[1];
      g = gender(parts[2]);
      at = 2;
    }
    const rest = g ? parts.slice(at + 1) : parts.slice(2);
    if (!g) g = 'other';
    const e0 = splitEmoNum(rest[0]);
    if (e0) rest.splice(0, 1, ...(e0.num ? [e0.num] : []));
    const emo = e0 ? e0.emo : 'neutral';
    return {
      kind: 'char',
      set: 'shadow_' + (style ? style + '_' : '') + g,
      emotion: emo,
      variant: rest.join('_'),
      name: base.toLowerCase(),
      tags: ['shadow', 'silhouette', ...(style ? [style] : [])],
      shadowGender: g,
    };
  }
  const e1 = parts.length >= 2 ? splitEmoNum(parts[1]) : null;
  if (e1)
    return {
      kind: 'char',
      set: parts[0],
      emotion: e1.emo,
      variant: [...(e1.num ? [e1.num] : []), ...parts.slice(2)].join('_'),
      name: base,
      tags: parts,
    };
  if (portrait) {
    const k0 = parts[0] || base;
    return KEY_RE.test(k0)
      ? { kind: 'char', set: k0, emotion: 'neutral', name: base, tags: parts, guessed: true }
      : { kind: 'char', set: null, emotion: 'neutral', name: base, tags: [], guessed: true };
  }
  return { kind: 'scene', name: base.toLowerCase(), tags: parts, guessed: true };
}
const KEY_RE = /^[A-Za-z0-9_\-.~:@+]+$/; // a set key is a db document id
// the next free number, so nobody has to count
function nextSetKey(g) {
  const pre = g === 'female' ? 'female' : g === 'male' ? 'male' : 'other';
  let mx = 0;
  for (const k of Object.keys(charSetsAll())) {
    const m = new RegExp('^' + pre + '(\\d+)$').exec(k);
    if (m) mx = Math.max(mx, +m[1]);
  }
  return pre + (mx + 1);
}
function askUploadPlan(n) {
  // files whose names say nothing: ask once for the batch, or keep the shape-based guess
  const answer =
    openDialog(`<h3 class="upl-title">이름으로 못 알아본 파일 ${n}장</h3><p class="muted sheet-lead">파일명이 <code>female3_smile.png</code> 꼴이 아니에요. 어떻게 넣을까요? 세트 번호는 자동으로 붙어요.</p>
    <div class="seg upl-seg"><button type="button" data-k="char" aria-pressed="true">캐릭터</button><button type="button" data-k="scene">배경</button><button type="button" data-k="fx">연출</button></div>
    <div id="upFx" class="hidden"><div class="seg upl-seg"><button type="button" data-fx="dice success" aria-pressed="true">주사위 대성공</button><button type="button" data-fx="dice fail">주사위 대실패</button><button type="button" data-fx="dice">주사위 기본</button></div></div>
    <div id="upChar"><div class="seg upl-seg"><button type="button" data-g="female" aria-pressed="true">여</button><button type="button" data-g="male">남</button><button type="button" data-g="other">기타</button></div>
    <div class="seg upl-seg"><button type="button" data-grp="each" aria-pressed="true">각각 다른 인물</button><button type="button" data-grp="one">한 인물의 표정 프레임</button></div><p class="muted upl-note">표정은 일단 neutral로 들어가요. 올린 뒤 "자동 분류"를 누르면 표정을 맞춰요.</p></div>
    <div class="row"><button class="btn primary" id="upOk">이렇게 올리기</button><button class="btn ghost" id="upGuess">모양으로 추정</button></div>`);
  const box = $('#sheetInner');
  const pick = (sel, attr) => {
    box.querySelectorAll(sel).forEach(
      b =>
        (b.onclick = () => {
          box.querySelectorAll(sel).forEach(x => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          if (attr === 'k') {
            $('#upChar').classList.toggle('hidden', b.dataset.k !== 'char');
            $('#upFx').classList.toggle('hidden', b.dataset.k !== 'fx');
          }
        }),
    );
  };
  pick('[data-k]', 'k');
  pick('[data-g]');
  pick('[data-grp]');
  pick('[data-fx]');
  const get = sel => box.querySelector(sel + '[aria-pressed="true"]');
  $('#upOk').onclick = () =>
    answerDialog({
      kind: get('[data-k]').dataset.k,
      gender: get('[data-g]').dataset.g,
      group: get('[data-grp]').dataset.grp,
      fx: get('[data-fx]').dataset.fx.split(' '),
    });
  $('#upGuess').onclick = () => answerDialog(null);
  return answer;
}
// One long job at a time: a second upload (or a second tab) would send the same pictures twice.
let busy = '';
async function exclusiveJob(name, job) {
  if (busy) {
    toast(`${busy} 작업이 진행 중이에요. 끝난 뒤에 다시 눌러 주세요`, 4000);
    return;
  }
  busy = name;
  try {
    if (!navigator.locks) return await job();
    let started = false;
    try {
      return await navigator.locks.request('dr-image-job', { ifAvailable: true }, async lock => {
        if (!lock) {
          toast('다른 화면에서 이미지 작업을 하는 중이에요. 끝난 뒤에 다시 해 주세요', 4500);
          return;
        }
        started = true;
        return await job();
      });
    } catch (e) {
      if (started) throw e;
      return await job(); // locks are not available in this page: go on without them
    }
  } finally {
    busy = '';
  }
}
// run fn over items, a few at a time
async function inParallel(items, n, fn) {
  const queue = [...items];
  const worker = async () => {
    while (queue.length) await fn(queue.shift());
  };
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, worker));
}
const UPLOAD_PAR = 3; // pictures sent at the same time (it drops to 1 when uploads start failing, and climbs back)
const UPLOAD_RETRIES = 2;
const MAX_UNSAVED = 9; // pictures sent but not yet in the saved list: the most a closed window could lose
const NO_RETRY = new Set(['quota_or_state', 'quota_exceeded', 'too_large']);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function uploadFiles(files) {
  let done = 0,
    skipped = 0,
    stop = false;
  const failed = [],
    landed = [];
  await fillHashes(t => setStat(t), '기존 이미지 확인 중');
  const t0 = Date.now();
  const unnamed = files.filter(f => parseName(f.name, true).guessed);
  const plan = unnamed.length ? await askUploadPlan(unnamed.length) : null;
  let sharedKey = null;
  const newSets = new Set();
  const inflight = new Set(); // names and hashes being sent right now: the same file twice in one batch
  const time = { n: 0, compress: 0, upload: 0, save: 0 }; // milliseconds, to see where the time goes
  let par = UPLOAD_PAR,
    okRun = 0,
    running = 0,
    unsaved = 0;
  const saves = [];
  const fail = (f, e) => {
    failed.push([
      f.name,
      e.code === 'quota_or_state'
        ? '저장 공간 가득'
        : e.code === 'too_large'
          ? '파일이 너무 큼'
          : e.code || e.message || '실패',
    ]);
    if (e.code === 'quota_or_state' || e.code === 'quota_exceeded') stop = true;
  };
  const say = () => {
    const el = done ? Math.round((((Date.now() - t0) / done) * (files.length - done)) / 1000) : 0;
    setStat(
      `${done}/${files.length} 올리는 중${skipped ? `, 건너뜀 ${skipped}` : ''}${failed.length ? `, 실패 ${failed.length}` : ''}${el > 5 ? `, 약 ${el >= 60 ? Math.round(el / 60) + '분' : el + '초'} 남음` : ''}`,
    );
  };
  const sendWithRetry = async (blob, f) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await platform.assets.upload(blob, { type: blob.type || f.type });
      } catch (e) {
        if (NO_RETRY.has(e.code) || attempt >= UPLOAD_RETRIES) throw e;
        par = Math.max(1, par - 1); // maybe too many at once: slow down, then try the same picture again
        okRun = 0;
        await wait(1000 * 2 ** attempt);
      }
    }
  };
  const one = async (f, lane) => {
    const hash = await sha256Hex(f).catch(() => null);
    // an exported pack holds the stored (already compressed) files under new names: they match by the stored file hash
    if (
      app.images.some(x => (hash && (x.hash === hash || x.shash === hash)) || x.file === f.name) ||
      inflight.has(f.name) ||
      (hash && inflight.has(hash))
    ) {
      skipped++;
      return;
    }
    inflight.add(f.name);
    if (hash) inflight.add(hash);
    let row = null;
    try {
      let t = performance.now();
      const { blob, portrait } = await compress(f);
      time.compress += performance.now() - t;
      t = performance.now();
      const r = await sendWithRetry(blob, f);
      time.upload += performance.now() - t;
      if (++okRun >= 20 && par < UPLOAD_PAR) {
        par++;
        okRun = 0;
      }
      const shash = await sha256Hex(blob).catch(() => null); // no hash: this upload just skips the duplicate check
      // From here to the push there is no await: set names are picked from what the list holds right now, so two
      // pictures sent at the same time never get the same new set.
      let parsed = parseName(f.name, portrait);
      let guessed = !!parsed.guessed;
      delete parsed.guessed;
      if (parsed.kind === 'char' && !parsed.set) {
        const key = nextSetKey('other');
        parsed.set = key;
        parsed.name = key + '_neutral';
        newSets.add(key);
      } // a Korean file name cannot be a set key
      let shadow = null;
      if (parsed.shadowGender) {
        shadow = parsed.shadowGender;
        delete parsed.shadowGender;
        app.setMeta[parsed.set] = Object.assign(app.setMeta[parsed.set] || {}, { gender: shadow, tier: 'generic' });
      }
      if (guessed && plan) {
        const base = f.name.replace(/\.[^.]+$/, '');
        guessed = false;
        if (plan.kind === 'char') {
          const key =
            plan.group === 'one' ? (sharedKey = sharedKey || nextSetKey(plan.gender)) : nextSetKey(plan.gender);
          parsed = { kind: 'char', set: key, emotion: 'neutral', name: key + '_neutral', tags: [] };
          newSets.add(key);
        } else if (plan.kind === 'scene') parsed = { kind: 'scene', name: base.toLowerCase(), tags: [] };
        else parsed = { kind: 'fx', name: base.toLowerCase(), tags: plan.fx || ['dice'] };
      }
      row = Object.assign({ id: r.id, world: 'any', file: f.name, hash, shash, createdAt: nowIso() }, parsed);
      const page = IMGX.laneAssign(row.id, lane);
      app.images.push(row);
      const mine = row,
        setKey = parsed.set;
      row = null; // from here the save below owns the picture (and its rollback)
      unsaved++;
      const t1 = performance.now();
      // the list is written right away; pictures that land while it runs ride in the next write. The next upload does not wait.
      saves.push(
        IMGX.save(page)
          .then(
            async () => {
              time.save += performance.now() - t1;
              time.n++;
              landed.push({ file: f.name, row: mine, guessed });
              if (shadow)
                await SETDOC(setKey)
                  .set(app.setMeta[setKey])
                  .catch(e => logErr('upload', e));
            },
            e => {
              app.images = app.images.filter(x => x !== mine); // the list write failed: the picture is not in the library
              IMGX.map.delete(mine.id);
              fail(f, e);
            },
          )
          .finally(() => unsaved--),
      );
    } catch (e) {
      if (row) {
        app.images = app.images.filter(x => x !== row); // the list write failed: the picture is not in the library
        IMGX.map.delete(row.id);
      }
      throw e;
    } finally {
      inflight.delete(f.name);
      if (hash) inflight.delete(hash);
    }
  };
  IMGX.lanes = [];
  const queue = files.map((f, i) => [f, i % UPLOAD_PAR]); // each picture is tied to a lane (its own list page)
  const worker = async () => {
    while (queue.length && !stop) {
      if (running >= par) {
        await wait(50);
        continue;
      }
      if (unsaved >= MAX_UNSAVED) {
        await wait(20);
        continue;
      }
      const [f, lane] = queue.shift();
      running++;
      try {
        await one(f, lane);
      } catch (e) {
        fail(f, e);
      } finally {
        running--;
        done++;
        say();
      }
    }
  };
  const guard = e => {
    e.preventDefault();
    e.returnValue = ''; // leaving now would lose the pictures still being sent
  };
  window.addEventListener('beforeunload', guard);
  say();
  try {
    await Promise.all(Array.from({ length: UPLOAD_PAR }, worker));
    await Promise.all(saves);
  } finally {
    window.removeEventListener('beforeunload', guard);
  }
  for (const key of newSets) {
    const m = (app.setMeta[key] = Object.assign(
      app.setMeta[key] || {},
      plan && plan.kind === 'char' ? { gender: plan.gender } : {},
    ));
    try {
      await SETDOC(key).set(m);
    } catch (e) {
      logErr('upload', e);
    }
  }
  setStat('');
  if (time.n >= 5) {
    const avg = ms => Math.round(ms / time.n);
    const msg = `장당 평균: 압축 ${avg(time.compress)}ms, 업로드 ${avg(time.upload)}ms, 목록 저장 ${avg(time.save)}ms (동시 ${UPLOAD_PAR}개)`;
    console.info('[upload]', msg);
    toast(msg, 6000);
  }
  if (skipped) toast(`이미 있는 이미지 ${skipped}장은 건너뛰었어요`);
  if (newSets.size) toast(`새 세트 ${[...newSets].join(', ')}로 들어갔어요`, 4000);
  if (landed.length) {
    imgRecent = true;
    imgPage = 0;
    imgQuery = '';
    imgFilter = 'all';
  }
  renderImages();
  const guessed = landed.filter(x => x.guessed);
  if (guessed.length && !failed.length)
    openSheet(
      `<h3>이름으로 못 알아본 파일 ${guessed.length}장</h3><p class="muted upl-lead">파일명이 <code>female3_smile.png</code>(세트_표정) 꼴이 아니라서 모양으로 추정했어요. 이미지 목록 맨 위에 있으니 종류, 세트, 표정을 바로 고칠 수 있어요.</p><div class="upl-list">${guessed.map(x => `<div class="upl-item">${esc(x.file)} → ${x.row.kind === 'char' ? `캐릭터 세트 <b>${esc(x.row.set)}</b> (표정 neutral)` : `배경 <b>${esc(x.row.name)}</b>`}</div>`).join('')}</div><div class="row actions"><button class="btn primary" data-close>확인</button></div>`,
    );
  if (failed.length)
    openSheet(
      `<h3>올리지 못한 파일 ${failed.length}개</h3><p class="muted upl-lead">같은 파일을 다시 선택하면 이미 올라간 것은 건너뛰고 이것들만 다시 시도해요.</p><div class="upl-failed">${failed.map(([f, r]) => esc(f) + '  -  ' + esc(r)).join('\n')}</div><div class="row actions"><button class="btn" data-close>닫기</button></div>`,
    );
}
function askText(title, value = '') {
  const answer = openDialog(
    `<p class="dlg-msg">${esc(title)}</p><input id="dlgTx" value="${esc(value)}" maxlength="30" class="dlg-input"><div class="row actions"><button class="btn primary" id="dlgOk">확인</button><button class="btn ghost" id="dlgNo">취소</button></div>`,
  );
  const tx = $('#dlgTx');
  tx.focus();
  tx.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#dlgOk').click();
    }
  };
  $('#dlgOk').onclick = () => answerDialog(tx.value.trim() || null);
  $('#dlgNo').onclick = () => answerDialog(null);
  return answer;
}
async function renameSet(oldK) {
  // a set key is what saves point at, so the current save follows; other saves keep the old key and lose that face
  const nk = await askText(
    `세트 "${oldK}"의 새 이름 (영문, 숫자, _ -)`,
    KEY_RE.test(oldK) ? oldK : nextSetKey((app.setMeta[oldK] || {}).gender || genderOf(oldK) || 'other'),
  );
  if (!nk || nk === oldK) return;
  const key = nk.replace(/\s+/g, '_');
  if (!KEY_RE.test(key)) {
    toast('세트 이름은 영문, 숫자, _ - 만 돼요. 한글 이름은 세트 카드의 고정 이름 칸에 적어 주세요', 5000);
    return;
  }
  if (charSetsAll()[key]) {
    toast('이미 있는 세트 이름이에요');
    return;
  }
  const imgs = charSetsAll()[oldK] || [];
  for (const x of imgs) {
    x.set = key;
    x.name = `${key}_${x.emotion || 'neutral'}${x.variant ? '_' + x.variant : ''}`;
  }
  const m = app.setMeta[oldK];
  if (m) {
    app.setMeta[key] = m;
    delete app.setMeta[oldK];
  }
  try {
    await IMGX.flush(imgs.map(x => x.id));
    if (m) {
      await SETDOC(key).set(m);
      await SETDOC(oldK)
        .delete()
        .catch(e => noteIgnored('images-view: SETDOC.delete', e));
    }
  } catch (e) {
    toast('저장 실패: ' + (e.code || e.message));
    return;
  }
  if (app.state) {
    let ch = false;
    for (const [n, k] of Object.entries(app.state.cast || {}))
      if (k === oldK) {
        app.state.cast[n] = key;
        ch = true;
      }
    for (const d of Object.values(app.state.deadNpc || {}))
      if (d.set === oldK) {
        d.set = key;
        ch = true;
      }
    if (ch) await persist();
  }
  toast(`${oldK} → ${key}: 프레임 ${imgs.length}장 이름을 바꿨어요`, 4000);
  renderImages();
}
async function idTagsFromDesc() {
  // the descriptions already say "사천당가 소저": lift what each set belongs to into identity tags, reviewed before it lands
  const ks = Object.keys(charSetsAll()).filter(k => {
    const m = app.setMeta[k] || {};
    return m.role && !setIds(k).length;
  });
  if (!ks.length) {
    toast('소속을 뽑을 설명이 없어요 (설명이 있고 정체 태그가 없는 세트)');
    return;
  }
  if (!platform.sample) {
    toast('Claude를 호출할 수 없어요');
    return;
  }
  if (
    !(await askConfirm(
      `설명은 있고 정체 태그는 없는 세트 ${ks.length}개에서 소속(문파, 가문, 국가, 회사...)을 뽑을까요? 가벼운 모델을 ${Math.ceil(ks.length / 25)}번 부르고, 적용 전에 목록을 보여줘요.`,
    ))
  )
    return;
  const found = [];
  for (let i = 0; i < ks.length; i += 25) {
    setStat(`소속 찾는 중 ${Math.min(i + 25, ks.length)}/${ks.length}`);
    const part = ks.slice(i, i + 25);
    try {
      const r = await platform.sample.json(
        `For each character description, list what the character belongs to (a sect, clan, house, nation, company, school, guild or unit) as "kind:name". kind is one short lowercase English word such as faction, house, nation, company, school, guild, unit; name is copied exactly as written in the description, in its own language, without any gloss in parentheses (e.g. "사천당가 소저, 암기를 다루는 여인" -> ["faction:사천당가"]). Give an empty array when the description names nothing they belong to. Reply with only a JSON array of arrays, same order.\n${JSON.stringify(part.map(k => app.setMeta[k].role))}`,
        { modelTier: 'quick' },
      );
      if (Array.isArray(r))
        part.forEach((k, j) => {
          const tags = (Array.isArray(r[j]) ? r[j] : [])
            .map(x => String(x).trim())
            .filter(isIdTag)
            .slice(0, 3);
          if (tags.length)
            found.push([k + (app.setMeta[k].charName ? ' (' + app.setMeta[k].charName + ')' : ''), tags.join(', '), k]);
        });
    } catch (e) {
      logErr('idtags', e);
    }
  }
  setStat('');
  if (!found.length) {
    toast('설명에서 소속을 찾지 못했어요');
    return;
  }
  const sel = await askReview(
    '세트별 소속 태그예요. 틀린 건 체크를 풀어 주세요.',
    found.map(([a, b]) => [a, b]),
  );
  if (!sel) return;
  const byLabel = new Map(found.map(([a, b, k]) => [a, k]));
  const touched = [];
  for (const [a, b] of sel) {
    const k = byLabel.get(a);
    const st2 = b
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    for (const x of charSetsAll()[k] || []) {
      x.tags = capTags([...st2, ...(x.tags || [])]);
      touched.push(x.id);
    }
  }
  try {
    await IMGX.flush(touched, (n, t) => {
      setStat(`저장 중 ${n}/${t}`);
    });
  } catch (e) {
    toast('저장 실패: ' + (e.code || e.message));
  }
  setStat('');
  toast(`세트 ${sel.length}개에 소속 태그 적용`, 4000);
  renderImages();
}
async function tagsToEnglish() {
  // one pass over the whole library: every non-English tag becomes its English matching key
  const uniq = [
    ...new Set(
      app.images
        .flatMap(x => x.tags || [])
        .map(t => String(t).trim())
        .filter(t => /[^\x00-\x7F]/.test(t) && !isIdTag(t)),
    ),
  ];
  const descSets = Object.keys(charSetsAll()).filter(k => {
    const m = app.setMeta[k] || {};
    return m.role && /[^\x00-\x7F]/.test(m.role) && !(m.kw && m.kw.length);
  });
  if (!uniq.length && !descSets.length) {
    toast('영어로 바꿀 태그나 설명이 없어요');
    return;
  }
  if (!platform.sample) {
    toast('Claude를 호출할 수 없어요');
    return;
  }
  if (
    !(await askConfirm(
      `태그 ${uniq.length}종류를 영어로 바꾸고, 한국어 설명이 있는 세트 ${descSets.length}개에서 영어 키워드를 뽑을까요? 가벼운 모델을 ${Math.ceil(uniq.length / 60) + Math.ceil(descSets.length / 25)}번 불러요.`,
    ))
  )
    return;
  const map = new Map();
  for (let i = 0; i < descSets.length; i += 25) {
    setStat(`설명 정리 중 ${Math.min(i + 25, descSets.length)}/${descSets.length}`);
    const part = descSets.slice(i, i + 25);
    try {
      const r = await platform.sample.json(
        `For each character description, give 3-6 short lowercase English keywords covering race, role, clothing or look, and vibe (e.g. "어둠의 마법을 다루는 엘프 귀족, 우아하고 도도한 분위기" -> ["elf","noble","dark mage","elegant","haughty"]). Reply with only a JSON array of arrays, same order.\n${JSON.stringify(part.map(k => app.setMeta[k].role))}`,
        { modelTier: 'quick' },
      );
      if (Array.isArray(r))
        await Promise.all(
          part.map(async (k, j) => {
            const kw = (Array.isArray(r[j]) ? r[j] : [])
              .map(x => String(x).toLowerCase().trim())
              .filter(x => x && !/[^\x00-\x7F]/.test(x))
              .slice(0, 6);
            if (!kw.length) return;
            app.setMeta[k].kw = kw;
            try {
              await SETDOC(k).set(app.setMeta[k]);
            } catch (e) {
              noteIgnored('set keywords: save the set card', e);
            }
          }),
        );
    } catch (e) {
      logErr('kw', e);
    }
  }
  for (let i = 0; i < uniq.length; i += 60) {
    setStat(`번역 중 ${Math.min(i + 60, uniq.length)}/${uniq.length}`);
    const part = uniq.slice(i, i + 60);
    const out = await toEnglishTags(part);
    part.forEach((t, j) => {
      const e = String(out[j] || '').trim();
      if (e && e !== t && !/[^\x00-\x7F]/.test(e)) map.set(t, e.toLowerCase());
    });
  }
  setStat('');
  if (map.size) {
    const sel = await askReview('번역 결과예요. 고유명사가 바뀌었으면 체크를 풀어 주세요 (풀린 건 그대로 남아요).', [
      ...map.entries(),
    ]);
    if (!sel) return;
    map.clear();
    for (const [a, b] of sel) map.set(a, b);
  }
  const touched = [];
  for (const x of app.images) {
    if (!x.tags || !x.tags.some(t => map.has(String(t).trim()))) continue;
    x.tags = capTags(x.tags.map(t => map.get(String(t).trim()) || t));
    touched.push(x.id);
  }
  try {
    await IMGX.flush(touched, (n, t) => {
      setStat(`저장 중 ${n}/${t}`);
    });
  } catch (e) {
    toast('저장 실패: ' + (e.code || e.message));
  }
  setStat('');
  toast(
    `${map.size}종류 번역, 이미지 ${touched.length}장 갱신${uniq.length - map.size ? `, 고유명사 등 ${uniq.length - map.size}종류는 그대로` : ''}`,
    5000,
  );
  renderImages();
}
export async function importTags(file) {
  if (!file) return;
  let j;
  try {
    j = JSON.parse(await file.text());
  } catch (e) {
    toast('JSON을 읽을 수 없어요');
    return;
  }
  const say = t => {
    setStat(t);
  };
  let ns = 0,
    nb = 0,
    ni = 0;
  const wl = m => {
    const a = Array.isArray(m.worlds) ? m.worlds : m.world && m.world !== 'any' ? [m.world] : [];
    return a.filter(x => WORLDS.some(w => w.id === x));
  };
  const byKey = new Map();
  for (const i of app.images) {
    for (const k of [i.file, i.name, 'bg_' + i.name, (i.file || '').replace(/\.[^.]+$/, '')])
      if (k && !byKey.has(k)) byKey.set(k, i);
  }
  const findImg = fn => byKey.get(fn) || byKey.get(fn.replace(/\.[^.]+$/, ''));
  const toTags = v =>
    Array.isArray(v)
      ? v.map(t => String(t).trim()).filter(Boolean)
      : String(v || '')
          .split(',')
          .map(t => t.trim())
          .filter(Boolean);
  // only sets that have pictures here are used; a set in the file with no pictures uploaded is ignored (it would only
  // leave an empty set card behind and use up a database document)
  const allSets = Object.entries(j.sets || {}),
    setEntries = allSets.filter(([k]) => charSetsAll()[k]),
    setTagsIn = {};
  const replaceTags = j.merge_tags !== true; // the file's tags win; "merge_tags": true keeps the old ones too
  const imgHit = Object.keys(j.images || {}).filter(fn => findImg(fn)).length,
    bgHit = Object.keys(j.backgrounds || {}).filter(fn => findImg(fn)).length,
    setHit = setEntries.length;
  if (!imgHit && !bgHit && !setHit) {
    toast('파일 이름이나 세트 이름이 목록과 하나도 맞지 않아요');
    return;
  }
  if (
    !(await askConfirm(
      `세트 ${setHit}/${allSets.length}개, 이미지 ${imgHit}/${Object.keys(j.images || {}).length}장, 배경 ${bgHit}/${Object.keys(j.backgrounds || {}).length}장에 적용해요.\n이미지 태그는 ${replaceTags ? '파일의 태그로 교체돼요 (기존 태그 삭제)' : '기존 태그와 합쳐져요 (merge_tags)'}. 진행할까요?`,
    ))
  )
    return;
  for (let i = 0; i < setEntries.length; i += 8) {
    say(`세트 저장 중 ${Math.min(i + 8, setEntries.length)}/${setEntries.length}`);
    await Promise.all(
      setEntries.slice(i, i + 8).map(async ([k, m]) => {
        const meta = {}; // only the fields present in the file; everything else is kept
        if (m.gender) meta.gender = m.gender;
        if ('worlds' in m || 'world' in m) {
          const ws = wl(m);
          setWorlds(meta, ws);
        }
        const role = [m.role, m.vibe, m.look].filter(Boolean).join(', ').slice(0, 120);
        if (role) meta.role = role;
        const nm = String(m.name || m.character || '')
          .trim()
          .slice(0, 20);
        if (nm) meta.charName = nm;
        {
          const st = toTags(m.tags);
          if (st.length) setTagsIn[k] = st;
        }
        if ([...TIERS_CAST, 'generic'].includes(String(m.tier || '').toLowerCase()))
          meta.tier = String(m.tier).toLowerCase();
        const al = (Array.isArray(m.aliases) ? m.aliases : String(m.aliases || '').split(','))
          .map(x => String(x).trim())
          .filter(Boolean)
          .slice(0, 6);
        if (al.length) meta.aliases = al;
        app.setMeta[k] = Object.assign({}, app.setMeta[k] || {}, meta);
        try {
          await SETDOC(k).set(app.setMeta[k]);
          ns++;
        } catch (e) {
          logErr('tags', e);
        }
      }),
    );
  }
  say('태그 적용 중');
  const touched = new Set();
  for (const [fn, m] of Object.entries(j.backgrounds || {})) {
    const x = findImg(fn);
    if (!x) continue;
    x.kind = 'scene';
    {
      const ws = wl(m);
      if (ws.length) setWorlds(x, ws);
    }
    x.tags = [
      ...new Set(
        [...(m.tags ? toTags(m.tags) : []), m.place, m.time, ...(m.mood ? toTags(m.mood) : [])].filter(Boolean),
      ),
    ].slice(0, 10);
    touched.add(x.id);
    nb++;
  }
  for (const [fn, m] of Object.entries(j.images || {})) {
    const x = findImg(fn);
    if (!x) continue;
    const t = toTags(m.tags || m);
    if (t.length) x.tags = capTags(replaceTags ? t : [...(x.tags || []), ...t]);
    {
      const ws = wl(m);
      if (ws.length) setWorlds(x, ws);
    }
    if (m.emotion && EMOS.includes(m.emotion)) x.emotion = m.emotion;
    touched.add(x.id);
    ni++;
  }
  // a set's own tags go on every frame of that set; in replace mode a frame the file does not list keeps only them
  let nst = 0;
  for (const [k, st] of Object.entries(setTagsIn)) {
    for (const x of app.images) {
      if (x.kind !== 'char' || (x.set || x.name) !== k) continue;
      const own = replaceTags && !touched.has(x.id) ? [] : x.tags || [];
      x.tags = capTags([...st, ...own]);
      touched.add(x.id);
      nst++;
    }
  }
  try {
    await IMGX.flush([...touched], (n, t) => say(`이미지 목록 저장 중 ${n}/${t}`));
  } catch (e) {
    toast('저장 실패: ' + (e.code || e.message), 5000);
  }
  say('');
  const miss = Object.keys(j.backgrounds || {}).length + Object.keys(j.images || {}).length - nb - ni;
  toast(
    `세트 ${ns}개, 배경 ${nb}개, 이미지 태그 ${ni}개${nst ? `, 세트 태그를 받은 프레임 ${nst}장` : ''} 적용됨${miss > 0 ? `, 못 찾은 파일 ${miss}개` : ''}`,
    5000,
  );
  renderImages();
}
async function wipeAllImages() {
  try {
    await wipeAllImagesInner();
  } catch (e) {
    toast('오류: ' + ((e && (e.code || e.message)) || e), 5000);
  }
}
// delete one stored file; a failed delete is tried again twice, then skipped
async function deleteAsset(id) {
  for (let i = 0; ; i++) {
    try {
      await platform.assets.delete(id);
      return;
    } catch (e) {
      if (i >= 2) {
        noteIgnored('delete asset', e);
        return;
      }
      await wait(500 * 2 ** i);
    }
  }
}
async function wipeAllImagesInner() {
  let list = [];
  try {
    list = (await platform.assets.list()).assets;
  } catch (e) {
    toast('에셋 목록을 읽을 수 없어요: ' + (e.code || e.message));
    return;
  }
  const total = list.length;
  if (!total && !app.images.length) {
    toast('지울 이미지가 없어요');
    return;
  }
  if (!(await askConfirm(`저장소의 이미지 ${total}장과 목록을 모두 지울까요? 되돌릴 수 없습니다.`))) return;
  if ((await askPrompt(`확인을 위해 ${total} 을 입력하세요`)) !== String(total)) return;
  let n = 0;
  await inParallel(list, 6, async a => {
    setStat(`${++n}/${total} 삭제 중`);
    await deleteAsset(a.id);
  });
  await IMGX.clear().catch(e => noteIgnored('images-view: IMGX.clear', e));
  await inParallel(Object.keys(app.setMeta), 8, k =>
    SETDOC(k)
      .delete()
      .catch(e => noteIgnored('images-view: SETDOC.delete', e)),
  );
  app.images = [];
  app.setMeta = {};
  app.settings.dupMap = {};
  await saveSettings();
  setStat('');
  toast('모두 지웠어요. 이제 새로 올리세요');
  renderImages();
}
async function saveManifest() {
  let n = 0;
  for (const x of app.images) {
    if (!x.shash) {
      setStat(`${++n} 해시 계산 중`);
      try {
        x.shash = await sha256Hex(await (await fetch(imgUrl(x.id))).blob());
        await IMGDOC(x.id).set(x);
      } catch (e) {
        noteIgnored('image hash backfill', e);
      }
    }
  }
  const items = app.images.map(x => ({
    shash: x.shash,
    hash: x.hash,
    file: x.file,
    kind: x.kind,
    set: x.set,
    emotion: x.emotion,
    name: x.name,
    tags: x.tags || [],
    worlds: x.worlds || [],
    world: x.world || 'any',
    variant: x.variant || '',
  }));
  const data = { kind: 'dice-roguelife-manifest', v: 1, createdAt: nowIso(), items, sets: app.setMeta };
  try {
    const old = await findManifestAsset();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    await platform.assets.upload(blob, { type: 'application/json' });
    if (old) await platform.assets.delete(old.asset.id).catch(e => noteIgnored('images-view: ASSETS.delete', e));
    setStat('');
    toast(`복제용 목록 저장됨 (${items.length}장)`);
  } catch (e) {
    setStat('');
    toast('저장 실패: ' + (e.code || e.message));
  }
}
async function recoverImages() {
  const m = await findManifestAsset();
  if (m) {
    const hit = await restoreFromManifest(m.data, t => setStat(t));
    if (hit) {
      toast(`목록 ${hit}장을 복제용 목록에서 복원했어요`);
      renderImages();
      return;
    }
  }
  let list;
  try {
    list = (await platform.assets.list()).assets;
  } catch (e) {
    toast('에셋 목록을 읽을 수 없어요');
    return;
  }
  const missing = list.filter(a => !app.images.some(x => x.id === a.id) && /^image\//.test(a.contentType || ''));
  if (!missing.length) {
    toast('복구할 항목이 없어요');
    return;
  }
  let n = 0;
  for (const a of missing) {
    setStat(`${++n}/${missing.length} 복구 중`);
    let portrait = false;
    try {
      const bmp = await createImageBitmap(await (await fetch(a.url || imgUrl(a.id))).blob());
      portrait = bmp.height > bmp.width * 1.1;
    } catch {
      // shape unknown: treated as a landscape picture
    }
    const row = {
      id: a.id,
      kind: portrait ? 'char' : 'scene',
      set: portrait ? 'set' + String(n).padStart(3, '0') : '',
      emotion: 'neutral',
      name: (portrait ? 'char' : 'bg') + String(n).padStart(3, '0'),
      world: 'any',
      tags: [],
      createdAt: a.createdAt || nowIso(),
      recovered: true,
    };
    try {
      await IMGDOC(a.id).set(row);
      app.images.push(row);
    } catch (e) {
      toast('저장 실패: ' + (e.code || e.message));
      break;
    }
  }
  setStat('');
  toast(`${n}장 복구했어요. 자동 분류로 태그를 달아 주세요`);
  renderImages();
}
// the hash of each stored file: a row saved by an older version has none, and the skip check and the dedupe need it
async function fillHashes(say, label) {
  const todo = app.images.filter(x => !x.shash);
  let n = 0;
  for (const x of todo) {
    say(`${++n}/${todo.length} ${label}`);
    try {
      x.shash = await sha256Hex(await (await fetch(imgUrl(x.id))).blob());
    } catch (e) {
      noteIgnored('image hash backfill', e);
    }
  }
  const ok = todo.filter(x => x.shash).map(x => x.id);
  if (ok.length) await IMGX.flush(ok, (i, t) => say(`저장 중 ${i}/${t}`));
}
const imgLabel = x => (x.file && x.file !== x.name ? `${x.name} [${x.file}]` : x.name || x.file || x.id);
const byOldest = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
async function dedupeImages() {
  const say = t => {
    setStat(t);
  };
  await fillHashes(say, '검사 중');
  // 1) the very same stored file
  const groups = {};
  for (const x of app.images) {
    const k = x.shash || 'file:' + (x.file || x.name);
    (groups[k] = groups[k] || []).push(x);
  }
  const dups = [];
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    g.sort(byOldest);
    for (const d of g.slice(1)) dups.push([d, g[0], '같은 파일']);
  }
  // 2) the same picture stored again (compressed once more, renamed): compare how they look
  const gone = new Set(dups.map(([d]) => d.id));
  const left = app.images.filter(x => !gone.has(x.id));
  const items = [],
    sigs = [];
  const queue = [...left];
  let n = 0;
  const worker = async () => {
    while (queue.length) {
      const x = queue.shift();
      say(`${++n}/${left.length} 모양 비교 중`);
      try {
        sigs.push(await visualSig(await (await fetch(imgUrl(x.id))).blob()));
        items.push(x);
      } catch (e) {
        noteIgnored('dedupe images: look', e);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const g of groupSimilar(sigs)) {
    const xs = g.map(i => items[i]).sort(byOldest);
    for (const d of xs.slice(1)) dups.push([d, xs[0], '같은 그림']);
  }
  say('');
  if (!dups.length) {
    toast('중복 이미지가 없어요');
    return;
  }
  const pairs = dups.map(([d, , why]) => [`${imgLabel(d)} (${why})`, '']);
  dups.forEach(([, keep], i) => (pairs[i][1] = imgLabel(keep)));
  const sel = await askReview(
    `같은 이미지 ${dups.length}장을 찾았어요. 지우지 않을 것은 체크를 풀어 주세요. 먼저 올린 쪽(→ 뒤)을 남기고, 지난 기록의 이미지는 남은 쪽으로 연결돼요.`,
    pairs,
  );
  if (!sel || !sel.length) return;
  const chosen = dups.filter((_, i) => sel.includes(pairs[i]));
  app.settings.dupMap = app.settings.dupMap || {};
  const redirect = new Map(chosen.map(([d, keep]) => [d.id, keep.id]));
  const final = id => {
    let t = id;
    for (let i = 0; i < 20 && redirect.has(t); i++) t = redirect.get(t);
    return t;
  };
  let done = 0;
  await inParallel(chosen, 6, async ([d]) => {
    say(`${++done}/${chosen.length} 정리 중`);
    await deleteAsset(d.id);
    app.settings.dupMap[d.id] = final(d.id);
  });
  const removed = new Set(chosen.map(([d]) => d.id));
  app.images = app.images.filter(i => !removed.has(i.id));
  await IMGX.dropMany([...removed]).catch(e => noteIgnored('images-view: IMGX.dropMany', e));
  for (const [a, b] of Object.entries(app.settings.dupMap)) if (redirect.has(b)) app.settings.dupMap[a] = final(b);
  await saveSettings();
  say('');
  toast(`${done}장 정리했어요`);
  renderImages();
}
// asks a quick model what each untagged picture is; effect pictures (kind fx, e.g. the dice reveal) keep their kind
async function autoTagAll() {
  const todo = app.images.filter(x => !x.autoTagged && x.kind !== 'fx');
  if (!todo.length) {
    toast('자동 분류할 이미지가 없어요');
    return;
  }
  let n = 0;
  for (const x of todo) {
    setStat(`${++n}/${todo.length} 분류 중`);
    try {
      const blob = await (await fetch(imgUrl(x.id))).blob();
      const r = await platform.sample.json(fillTemplate(prompts.autotag, { emos: EMOS.join('|') }), {
        images: blob,
        modelTier: 'quick',
        cache: false,
      });
      if (r) {
        x.kind = r.kind === 'scene' ? 'scene' : 'char';
        if (x.kind === 'char') {
          x.emotion = EMOS.includes(r.emotion) ? r.emotion : x.emotion || 'neutral';
          x.set = x.set || x.name;
        } else {
          if (r.place)
            x.name =
              String(r.place)
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '')
                .slice(0, 40) || x.name;
          const ws = (Array.isArray(r.worlds) ? r.worlds : []).filter(v => WORLDS.some(w => w.id === v));
          setWorlds(x, ws);
        }
        if (Array.isArray(r.tags) && r.tags.length)
          x.tags = [...new Set([...(x.tags || []), ...r.tags.map(t => String(t).trim()).filter(Boolean)])].slice(0, 10);
        x.autoTagged = true;
        await IMGDOC(x.id).set(x);
      }
    } catch (e) {
      if (e.code === 'rate_limited') {
        toast('잠시 후 다시 시도하세요');
        break;
      }
      if (e.code === 'not_granted') {
        toast('Claude 사용 권한이 필요해요');
        break;
      }
    }
  }
  setStat('');
  renderImages();
}
