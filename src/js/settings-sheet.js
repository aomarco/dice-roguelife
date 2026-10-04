/* ============ settings sheet ============ */
import { host } from './host.js';
import { $, esc, IGNORED, noteIgnored, nowIso, toast } from './util.js';
import { platform } from './db.js';
import { app, APP_VERSION } from './app.js';
import { saveSettings, setting, SETTING_DEFAULTS } from './settings.js';
import { ERRLOG } from './diag.js';
import { growthLevel, lifeDiff, rule } from './rules.js';
import { closeSheet, openSheet } from './sheet.js';
import { applyDiscreet, showTab } from './shell.js';
import { audioInit, cueSkill } from './sound.js';
import { charSets } from './images.js';
import { renderStrip } from './status.js';
import { captureWords, maskNames, renderLog } from './log.js';
import { applyEnterHint, enterPref, setEnterPref, syncEnterTog } from './composer.js';
import { openUpdateSheet } from './update.js';
import { ADMIN_PERSONAS, promptStats, recentBudget, recentLine } from './prompt.js';

// The ⚙ sheet. Most controls edit one key of app.settings (PLAIN_SETTINGS below); the rest are the model tier check,
// the Enter key (kept per browser), capture mode, and read-only notes: the rules frozen into the open save, the
// prompt size, the growth speed in effect, diagnostics and the recent errors.
let lastTierCheck = null; // what the platform actually served for the tier we asked (a plan may substitute a cheaper one)

