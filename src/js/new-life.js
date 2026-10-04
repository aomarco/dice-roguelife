/* ============ new life ============ */
import { $, clone, esc, noteIgnored, nowIso, pick, rnd, toast, uid } from './util.js';
import {
  BASE,
  currencyOf,
  ENTRY_NAME,
  initMurim,
  ORIGINS,
  RACES,
  rollEntry,
  rollSponsor,
  rollSubStats,
  rollTier,
  TALENTS,
  TIER_P,
  tierRank,
  TIERS,
  TRANSFER_RACES,
  WORLDS,
} from './data.js';
import { isPrivileged, platform } from './db.js';
import { NEW_SAVES, turnStore } from './turn-store.js';
import { app, exclusive } from './app.js';
import { saveSettings, setting } from './settings.js';
import { snapshotRules } from './rules.js';
import { showTab } from './shell.js';
import { cueBlip, cueReveal } from './sound.js';
import { ensureSample } from './boot.js';
import { liveWorldIds } from './images.js';
import { leaveOpenSave, pushTurn, showPlay } from './persistence.js';
import { lifeExtra, runTurn } from './turn.js';
import { fillTemplate, prompts } from './prompt.js';

const TALENT_MAX = 5;
let tierLocked = false;
// free setup for players without owner rights stops at C
function lockTierSel(sel) {
  if (!sel) return;
  [...sel.options].forEach(o => {
    o.setAttribute('value', o.value);
    if (tierRank(o.value) < tierRank('C')) {
      o.disabled = true;
      o.textContent = o.value + ' (잠김)';
    }
  });
  sel.value = 'C';
}
const talentRow = first =>
  `<div class="trow"><div class="row talent-row"><select class="tt" aria-label="재능 등급">${TIERS.map(t => `<option ${t === 'C' ? 'selected' : ''}>${t}</option>`).join('')}</select><input class="tn grow" maxlength="30" placeholder="${first ? '예: 검에 대한 집착' : '재능 이름'}">${first ? '' : '<button type="button" class="tx" aria-label="이 재능 지우기">×</button>'}</div><input class="td talent-desc" maxlength="80" placeholder="한 줄 효과"></div>`;
