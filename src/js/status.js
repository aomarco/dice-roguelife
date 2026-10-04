/* ============ status ============ */
import { $, esc, fmt, toast } from './util.js';
import { ART_SLOTS, powerGrade, REALMS, SUB_STATS, tierRank } from './data.js';
import { app } from './app.js';
import { itemBonus, statusVisible, TITLES_MAX, titlesOn } from './rules.js';
import { openSheet } from './sheet.js';
import { persist } from './persistence.js';
import { toggleTitle } from './log.js';

function hpWord(s) {
  const r = s.hp / s.maxHp;
  return r >= 0.95 ? '완벽' : r >= 0.7 ? '양호' : r >= 0.4 ? '부상' : r > 0.15 ? '중상' : r > 0 ? '위독' : '사망';
}
export function renderStrip() {
  if (!app.state) {
    $('#strip').classList.add('hidden');
    return;
  }
  const s = app.state.stats,
    l = app.state.life,
    M = app.state.murim;
  const turnNo = app.state.turnNo != null ? app.state.turnNo : app.turns.filter(t => t.kind === 'ai').length;
  const el = $('#strip');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="who">${esc(l.name)} <span class="tier ${l.originTier}">${l.originTier}</span>${M ? `<span class="realm">${REALMS[M.realm]}</span>` : ''}<span class="meta">${s.age}세, ${esc(l.world.name)}, ${app.state.lifeNo}회차, ${turnNo}턴</span></div>
   <div class="nums">${statusVisible() ? `HP <b>${fmt(s.hp)}</b>/${fmt(s.maxHp)} (${hpWord(s)})&nbsp;&nbsp;${app.state.energy ? `${esc(app.state.energy.name)} <b>${fmt(app.state.energy.cur)}</b>/${fmt(app.state.energy.max)}&nbsp;&nbsp;` : ''}` : `몸 상태 <b>${hpWord(s)}</b>&nbsp;&nbsp;`}${!statusVisible() ? '' : M ? `내공 <b>${M.neigong}</b>년` : `전투력 <b>${fmt(s.power)}</b> (${powerGrade(s.power)})`}</div>
   ${statusVisible() ? `<div class="hp"><i style="width:${Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100))}%"></i></div>` : `<div class="hp pips" aria-label="몸 상태 ${hpWord(s)}">${[1, 2, 3, 4, 5].map(i => `<b class="${i <= hpPips(s) ? 'on' : ''}"></b>`).join('')}</div>`}`;
}
const hpPips = s => ({ 완벽: 5, 양호: 4, 부상: 3, 중상: 2, 위독: 1, 사망: 0 })[hpWord(s)]; // before the awakening the body is felt in steps, not measured
export function bindStatusStrip() {
  $('#strip').onclick = openStatus;
  $('#strip').onkeydown = e => {
    if (e.key === 'Enter') openStatus();
  };
}
const STATUS_ORNAMENT =
  '<svg class="orn" viewBox="0 0 56 22" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M1 21 C1 8 8 1 21 1 M1 21 C1 14 4 9 9 6 M1 21 C6 21 10 18 12 14 M14 3 c3 -1 6 1 6 4 M4 17 c1 -3 4 -5 7 -5"/><circle cx="22" cy="6" r="1.2" fill="currentColor"/><circle cx="8" cy="20" r="1.2" fill="currentColor"/></svg>';
export function openStatus() {
  if (!app.state) return;
  const l = app.state.life,
    M = app.state.murim;
  const SV = statusVisible();
  const s = SV
    ? app.state.stats
    : Object.fromEntries(Object.entries(app.state.stats).map(([k, v]) => [k, k === 'age' || k === 'gold' ? v : '?']));
  const fmt = x => (x === '?' ? '?' : Number.isFinite(x) ? x.toLocaleString('ko-KR') : x);
  const fx = app.state.titleFx || {};
  const NEW_TURNS = 10,
    isNew = k => k.at != null && app.state.next - k.at < NEW_TURNS;
  const skills =
    [...app.state.skills]
      .sort((a, b) => isNew(b) - isNew(a) || (b.lv || 1) - (a.lv || 1) || tierRank(a.grade) - tierRank(b.grade))
      .map(
        k =>
          `<div class="sk"><span class="g ${k.grade} tier ${k.grade} grade-flat">${k.grade}</span><div><b>${esc(k.name)}</b>${isNew(k) ? '<span class="newb">NEW</span>' : ''}<span class="src">Lv.${k.lv || 1}${k.cost ? ' · 비용 ' + k.cost + '%' : ''}${k.src ? ' · ' + esc(k.src) : ''}</span><p>${esc(k.desc || '')}</p></div></div>`,
      )
      .join('') || '<p class="sw-empty">없음</p>';
  const quests =
    app.state.quests
      .filter(q => q.status === 'active')
      .map(q => `<div class="sw-q"><div><div>${esc(q.title)}</div>${q.note ? `<p>${esc(q.note)}</p>` : ''}</div></div>`)
      .join('') || '<p class="sw-empty">없음</p>';
  openSheet(
    `<div class="sw">${STATUS_ORNAMENT.replace('class="orn"', 'class="orn tl"')}${STATUS_ORNAMENT.replace('class="orn"', 'class="orn tr"')}${STATUS_ORNAMENT.replace('class="orn"', 'class="orn bl"')}${STATUS_ORNAMENT.replace('class="orn"', 'class="orn br"')}<span class="xx" role="button" tabindex="0" aria-label="닫기" data-close>✕</span>
    <div class="sw-title">상태창</div>
    <div class="sw-head">
      <div><div class="kv"><span>이름</span><span>${esc(l.name)} <span class="tier ${l.originTier}">${l.originTier}</span></span></div>
        <div class="kv"><span>신분</span><span>${esc(l.origin)}</span></div>
        ${app.state.clock.place ? `<div class="kv"><span>장소</span><span>${esc(app.state.clock.place)}</span></div>` : ''}
        <div class="kv"><span>칭호</span><span class="ttl">${(() => {
          const on = titlesOn();
          return on.length ? on.map(esc).join(', ') : '없음';
        })()}</span></div></div>
      <div><div class="kv"><span>회차</span><span>${app.state.lifeNo}</span></div><div class="kv"><span>나이</span><span>${s.age}</span></div><div class="kv"><span>종족</span><span>${esc(l.race)}</span></div></div>
    </div>
    <div class="sw-line"></div>
    ${SV ? `<div class="sw-hp"><div class="row"><span>HP</span><span>${fmt(s.hp)} / ${fmt(s.maxHp)}</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, (app.state.stats.hp / app.state.stats.maxHp) * 100))}%"></i></div></div>` : `<div class="sw-hp"><div class="row"><span>몸 상태</span><span>${hpWord(app.state.stats)}</span></div><p class="sw-note">${app.settings.statusMode === 'never' ? '이 게임은 숫자를 보여주지 않는다. 몸과 이야기로 판단한다.' : '아직 자신의 수치를 볼 수 없다. 각성이나 측정을 거치면 상태창이 열린다.'}</p></div>`}
    ${app.state.energy && SV ? `<div class="sw-hp sw-hp-next"><div class="row"><span>${esc(app.state.energy.name)}</span><span>${fmt(app.state.energy.cur)} / ${fmt(app.state.energy.max)}</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, (app.state.energy.cur / Math.max(1, app.state.energy.max)) * 100))}%;background:linear-gradient(90deg,#5A8DEE,#B8D0FF)"></i></div></div>` : ''}
    <div class="sw-line"></div>
    <div class="sw-sec"><h4>스 탯</h4>
      <div class="sw-grid sw-grid-main">
        ${M ? `<div><small>경지</small><b>${REALMS[M.realm]}</b></div><div><small>내공</small><b>${M.neigong}년</b></div>` : `<div><small>전투력</small><b>${fmt(s.power)}${itemBonus() ? `<span class="sw-sub"> +${fmt(itemBonus())}</span>` : ''}${SV ? ` <span class="sw-sub">(${powerGrade(app.state.stats.power + itemBonus())})</span>` : ''}</b></div>`}
        <div><small>소지금</small><b>${fmt(s.gold)}</b></div><div><small>명성</small><b>${fmt(s.fame)}</b></div>
      </div>
      <div class="sw-subs">${SUB_STATS.map(([k, l]) => `<span><span class="sw-label">${l}</span><b>${s[k] || 0}</b></span>`).join('')}</div>
    </div>

    ${
      M
        ? `<div class="sw-line"></div><div class="sw-sec"><h4>무 림</h4><dl class="sw-kv"><dt>다음 경지</dt><dd>${M.realm < REALMS.length - 1 ? REALMS[M.realm + 1] : '-'}</dd><dt>별호</dt><dd>${esc(M.alias || '없음')}</dd><dt>세력</dt><dd>${esc(M.faction || '없음')}${M.rank ? `, ${esc(M.rank)}` : ''}</dd>${M.constitution ? `<dt>체질</dt><dd>${esc(M.constitution)}</dd>` : ''}${ART_SLOTS.filter(
            k => M.arts[k],
          )
            .map(k => `<dt>${k}</dt><dd>${esc(M.arts[k])}</dd>`)
            .join('')}</dl></div>`
        : ''
    }
    <div class="sw-line"></div>
    <div class="sw-sec"><h4>스 킬</h4><div class="sw-scroll">${skills}</div></div>
    <div class="sw-line"></div>
    ${
      (app.state.items || []).length
        ? `<div class="sw-line"></div><div class="sw-sec"><h4>장 비</h4>${
            (app.state.equipped || []).length
              ? `<div class="sw-scroll">${app.state.equipped
                  .map(n => {
                    const it = app.state.items.find(x => x.name === n) || {};
                    return `<div class="sk"><span class="g ${it.grade || ''} tier ${it.grade || ''} grade-flat">${it.grade || '-'}</span><div><b>${esc(n)}</b><span class="src">${it.slot ? { weapon: '무기', armor: '방어구', accessory: '장신구' }[it.slot] : ''}${it.power ? ' · +' + it.power : ''}</span><p>${esc(it.note || '')}</p><button class="btn ghost chip-sm sw-uneq" data-uneq="${esc(n)}">해제</button></div></div>`;
                  })
                  .join('')}</div>`
              : '<p class="sw-empty sw-empty-gear">장착한 것 없음</p>'
          }
    <h4 class="sw-bag-title">소지품</h4><div class="sw-scroll">${app.state.items.map(it => `<div class="sk"><span class="g ${it.grade || ''} tier ${it.grade || ''} grade-flat">${it.grade || '-'}</span><div><b>${esc(it.name)}</b><span class="src">${it.qty > 1 ? 'x' + it.qty : ''}${(app.state.equipped || []).includes(it.name) ? ' · 장착 중' : ''}</span><p>${esc(it.note || '')}</p></div></div>`).join('')}</div></div>`
        : ''
    }
    <div class="sw-sec"><h4>의 뢰</h4><div class="sw-scroll">${quests}</div></div>
    ${
      Object.keys(app.state.ledger || {}).length
        ? `<div class="sw-line"></div><div class="sw-sec"><h4>장 부</h4><dl class="sw-kv sw-kv-loose">${Object.entries(
            app.state.ledger,
          )
            .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
            .join('')}</dl></div>`
        : ''
    }
    ${
      (app.state.titles || []).length
        ? (() => {
            const on = titlesOn();
            return `<div class="sw-line"></div><div class="sw-sec"><h4>칭 호 <span class="sw-count">${on.length}/${TITLES_MAX} 적용 중</span></h4><div class="sw-chips">${app.state.titles
              .map(t => {
                const act = on.includes(t);
                return `<button type="button" data-title="${esc(t)}" class="sw-chip${act ? ' on' : ''}" title="${esc(fx[t] || '')}">${act ? '● ' : ''}${esc(t)}${fx[t] ? `<span class="sw-fx"> · ${esc(fx[t])}</span>` : ''}</button>`;
              })
              .join(
                '',
              )}</div><p class="sw-note small">눌러서 켜고 꺼요. 최대 ${TITLES_MAX}개까지 함께 적용돼요</p></div>`;
          })()
        : ''
    }
    ${app.state.stateNote ? `<div class="sw-line"></div><div class="sw-sec"><h4>현 황</h4><p class="sw-state">${esc(app.state.stateNote)}</p></div>` : ''}
    ${
      app.state.pastLives.length
        ? `<div class="sw-line"></div><div class="sw-sec"><h4>전 생</h4>${app.state.pastLives
            .slice(-3)
            .reverse()
            .map(
              p =>
                `<div class="sw-q sw-q-flat"><div><div>${p.lifeNo}회차 ${esc(p.world)}, ${esc(p.origin)}(${esc(p.tier)}) ${esc(p.score)}점</div><p>${esc(p.epitaph)}</p></div></div>`,
            )
            .join('')}</div>`
        : ''
    }
  </div><div class="row sw-actions"><button class="btn" data-close>닫기</button></div>`,
    { center: true, wide: true },
  );
  $('#sheetInner')
    .querySelectorAll('[data-title]')
    .forEach(
      b =>
        (b.onclick = async () => {
          if (!toggleTitle(b.dataset.title)) {
            toast(`칭호는 최대 ${TITLES_MAX}개까지 켤 수 있어요`);
            return;
          }
          await persist();
          renderStrip();
          openStatus();
        }),
    );
  $('#sheetInner')
    .querySelectorAll('[data-uneq]')
    .forEach(
      b =>
        (b.onclick = async () => {
          app.state.equipped = (app.state.equipped || []).filter(n => n !== b.dataset.uneq);
          await persist();
          openStatus();
        }),
    ); // taking off is the player's; putting on goes through the narrator
}