export function openSettingsSheet() {
  openSheet(
    `<h3>설정</h3>${settingsHtml()}<div class="row settings-actions"><button class="btn" data-close>닫기</button></div>`,
  );
  bindSettings($('#sheetInner'));
}
function settingsHtml() {
  return `<div class="row verrow"><span class="muted">버전 v${esc(APP_VERSION)}</span><button class="btn ghost" id="updBtn" type="button">업데이트 확인</button></div>
    <div class="row"><div class="field grow"><label for="tierSel">서술 모델</label><select id="tierSel"><option value="quick">빠름 (quick)</option><option value="default">기본 (default)</option><option value="complex">깊이 있게 (complex)</option></select></div>
    <div class="field grow"><label for="lenSel">서술 분량</label><select id="lenSel"><option value="short">짧게</option><option value="normal">모델에 맡김</option><option value="long">길게</option></select></div></div>
    <p class="muted tier-probe"><span id="tierProbe">${lastTierCheck ? `마지막 확인: ${lastTierCheck.asked} 요청 → <b>${lastTierCheck.applied}</b> 적용 (${lastTierCheck.at})` : '서술 모델은 플랜에 따라 낮은 티어로 대체될 수 있어요.'}</span><button class="btn ghost chip-sm" id="tierCheck">지금 확인</button></p>
    <div class="field recent-field"><label for="recentSel">최근 기억 (원문으로 넣는 분량, 그 이전은 요약)</label><select id="recentSel"><option value="20000">작게 (20KB)</option><option value="40000">보통 (40KB, 기본)</option><option value="80000">크게 (80KB)</option><option value="150000">아주 크게 (150KB)</option></select><p class="muted recent-note"><span id="recentNow">${recentLine()}</span>턴이 짧으면 더 많은 턴이, 길면 적은 턴이 들어가요. 150KB면 응답이 느려지고 한도에 걸릴 수 있어요.</p></div>
    <div class="row lang-row"><div class="field grow"><label for="langSel">플레이 언어</label><select id="langSel"><option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option></select></div>
    <label class="row opt lang-tip"><input type="checkbox" id="langTip"> 내 입력 문장 교정 보기</label></div>
    <label class="row opt settings-opt"><input type="checkbox" id="discreet"> 은밀 모드: 제목이 Claude로 바뀌고 이미지, 상태창, 색, 소리를 숨겨요 (제목 세 번 탭으로도 전환)</label>
    <div id="discreetNav" class="row discreet-nav hidden"><button class="btn" data-go="play">플레이</button><button class="btn" data-go="saves">저장</button><button class="btn" data-go="memory">기억</button><button class="btn" data-go="images">이미지</button><button class="btn" data-go="hall">전당</button></div>
    <div class="field settings-field"><label for="adminSel">ADMIN 페르소나</label><select id="adminSel">${Object.entries(
      ADMIN_PERSONAS(),
    )
      .map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`)
      .join('')}</select></div>
    <div class="field admin-custom hidden" id="adminCustomBox"><label for="adminCustom">ADMIN 설명 (직접 입력)</label><textarea id="adminCustom" rows="4" maxlength="600" placeholder="예: ADMIN은 은퇴한 마왕이다. 플레이어를 '후계자 후보'라 부르며...">${esc(app.settings.adminCustom || '')}</textarea></div>
    <div class="field settings-field"><label for="enterSel">엔터 키 (이 브라우저에만 저장)</label><select id="enterSel"><option value="auto">자동 (PC는 보내기, 폰은 줄바꿈)</option><option value="always">엔터로 보내기, Shift+Enter 줄바꿈</option><option value="never">엔터는 줄바꿈, Shift+Enter로 보내기</option></select></div>
    <label class="row opt settings-opt after-field"><input type="checkbox" id="knowGuard"> 외부 지식 억제: 현실, 전생, 캐릭터 출신 세계의 지식이 한 번에 힘이나 돈이 되지 않고, 약할 때는 벽에 막히다가 성장할수록 풀려요</label>
    <label class="row opt settings-opt after-field"><input type="checkbox" id="gambler"> 도박꾼의 초석: 매 턴 잭팟(무조건 성공+큰 보상) 또는 나락(무조건 실패+큰 페널티)이 뜰 수 있어요</label>
    <div class="field gambler-odds"><label for="gamblerP">잭팟, 나락 각각의 확률</label><select id="gamblerP"><option value="0.1">10%씩 (둘 합쳐 20%)</option><option value="0.15">15%씩 (둘 합쳐 30%)</option><option value="0.25">25%씩 (둘 합쳐 50%)</option></select></div>
    <div class="field cap-box">
      <label class="row opt"><input type="checkbox" id="capOn"> 캡처 모드: 화면에서만 이름을 가려요 (기록은 그대로)</label>
      <div class="row cap-row"><select id="capMode"><option value="blur">모자이크</option><option value="alias">다른 이름으로</option></select><input id="capAlias" placeholder="{user}" maxlength="12" class="cap-alias"></div>
      <input id="capWords" placeholder="가릴 단어 (쉼표로). 비우면 캐릭터 이름 자동" class="cap-words">
    </div>
    <div class="field settings-field"><label for="statusSel">상태창 공개</label><select id="statusSel"><option value="auto">자동: 시스템이 있는 세계는 각성 후 공개</option><option value="always">항상 공개</option><option value="awaken">모든 세계에서 각성 후 공개</option><option value="never">숨김: 각성해도 숫자 없음, 서사로만</option></select></div>
    <div class="field settings-field"><label for="growthSel">성장 속도 (스탯을 얼마나 후하게 줄지)</label><select id="growthSel"><option value="auto">자동: 세계 난이도와 ADMIN 성격에 따라</option><option value="stingy">짠맛: 큰 계기에만, 같은 스탯은 8턴 쿨다운</option><option value="normal">보통</option><option value="generous">후함: 상한 1.5배</option></select><p class="muted field-note" id="growthNow"></p></div>
    <div class="field settings-field near"><label for="questSel">의뢰 스타일</label><select id="questSel"><option value="board">길드 게시판 (나무판에 종이)</option><option value="ui">게임 퀘스트 창 (다크, 금테)</option></select></div>
    <div class="field settings-field near"><label for="newsSel">뉴스 스타일</label><select id="newsSel"><option value="broadcast">방송 뉴스 (남색 헤더)</option><option value="paper">종이 신문 (세리프)</option></select></div>
    <label class="row opt settings-opt"><input type="checkbox" id="wdark"> 톡, 게시판 위젯도 다크 모드로 (기본은 카톡 노랑, 갤 흰색)</label>
    <label class="row opt settings-opt"><input type="checkbox" id="soundOn"> 효과음 (운명 공개, 경지 상승과 칭호 팡파레, 스킬, 아이템과 소지금, 의뢰 완료, 사망, 결산)</label>
    <details class="diag-box"><summary class="muted">진단</summary><div id="diag" class="muted diag-body">확인 중...</div></details>
    <details class="diag-box"><summary class="muted">최근 오류 ${ERRLOG.length ? `(${ERRLOG.length})` : ''}</summary><div class="diag-body diag-log">${ERRLOG.map(e => `[${e.t}] ${e.stage} ${e.code} ${esc(e.msg)}${e.text ? '\n  → ' + esc(e.text) : ''}`).join('\n\n') || '없음'}</div></details>
    <details class="diag-box"><summary class="muted">넘어간 오류 ${IGNORED.length ? `(${IGNORED.length})` : ''}</summary><div class="diag-body diag-log">${IGNORED.map(e => `[${e.t}] ${esc(e.where)}: ${esc(e.msg)}`).join('\n') || '없음'}</div></details>
    <p class="muted settings-help">서술 모델: 빠름은 가볍고 빠르게, 깊이 있게는 가장 강한 모델로 씁니다.<br>서술 분량: 기본은 모델이 알아서 정해요.<br>플레이 언어: 서술, 대사, 선택지, 위젯이 모두 이 언어로 나와요.<br>입력 문장 교정: 내가 쓴 문장의 맞춤법과 문법을 한 줄로 고쳐 보여줘요 (한국어는 맞춤법과 띄어쓰기, 영어와 일본어는 문법과 어휘).<br>모두 다음 턴부터 적용돼요.</p>`;
}
async function runDiag(el) {
  const out = [];
  out.push(`버전: v${APP_VERSION}`);
  out.push(`호스트: ${host().id}`);
  out.push(`저장 경로: ${platform.userPath}`);
  out.push(
    `기능: db ${!!(platform.db && !platform.memMode)}, sample ${!!platform.sample}, assets ${!!platform.assets}, user ${!!platform.user}`,
  );
  out.push(
    `모드: ${platform.memMode ? '미리보기(저장 안 됨)' : platform.localMode ? '이 기기에만 저장' : '서버 저장'}`,
  );
  try {
    if (platform.user) {
      out.push(`소유자: ${await platform.user.isOwner()}`);
      out.push(`공유 데이터 쓰기: ${await platform.user.can('data.write')}`);
      out.push(`이미지 쓰기: ${await platform.user.can('assets.write')}`);
    } else out.push('사용자 정보 없음');
  } catch (e) {
    out.push('권한 확인 실패: ' + (e.code || e.message));
  }
  try {
    await platform.shared.doc('images/_probe').set({ t: nowIso() });
    await platform.shared.doc('images/_probe').delete();
    out.push('이미지 목록 쓰기: 성공');
  } catch (e) {
    out.push('이미지 목록 쓰기: 실패 (' + (e.code || e.message) + ')');
  }
  try {
    await platform.shared.doc('sets/_probe').set({ t: nowIso() });
    await platform.shared.doc('sets/_probe').delete();
    out.push('세트 쓰기: 성공');
  } catch (e) {
    out.push('세트 쓰기: 실패 (' + (e.code || e.message) + ')');
  }
  out.push(
    `이미지 ${app.images.length}장, 세트 ${Object.keys(charSets()).length}개, 세트 정보 ${Object.keys(app.setMeta).length}개`,
  );
  if (el) el.textContent = out.join('\n');
}

// One control per setting. The control shows the stored value (or its default, settings.js), unless `show` says
// otherwise, and `parse` turns what the control holds back into the stored value.
// `apply` runs right after the change (before the save), and `saved` is the toast once it is saved.
const NEXT_TURN = '저장됨. 다음 턴부터';
const redrawLog = () => {
  if (app.state) renderLog('keep');
};
const PLAIN_SETTINGS = [
  { id: 'tierSel', key: 'tier', saved: '저장됨' },
  { id: 'lenSel', key: 'len', saved: '저장됨' },
  {
    id: 'recentSel',
    key: 'recentBytes',
    show: () => recentBudget(),
    parse: Number,
    apply: q => showRecentNow(q),
    saved: NEXT_TURN,
  },
  { id: 'langSel', key: 'lang', saved: '저장됨. 다음 턴부터 적용' },
  { id: 'langTip', key: 'langTip' },
  {
    id: 'discreet',
    key: 'discreet',
    apply: () => {
      applyDiscreet();
      if (app.state) renderLog();
    },
  },
  {
    id: 'adminSel',
    key: 'adminPersona',
    apply: q => {
      showAdminCustom(q);
      showGrowthNow(q);
    },
    saved: NEXT_TURN,
  },
  { id: 'adminCustom', key: 'adminCustom', show: v => v || '', parse: v => v.trim(), saved: '저장됨' },
  { id: 'knowGuard', key: 'knowledgeGuard', show: v => v !== false, saved: NEXT_TURN },
  { id: 'gambler', key: 'gambler', saved: v => (v ? '도박꾼의 초석 켬. 다음 턴부터' : '도박꾼의 초석 끔') },
  { id: 'gamblerP', key: 'gamblerP', parse: Number },
  {
    id: 'statusSel',
    key: 'statusMode',
    apply: () => {
      renderStrip();
      redrawLog();
    },
  },
  { id: 'growthSel', key: 'growth', apply: q => showGrowthNow(q), saved: NEXT_TURN },
  {
    id: 'questSel',
    key: 'questStyle',
    apply: redrawLog,
    saved: '저장됨',
  },
  {
    id: 'newsSel',
    key: 'newsStyle',
    apply: redrawLog,
    saved: '저장됨',
  },
  { id: 'wdark', key: 'wdark', apply: () => applyDiscreet() },
  {
    id: 'soundOn',
    key: 'sound',
    show: v => v !== false,
    apply: (q, on) => {
      if (!on) return;
      audioInit(); // inside the tap, so the browser lets the sound start
      setTimeout(cueSkill, 50);
    },
  },
];

function bindSettings(root) {
  const q = id => root.querySelector('#' + id);
  for (const c of PLAIN_SETTINGS) bindPlainSetting(q, c);
  showAdminCustom(q);
  bindTierCheck(q);
  bindDiscreetNav(q);
  bindEnterKey(q);
  bindCapture(q);
  noteFrozenRules(q);
  notePromptSize(q);
  showGrowthNow(q);
  q('updBtn').onclick = openUpdateSheet;
  runDiag(q('diag'));
}
function bindPlainSetting(q, { id, key, show, parse, apply, saved }) {
  const el = q(id);
  const box = el.type === 'checkbox';
  const shown = show ? show(app.settings[key]) : key in SETTING_DEFAULTS ? setting(key) : app.settings[key];
  if (box) el.checked = !!shown;
  else el.value = String(shown ?? '');
  el.onchange = async () => {
    const v = box ? el.checked : parse ? parse(el.value) : el.value;
    app.settings[key] = v;
    if (apply) apply(q, v);
    try {
      await saveSettings();
    } catch (e) {
      toast('저장 실패: ' + (e.code || e.message));
      return;
    }
    const msg = typeof saved === 'function' ? saved(v) : saved;
    if (msg) toast(msg);
  };
}
function showAdminCustom(q) {
  q('adminCustomBox').classList.toggle('hidden', app.settings.adminPersona !== 'custom');
}
function showRecentNow(q) {
  const now = q('recentNow');
  if (now && app.state) now.textContent = recentLine();
}
function showGrowthNow(q) {
  const el = q('growthNow');
  if (!el) return;
  const L = growthLevel();
  el.textContent = app.state
    ? `지금 이 삶에선: ${L.name} (이번 삶 난이도 ${'★'.repeat(lifeDiff())}, ADMIN ${(ADMIN_PERSONAS()[setting('adminPersona')] || {}).name || ''})`
    : '';
}
// asks for the chosen tier once and shows which tier the platform actually used
function bindTierCheck(q) {
  q('tierCheck').onclick = async () => {
    if (!platform.sample) {
      toast('Claude를 호출할 수 없어요');
      return;
    }
    const b = q('tierCheck');
    b.disabled = true;
    b.textContent = '확인 중';
    try {
      const asked = setting('tier');
      const r = await platform.sample('Reply with the single word ok.', { modelTier: asked, cache: false });
      lastTierCheck = { asked, applied: (r && r.modelTierApplied) || '?', at: new Date().toLocaleTimeString() };
      q('tierProbe').innerHTML =
        `마지막 확인: ${lastTierCheck.asked} 요청 → <b>${esc(lastTierCheck.applied)}</b> 적용 (${lastTierCheck.at})`;
      toast(`${lastTierCheck.asked} 요청 → ${lastTierCheck.applied} 적용`);
    } catch (e) {
      toast('확인 실패: ' + (e.code || e.message));
    }
    b.disabled = false;
    b.textContent = '지금 확인';
  };
}
// in discreet mode the tab bar is hidden, so the sheet offers the tabs
function bindDiscreetNav(q) {
  const dn = q('discreetNav');
  if (!dn) return;
  dn.classList.toggle('hidden', !app.settings.discreet);
  dn.querySelectorAll('[data-go]').forEach(
    b =>
      (b.onclick = () => {
        closeSheet();
        showTab(b.dataset.go);
      }),
  );
}
function bindEnterKey(q) {
  q('enterSel').value = enterPref() || 'auto';
  q('enterSel').onchange = e => {
    setEnterPref(e.target.value === 'auto' ? null : e.target.value);
    applyEnterHint();
    syncEnterTog();
  };
}
// capture mode masks names on screen only: on/off, blur or an alias, and which words
function bindCapture(q) {
  const c = (app.settings.capture = app.settings.capture || {});
  q('capOn').checked = !!c.on;
  q('capMode').value = c.mode || 'blur';
  q('capAlias').value = c.alias || '';
  q('capWords').value = c.words || '';
  q('capWords').placeholder = `가릴 단어 (쉼표로). 비우면 캐릭터 이름 자동 (${captureWords().length}개)`;
  const save = async () => {
    c.on = q('capOn').checked;
    c.mode = q('capMode').value;
    c.alias = q('capAlias').value.trim();
    c.words = q('capWords').value;
    await saveSettings().catch(e => noteIgnored('settings: dset capture', e));
    if (!c.on || c.mode) {
      if (app.state) {
        renderLog('keep');
        renderStrip();
      }
      maskNames(document.body);
    }
  };
  for (const id of ['capOn', 'capMode', 'capAlias', 'capWords']) q(id).onchange = save;
}
// the rules a save froze when it started: changing the control only affects new saves, so say what this one uses
function noteFrozenRules(q) {
  if (!app.state) return;
  const FROZEN = {
    growth: ['growthSel', v => ({ auto: '자동', stingy: '짠맛', normal: '보통', generous: '후함' })[v || 'auto']],
    knowledgeGuard: ['knowGuard', v => (v === false ? '끔' : '켬')],
    gambler: ['gambler', v => (v ? '켬 (' + Math.round((Number(rule('gamblerP')) || 0.15) * 100) + '%)' : '끔')],
  };
  for (const [k, [id, label]] of Object.entries(FROZEN)) {
    const el = q(id);
    if (!el) continue;
    const host = el.closest('label,.field') || el.parentElement;
    const n = document.createElement('p');
    n.className = 'muted frozen-note';
    n.textContent = `지금 저장: ${label(rule(k))} (시작 때 고정, 바꾸면 새 저장부터)`;
    host.after(n);
  }
}
function notePromptSize(q) {
  const el = document.createElement('p');
  el.className = 'muted prompt-size';
  const n = promptStats.length;
  el.textContent = n
    ? `프롬프트 크기: 최근 턴 약 ${promptStats[n - 1].toLocaleString()}토큰, 최근 ${n}턴 평균 약 ${Math.round(promptStats.reduce((a, b) => a + b, 0) / n).toLocaleString()}토큰 (추정)`
    : '프롬프트 크기: 이번 접속에서 아직 턴이 없어요';
  q('growthSel').closest('.field').after(el);
}