export function startNewLifeForm(inherit) {
  tierLocked = false;
  if (!inherit) {
    leaveOpenSave(); // a new game leaves the open save; a regression continues it
    app.currentSave = null;
  }
  $('#strip').classList.add('hidden');
  $('#composer').classList.add('hidden');
  const log = $('#log');
  const sel = { world: 'random', gender: '남', mode: 'gacha' }; // the form's choices
  log.innerHTML = newLifeHtml(inherit);
  bindChoice(log, '#gseg', 'g', v => (sel.gender = v));
  bindChoice(log, '#wseg', 'w', v => (sel.world = v));
  bindChoice(log, '#spseg', 'sp', v => (sel.sponsor = v));
  bindChoice(log, '#mseg', 'm', v => {
    sel.mode = v;
    $('#freeBox').classList.toggle('hidden', v !== 'free');
  });
  const ts = $('#toSaves');
  if (ts) ts.onclick = () => showTab('saves');
  bindTalentRows();
  lockFreeSetup(inherit);
  bindProfileCount();
  $('#rollBtn').onclick = () => rollFromForm(inherit, sel);
}
// a row of toggle buttons: pressing one marks it and reports its data-<key> value
function bindChoice(root, seg, key, onPick) {
  const buttons = root.querySelectorAll(seg + ' button');
  buttons.forEach(
    b =>
      (b.onclick = () => {
        onPick(b.dataset[key]);
        buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      }),
  );
}
function newLifeHtml(inherit) {
  const worlds = ['random', ...WORLDS.map(w => w.id)];
  return `<div class="newlife">
    <h2>${inherit ? '회귀' : '새로운 삶'}</h2>
    ${
      inherit
        ? ''
        : `<div class="sysmsg intro-head"><span>[ SYSTEM: 플레이어 등록 ]</span></div>
    <p class="narr intro-narr">영혼을 데이터로 바꿉니다. 세계도, 종족도, 신분도, 재능도 전부 운이 정합니다. 이 세계는 불공평하고, 잔혹하고, 지독하게 재밌을 겁니다. 죽으면 전생의 가장 특별했던 능력 하나를 들고 돌아옵니다.</p>`
    }
    <p class="muted intro-note">${inherit ? '전생의 기억 한 조각을 들고 다시 태어납니다. 세계와 신분은 다시 운에 맡겨집니다.' : '이름과 성별을 정하면 세계, 종족, 신분, 재능은 주사위가 정합니다. 결과는 되돌릴 수 없습니다.'}</p>
    ${
      inherit
        ? ''
        : `<div class="field"><label for="nm">이름</label><input id="nm" maxlength="20" placeholder="이름"></div>
    <div class="field"><label>성별</label><div class="seg" id="gseg">${['남', '여', '기타'].map(g => `<button type="button" data-g="${g}" aria-pressed="${g === '남'}">${g}</button>`).join('')}</div></div>`
    }
    <div class="field"><label for="prof">플레이어 설정 (선택): 외형, 성격, 말버릇, 배경 서사, 엽기 설정 무엇이든</label><textarea id="prof" rows="3" maxlength="600" placeholder="예: 전생에 편의점 야간 알바였고 라면에 집착한다. 말끝마다 '아니 근데'를 붙인다. 고양이를 보면 이성을 잃는다.">${esc(inherit ? app.state.life.profile || '' : app.settings.profile || '')}</textarea><div class="row profile-head"><label class="row profile-toggle"><input type="checkbox" id="profSave" checked> 다음 삶의 기본값으로 저장</label><span class="muted count-note" id="profCount"></span></div></div>
    <div class="field"><label>세계</label><div class="seg" id="wseg">${worlds.map(w => `<button type="button" data-w="${w}" aria-pressed="${w === 'random'}">${w === 'random' ? '무작위' : WORLDS.find(x => x.id === w).name}</button>`).join('')}</div></div>
    ${
      inherit
        ? ''
        : `<div class="field dm"><label class="row dm-head"><input type="checkbox" id="diceMode" ${app.settings.dice !== false ? 'checked' : ''}> 🎲 매 턴 운빨 적용 <span class="dm-tag">2d100 (선택지, 생활)</span></label>
      <div class="dm-desc">
        <p><b>켜면</b> <span class="dm-up">체감 난이도 ↑ 스릴 ↑</span></p>
        <p class="li">- <b>선택지 주사위</b>: 위험한 행동과 확률이 붙은 선택지의 성패</p>
        <p class="li">- <b>생활 주사위</b>: 행동과 상관없이 가끔 찾아오는 행운과 불운</p>
        <p class="li">- AI가 아니라 코드가 굴려서 결과가 한쪽으로 쏠리지 않아요</p>
        <p class="gap"><b>끄면</b> 편하게, 원하는 대로</p>
        <p class="li">- 주사위 없이 개연성만 따져 진행해요</p>
        <p class="li">- 그만큼 결과가 플레이어 쪽으로 조금 기울 수 있어요</p>
        <p class="gap muted">시작하면 이 저장 내내 고정돼요.</p>
      </div></div>`
    }
    <div class="field"><label>시작 방식</label><div class="seg" id="mseg"><button type="button" data-m="gacha" aria-pressed="true">운빨 (주사위)</button><button type="button" data-m="free" aria-pressed="false">자유 설정</button></div></div>
    <div id="freeBox" class="hidden free-box">
      <div class="field"><label for="fRace">종족</label><input id="fRace" maxlength="20" placeholder="비우면 무작위"></div>
      <div class="row"><div class="field talent-grade-field"><label for="fOT">신분 등급</label><select id="fOT">${TIERS.map(t => `<option ${t === 'C' ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="field grow"><label for="fOrigin">신분</label><input id="fOrigin" maxlength="30" placeholder="예: 화산파 말단 제자"></div></div>
      <div class="field"><label>재능 (등급, 이름, 한 줄 효과)</label><div id="talents">${talentRow(true)}</div><button type="button" class="btn ghost add-talent" id="addTalent">+ 재능 추가</button></div>
      <div class="field"><label for="fAge">시작 나이</label><input id="fAge" type="number" min="0" max="90" placeholder="비우면 무작위"></div>
      <div class="field"><label for="worldNote">세계관, 등장인물 (선택)</label><textarea id="worldNote" rows="3" maxlength="1200" placeholder="예: 이 세계엔 마법이 없고 길드가 도시를 다스린다. 소꿉친구 한서윤이 옆집에 산다. 겉으론 퉁명스럽지만 늘 나를 챙긴다.">${esc(app.settings.worldNote || '')}</textarea><p class="muted field-note">유저 노트로 들어가서 첫 장면부터 반영되고, 나중에 기억 탭에서 고칠 수 있어요.</p></div>
      <div class="field"><label>성좌</label><div class="seg" id="spseg"><button type="button" data-sp="random" aria-pressed="true">무작위</button><button type="button" data-sp="on" aria-pressed="false">있음</button><button type="button" data-sp="off" aria-pressed="false">없음</button></div></div>
    </div>
    <details class="odds guide"><summary>플레이 가이드</summary>
      <p><b>명령어</b> (입력창에 그대로)</p>
      <div class="g"><code>/뉴스</code><span>세계의 소식지</span><code>/의뢰</code><span>의뢰 게시판</span><code>/갤</code><span>커뮤니티</span><code>/톡</code><span>메시지 메신저</span><code>/성좌</code><span>성좌들의 관전 갤러리 (성좌가 있는 삶에서 채널이 열린 뒤)</span><code>/판정</code><span>방금 판정의 근거 묻기</span><code>/스킬</code><span>스킬 목록과 비용</span><code>/상태</code><span>상태창 (위 상태 바를 탭해도 열려요)</span></div>
      <p><b>입력</b>: 말과 행동은 그대로 쓰고, 속마음이나 상황 설명만 *별표* 안에. 별표 안은 장면 속 누구도 듣지 못해요. 대사에 따옴표를 쳐도 되고 안 쳐도 돼요.</p>
      <p><b>턴</b>: 매 턴 운빨을 켠 저장이면 위험한 행동과 확률이 붙은 선택지에 1~100 주사위가 굴러요. <b>낮을수록 좋아요</b>. 성공 확률 30%면 30 이하가 성공이에요. 제시된 선택지는 적힌 확률로, 자유 입력은 내레이터가 확률을 정해 판정해요. 운빨을 끈 저장은 주사위 없이 개연성으로 진행돼요. 턴 아래 스탯 칩을 누르면 이유가, 다시 쓰기는 사유를 고르면 그 점을 고쳐서 다시 써요.</p>
      <p><b>죽음</b>: 인생 결산 뒤 전생의 능력 하나를 들고 회귀해요. 전생의 기억은 그대로예요.</p>
    </details>
    <details class="odds guide"><summary>확률표</summary>
      <p><b>신분과 재능</b>은 각각 따로 굴려요: ${TIER_P.map(([t, p]) => `<code>${t}</code> ${p}%`).join(', ')}.</p>
      <p><b>세계</b> 11개 중 무작위(고정 가능). <b>난이도</b> ★1~5는 세계마다 정해진 범위 안에서 삶마다 새로 굴려요. 인외마경은 항상 ★5.</p>
      <p><b>출신</b>(토박이, 전이자, 빙의자)과 <b>성좌 유무</b>도 세계별 확률로 굴려요. 로판과 궁중물은 빙의가, 헌터물과 탑은 성좌가 흔해요. 성좌가 있으면 ADMIN과의 관계(무관심, 경쟁, 적대, 협력)도 같이 정해져요.</p>
      <p><b>플레이어 설정</b>은 세계, 종족, 출신, 같은 등급 안의 신분과 재능 종류를 그쪽으로 기울이지만 등급 확률은 바꾸지 않아요.</p>
    </details>
    <div class="row"><button class="btn primary" id="rollBtn">운명 굴리기</button>${app.saves.length && !inherit ? '<button class="btn ghost" id="toSaves">저장된 삶 보기</button>' : ''}</div>
    <div id="fate"></div></div>`;
}
// the free setup's talent rows: add up to TALENT_MAX, remove any
function bindTalentRows() {
  const box = $('#talents'),
    add = $('#addTalent');
  if (!box || !add) return;
  const sync = () => {
    add.disabled = box.querySelectorAll('.trow').length >= TALENT_MAX;
    box.querySelectorAll('.tx').forEach(
      x =>
        (x.onclick = () => {
          x.closest('.trow').remove();
          sync();
        }),
    );
  };
  add.onclick = () => {
    if (box.querySelectorAll('.trow').length >= TALENT_MAX) return;
    box.insertAdjacentHTML('beforeend', talentRow(false));
    sync();
    const rows = box.querySelectorAll('.trow');
    const last = rows[rows.length - 1];
    if (tierLocked) lockTierSel(last.querySelector('.tt'));
    last.querySelector('.tn').focus();
  };
  sync();
}
// before the second life (and for anyone but the owner) free setup is closed and tiers are rolled, not chosen
async function lockFreeSetup(inherit) {
  const priv = await isPrivileged();
  const first = !inherit;
  const fb = $('#mseg [data-m="free"]');
  if (!priv) {
    if (first) {
      fb.disabled = true;
      fb.title = '자유 설정은 2회차부터';
      fb.textContent = '자유 설정 (2회차부터)';
    }
    tierLocked = true;
    lockTierSel($('#fOT'));
    document.querySelectorAll('#talents .tt').forEach(lockTierSel);
  }
}
// the profile box shows how much of its 600 characters is used
function bindProfileCount() {
  const ta = $('#prof'),
    pc = $('#profCount');
  const upd = () => {
    pc.textContent = `${ta.value.length} / 600자`;
  };
  ta.oninput = upd;
  upd();
}
// the free-setup fields as rollLife takes them: the first talent row is the talent, the rest are extras
function readFreeSetup(sel) {
  const talents = [...document.querySelectorAll('#talents .trow')].map(r => ({
    tier: r.querySelector('.tt').value,
    name: r.querySelector('.tn').value.trim(),
    desc: r.querySelector('.td').value.trim(),
  }));
  const first = talents[0] || { tier: 'C', name: '', desc: '' };
  return {
    race: $('#fRace').value.trim(),
    originTier: $('#fOT').value,
    origin: $('#fOrigin').value.trim(),
    talentTier: first.tier,
    talent: first.name,
    talentDesc: first.desc,
    extraTalents: talents
      .slice(1)
      .filter(t => t.name)
      .slice(0, TALENT_MAX - 1),
    age: $('#fAge').value,
    sponsor: sel.sponsor || 'random',
  };
}
// the roll button: read the form, ask the narrator how the player's own setup leans (gacha only), roll, show the fate
async function rollFromForm(inherit, sel) {
  const rb = $('#rollBtn');
  if (rb.disabled) return;
  const name = inherit ? app.state.life.name : $('#nm').value.trim();
  if (!name) {
    toast('이름을 입력하세요');
    $('#nm').focus();
    return;
  }
  const gender = inherit ? app.state.life.gender : sel.gender;
  const free = sel.mode === 'free' ? readFreeSetup(sel) : null;
  const profTxt = ($('#prof').value || '').trim().slice(0, 600);
  let aff = null;
  if (profTxt && !free) {
    rb.disabled = true;
    rb.textContent = '설정 읽는 중...';
    try {
      aff = await profileAffinity(profTxt);
    } catch (e) {
      noteIgnored('new life: profile affinity (rolling without it)', e);
    }
    rb.disabled = false;
    rb.textContent = '운명 굴리기';
  }
  const life = rollLife(name, gender, sel.world, free, aff);
  life.profile = profTxt;
  const wn = $('#worldNote');
  if (wn && sel.mode === 'free') life.seedNotes = wn.value.trim().slice(0, 1200); // the save's first user notes, so the opening scene knows them
  rememberFormDefaults(life);
  app.pendingRoll = { life, inherit };
  revealFate(life, inherit);
}
// the form's answers become the next new game's defaults (each save keeps the copy it started with)
function rememberFormDefaults(life) {
  const settings = app.settings;
  let changed = false;
  if ($('#profSave').checked && settings.profile !== life.profile) {
    settings.profile = life.profile;
    changed = true;
  }
  const dm = $('#diceMode');
  if (dm && settings.dice !== dm.checked) {
    settings.dice = dm.checked;
    changed = true;
  }
  if (life.seedNotes !== undefined && settings.worldNote !== life.seedNotes) {
    settings.worldNote = life.seedNotes;
    changed = true;
  }
  if (changed) saveSettings().catch(e => noteIgnored('new-life: dset settings', e));
}
function wpick(items) {
  const tot = items.reduce((a, [, p]) => a + p, 0);
  let r = rnd() * tot;
  for (const [x, p] of items) {
    if ((r -= p) < 0) return x;
  }
  return items[items.length - 1][0];
}
const AFF_FALLBACK = [
  [/무협|강호|내공|검객|문파/, 'murim'],
  [/헌터|게이트|각성/, 'hunter'],
  [/게임|레벨|유저|vr|mmo/i, 'vrmmo'],
  [/학원|아카데미|학생|입학/, 'academy'],
  [/사이버|해킹|안드로이드|기업/, 'cyber'],
  [/영애|황녀|공녀|악녀|북부 대공/, 'rofan'],
  [/좀비|멸망|생존/, 'apoc'],
  [/후궁|황궁|조정|궁녀/, 'palace'],
  [/전이|트럭|소환/, 'isekai'],
  [/마왕|용사|기사|마법/, 'fantasy'],
];
async function profileAffinity(text) {
  text = String(text || '').trim();
  if (!text) return null;
  if (app.settings.profileAff && app.settings.profileAff.text === text) return app.settings.profileAff.data;
  let data = null;
  if (platform.sample) {
    try {
      data = await Promise.race([
        platform.sample.json(
          fillTemplate(prompts.affinity, { worlds: WORLDS.map(w => w.id + '=' + w.name).join(', '), profile: text }),
          {
            modelTier: 'quick',
            cache: false,
          },
        ),
        new Promise(r => setTimeout(() => r(null), 7000)),
      ]);
    } catch (e) {
      data = null;
    }
  }
  if (!data || typeof data !== 'object') {
    data = {
      worlds: [...new Set(AFF_FALLBACK.filter(([re]) => re.test(text)).map(([, w]) => w))].slice(0, 3),
      races: [],
      keywords: [],
    };
  }
  const entryHint = /빙의|원작/.test(text) ? 'possess' : /전이|이세계로|떨어[졌진]/.test(text) ? 'transfer' : null; // the player's own words about how they arrived
  data = {
    entry: entryHint,
    worlds: liveWorldIds(Array.isArray(data.worlds) ? data.worlds : []).slice(0, 3),
    races: (Array.isArray(data.races) ? data.races : []).map(String).slice(0, 3),
    keywords: (Array.isArray(data.keywords) ? data.keywords : []).map(String).filter(Boolean).slice(0, 8),
  };
  app.settings.profileAff = { text, data };
  saveSettings().catch(e => noteIgnored('new-life: dset settings', e));
  return data;
}
function pickWorld(gender, aff) {
  const w = WORLDS.map(x => [
    x,
    (x.id === 'rofan' ? (gender === '여' ? 1.6 : gender === '남' ? 0.7 : 1) : 1) *
      (aff && aff.worlds.includes(x.id) ? 3 : 1),
  ]);
  const tot = w.reduce((a, [, p]) => a + p, 0);
  let r = rnd() * tot;
  for (const [x, p] of w) {
    if ((r -= p) < 0) return x;
  }
  return WORLDS[0];
}
function affPick(list, text, kw) {
  if (!kw || !kw.length) return pick(list);
  const sc = x => kw.filter(k => text(x).includes(k)).length;
  const top = Math.max(...list.map(sc));
  if (top > 0 && rnd() < 0.7) return pick(list.filter(x => sc(x) === top));
  return pick(list);
}
export let rollLife = function rollLife(name, gender, worldChoice, free, aff) {
  const world = (worldChoice !== 'random' && WORLDS.find(w => w.id === worldChoice)) || pickWorld(gender, aff);
  const entry = rollEntry(world, aff),
    sponsor = rollSponsor(world, free && free.sponsor, setting('adminPersona'));
  const rl = entry === 'transfer' ? TRANSFER_RACES[world.from ? 'other' : 'modern'] : RACES[world.id] || ['인간'];
  const rw =
    aff && aff.races.length
      ? rl.map(r => [r, aff.races.some(a => r.includes(a) || a.includes(r.replace(/\(.*\)/, ''))) ? 4 : 1])
      : rl.map(r => [r, 1]);
  const dr = Array.isArray(world.diff) ? world.diff : [3, 3];
  const diff = dr[0] + Math.floor(rnd() * (dr[1] - dr[0] + 1));
  let race = rnd() < 0.01 ? '[데이터 없음(ERROR)]' : wpick(rw);
  let ot = rollTier(),
    tt = rollTier();
  const kw = aff ? [...aff.keywords, ...aff.races] : [];
  let origin = affPick(ORIGINS[ot], x => x, kw);
  let [tn, td] = affPick(TALENTS[tt], x => x[0] + ' ' + x[1], kw);
  let age = pick([0, 0, 7, 12, 16, 17, 19, 24, 31]);
  if (free) {
    if (free.race) race = free.race.slice(0, 20);
    ot = TIERS.includes(free.originTier) ? free.originTier : ot;
    origin = free.origin || pick(ORIGINS[ot]);
    tt = TIERS.includes(free.talentTier) ? free.talentTier : tt;
    if (free.talent) {
      tn = free.talent;
      td = free.talentDesc || '';
    } else {
      [tn, td] = pick(TALENTS[tt]);
    }
    if (free.age !== '') age = Math.max(0, Math.min(90, parseInt(free.age) || 0));
  }
  const extra =
    free && Array.isArray(free.extraTalents)
      ? free.extraTalents
          .map(t => ({
            name: String(t.name).slice(0, 30),
            grade: TIERS.includes(t.tier) ? t.tier : 'C',
            desc: String(t.desc || '').slice(0, 80),
          }))
          .filter(t => t.name)
      : [];
  return {
    name,
    gender,
    world,
    race,
    diff,
    originTier: ot,
    origin,
    talentTier: tt,
    talent: { name: tn, grade: tt, desc: td },
    age,
    free: !!free,
    entry,
    sponsor,
    ...(extra.length ? { extraTalents: extra } : {}),
  };
};
function revealFate(life, inherit) {
  const cards = [
    [
      '세계',
      life.world.name,
      `난이도 ${'★'.repeat(life.diff || 3)}${'☆'.repeat(5 - (life.diff || 3))}. ${life.world.desc ? life.world.desc + '. ' : ''}${life.world.risk}. ${life.world.opp}.`,
      null,
    ],
    ['종족', life.race, '', null],
    ['신분', life.origin, '', life.originTier],
    ['재능', life.talent.name, life.talent.desc, life.talentTier],
  ];
  if (life.entry && life.entry !== 'native')
    cards.push([
      '출신',
      ENTRY_NAME[life.entry],
      life.entry === 'possess'
        ? '이 세계를 다룬 소설 속 인물의 몸. 원작 전개를 안다'
        : `${life.world.from || '현대 한국'}에서 떨어졌다. 말도 상식도 안 통한다`,
      null,
    ]);
  if (life.sponsor)
    cards.push([
      '성좌',
      '이 세계엔 성좌가 있다',
      `ADMIN과의 관계: ${life.sponsor.stance}. 채널은 아직 닫혀 있다`,
      null,
    ]);
  const f = $('#fate');
  f.innerHTML = `<div class="fate">${cards.map((c, i) => `<div class="card flip ${c[3] ? 'glow-' + c[3] : ''}" style="animation-delay:${i * 0.35}s"><small>${c[0]}</small>${c[3] ? `<span class="g ${c[3]}">${c[3]}</span>` : ''}<div class="v">${esc(c[1])}</div>${c[2] ? `<div class="d">${esc(c[2])}</div>` : ''}</div>`).join('')}</div>
   ${inherit && inherit.name ? `<div class="item fate-note"><div class="m">계승</div><div class="t"><span class="tier ${inherit.grade}">${inherit.grade}</span> ${esc(inherit.name)}</div><div class="m">${esc(inherit.desc)}</div></div>` : ''}
   <div class="row fate-actions"><button class="btn primary" id="acceptBtn">이 운명으로 시작</button></div>`;
  cards.forEach((c, i) =>
    setTimeout(
      () => {
        if (c[3]) cueReveal(c[3]);
        else cueBlip();
      },
      i * 350 + 150,
    ),
  );
  $('#rollBtn').disabled = true;
  $('#rollBtn').textContent = life.free ? '설정이 정해졌습니다' : '운명이 정해졌습니다';
  document
    .querySelectorAll('#wseg button,#gseg button,#mseg button,#freeBox input,#freeBox select,#freeBox button')
    .forEach(b => (b.disabled = true));
  $('#acceptBtn').onclick = async () => {
    if (!platform.sample && !(await ensureSample())) {
      toast('Claude 연결이 필요해요');
      return;
    }
    beginLife();
  };
}
async function beginLife() {
  const { life, inherit } = app.pendingRoll;
  app.pendingRoll = null;
  const b = BASE[life.originTier];
  const skills = [
    { ...life.talent, src: '재능' },
    ...(life.extraTalents || []).filter(t => t.name !== life.talent.name).map(t => ({ ...t, src: '재능' })),
  ];
  const seed = (life && life.seedNotes) || '';
  let past = [],
    lifeNo = 1,
    userNotes = seed,
    lore = {};
  if (life) delete life.seedNotes;
  if (inherit) {
    past = app.state.pastLives;
    lifeNo = app.state.lifeNo + 1;
    userNotes = app.state.userNotes || '';
    if (seed && !userNotes.includes(seed)) userNotes = (userNotes ? userNotes + '\n' : '') + seed;
    userNotes = userNotes.slice(0, 1200);
    if (inherit.name) skills.push({ name: inherit.name, grade: inherit.grade, desc: inherit.desc, src: '계승' });
    for (const s of app.state.skills.filter(s => s.src === '계승'))
      if (!skills.find(x => x.name === s.name)) skills.push(s);
  }
  app.state = {
    v: 1,
    goldV: 2,
    rules: inherit ? app.state.rules : snapshotRules(),
    life,
    lifeNo,
    stats: Object.assign(
      { hp: b.hp, maxHp: b.hp, power: b.power, gold: b.gold * currencyOf(life.world.id)[1], fame: 0, age: life.age },
      rollSubStats(life.originTier),
    ),
    title: '없음',
    skills,
    lifeStart: inherit ? app.state.next : 0,
    turnNo: 0,
    quests: [],
    lore,
    relations: {},
    cast: {},
    clock: { day: 0, date: '', time: '', weather: '', place: '' },
    murim: life.world.id === 'murim' ? initMurim(life.originTier) : null,
    summaries: inherit ? app.state.summaries : [],
    summarizedUpto: inherit ? app.state.summarizedUpto : -1,
    stateNote: '',
    pastLives: past,
    userNotes,
    dead: false,
    next: inherit ? app.state.next : 0,
  };
  if (!inherit) {
    app.currentSave = {
      id: uid(),
      name: `${life.name}의 운명`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      parent: null,
      lifeNo: 1,
      turns: 0,
      store: 2,
      pages: 0,
    };
    turnStore.tail = null;
    NEW_SAVES.add(app.currentSave.id);
    app.turns = [];
    app.settings.lastSave = app.currentSave.id;
    saveSettings().catch(e => noteIgnored('new-life: dset settings', e));
  } else {
    app.currentSave.lifeNo = lifeNo;
  }
  await pushTurn({
    kind: 'system',
    text: `${lifeNo}번째 삶: ${life.world.name}, ${life.race}, ${life.origin}(${life.originTier}), 재능 ${life.talent.name}(${life.talentTier})`,
    snap: clone(app.state),
  });
  app.state.introText = fillTemplate(prompts.intro, {
    opening: inherit ? prompts.introOpeningRegress : prompts.introOpeningFirst,
    world: life.world.name,
    race: life.race,
    origin: life.origin,
    originTier: life.originTier,
    talent: life.talent.name,
    talentTier: life.talentTier,
    extra: lifeExtra(life),
  });

  showPlay();
  await exclusive(() => runTurn(app.state.introText, null, { intro: true }));
}

// the functions above that tests may replace (window.DR.mock): each setter swaps the binding every caller uses
export const mocks = {
  rollLife: f => (rollLife = f),
};
