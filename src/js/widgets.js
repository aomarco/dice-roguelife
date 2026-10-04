/* ============ widgets ============ */
// The screens a command reply can carry. Each type in WIDGETS knows everything the game does with it:
//   label      the folded box's title in discreet mode ("소식 보기")
//   render     its HTML in the log (ti: the turn index, for buttons that act on this turn)
//   followups  the buttons under it: [text to send, or an action log.js handles, button label]
//   markdown   its text in a markdown export of the save
// A new screen is one more entry here, plus its schema under widgets in prompts.json.
import { esc } from './util.js';
import { app } from './app.js';
import { setting } from './settings.js';

function stars(n) {
  n = Math.max(0, Math.min(5, Math.round(n || 0)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function newsHtml(w) {
  const qs = (w.quotes || []).filter(Boolean);
  return `<div class="w ${app.settings.newsStyle === 'paper' ? 'paper' : ''}"><div class="w-news-head"><svg width="70" height="44" viewBox="0 0 70 44" fill="none" aria-hidden="true"><path d="M6 38 L30 22 L44 30 L64 6" stroke="#7F98E8" stroke-width="1.2"/><circle cx="6" cy="38" r="2.2" fill="#C8D4FF"/><circle cx="30" cy="22" r="2.6" fill="#C8D4FF"/><circle cx="44" cy="30" r="2" fill="#C8D4FF"/><circle cx="64" cy="6" r="2.4" fill="#C8D4FF"/><circle cx="52" cy="14" r="1.2" fill="#7F98E8"/></svg><small>${esc(w.section || '소식')}</small><div class="paper">${esc(w.outlet || '')}</div><time>${esc(w.time || '')}</time><h4>${esc(w.headline || '')}</h4></div>
    <div class="w-news-body">${w.reporter ? `<p class="rep">전달자<b>${esc(w.reporter)}</b></p>` : ''}<p class="art">${esc(w.body || '')}</p>${qs.length ? `<div class="fq">현장 전언<span>${qs.length}</span></div>${qs.map(q => `<blockquote>${esc(q)}</blockquote>`).join('')}` : ''}</div></div>`;
}
function questHtml(w, ti) {
  const qs = w.quests || [];
  const rk = q => {
    const r = String(q.rank || '').toUpperCase();
    if (/^(EX|SSS|SS|S|A|B|C|D|E|F)$/.test(r)) return r;
    const d = Number(q.difficulty) || 3;
    return d >= 5 ? 'S' : d === 4 ? 'A' : d === 3 ? 'B' : d === 2 ? 'C' : 'D';
  };
  return `<div class="w ${setting('questStyle') === 'board' ? 'board' : ''}"><div class="w-quest"><div class="qh"><span class="rb">!</span><div>${esc(w.board || '의뢰 게시판')}<small>${esc(w.subtitle || '')}${w.subtitle ? ', ' : ''}${qs.length}건</small></div></div>
    ${qs
      .map((q, i) => {
        const taken = app.state.quests.find(x => x.title === q.title);
        const r = rk(q);
        return `<div class="qcard r-${r}"><div class="no"><span>QUEST ${String(i + 1).padStart(2, '0')}</span><em>${esc(taken ? '진행 중' : q.status || '수락 가능')}</em></div><h5><span class="rk">${r}</span>${esc(q.title)}</h5>
      <dl><dt>의뢰인</dt><dd>${esc(q.client || '-')}</dd>${q.location ? `<dt>위치</dt><dd>${esc(q.location)}</dd>` : ''}<dt>기한</dt><dd>${esc(q.deadline || '-')}</dd><dt>난이도</dt><dd><span class="stars" aria-label="난이도 ${q.difficulty}/5">${stars(q.difficulty)}</span></dd></dl>
      <div class="qb">${esc(q.body || '')}</div>${
        Array.isArray(q.objectives) && q.objectives.length
          ? `<ul class="obj">${q.objectives
              .slice(0, 5)
              .map(o => `<li>${esc(o)}</li>`)
              .join('')}</ul>`
          : ''
      }
      ${q.reward ? `<div class="rw"><div><small>보상</small>${esc(q.reward)}</div></div>` : ''}
      <div class="qa">${q.note ? `<span class="note">${esc(q.note)}</span>` : ''}<button data-accept="${i}" data-turn="${ti}" ${taken ? 'disabled' : ''}>${taken ? '수락함' : '수락'}</button></div></div>`;
      })
      .join('')}</div></div>`;
}
function galleryHtml(w) {
  const p = w.post;
  return `<div class="w w-gal"><div class="gh"><small>${esc(w.site || '커뮤니티')}</small><div>${esc(w.board || '게시판')}</div></div>
    ${w.posts && w.posts.length ? `<ul>${w.posts.map(x => `<li><button data-open="${esc(x.title)}"><div class="t">${esc(x.title)} <span class="muted">[${esc(x.comments ?? 0)}]</span></div><div class="m">${esc(x.author || 'ㅇㅇ')} | 조회 ${esc(x.views ?? 0)} | 추천 ${esc(x.likes ?? 0)}</div></button></li>`).join('')}</ul>` : ''}
    ${
      p
        ? `<div class="post"><h6>${esc(p.title)}</h6><div class="pm">${esc(p.author || 'ㅇㅇ')} | 조회 ${esc(p.views ?? 0)}</div><div class="pb">${esc(p.body || '')}</div>
      <div class="votes"><span>추천<b>${esc(p.likes ?? 0)}</b></span><span>비추천<b>${esc(p.dislikes ?? 0)}</b></span></div>
      <div class="cmts">${(p.comments || []).map(c => `<div class="cmt ${c.reply ? 're' : ''}"><small>${esc(c.author || 'ㅇㅇ')}</small>${esc(c.text)}</div>`).join('')}</div></div>`
        : ''
    }</div>`;
}
function messengerHtml(w) {
  return `<div class="w w-msg"><div class="mh"><small>${esc(w.app || '메신저')}</small>${esc(w.room || '대화방')}</div><div class="ms">${(w.messages || []).map(m => `<div class="m ${m.me ? 'me' : ''}">${m.me ? '' : `<small>${esc(m.from)}</small>`}<p>${esc(m.text)}</p></div>`).join('')}</div></div>`;
}
// a constellation board (the /성좌 command) is a gallery whose site or board names the constellations
const isStarBoard = w => /성좌/.test((w.site || '') + (w.board || ''));

export const WIDGETS = {
  news: {
    label: '소식',
    render: newsHtml,
    followups: () => [['/뉴스 다른 소식도 보여줘', '다른 뉴스 더보기']],
    markdown: w =>
      `**[${w.outlet || '뉴스'}] ${w.headline || ''}**\n\n${w.body || ''}\n\n${(w.quotes || []).map(q => '> ' + q).join('\n')}\n\n`,
  },
  quest: {
    label: '의뢰',
    render: questHtml,
    followups: () => [['/의뢰 다른 의뢰도 보여줘', '다른 의뢰 보기']],
    markdown: w =>
      `**${w.board || '의뢰'}**\n\n${(w.quests || []).map(q => `- [${q.rank || ''}] ${q.title}: ${q.body || ''}`).join('\n')}\n\n`,
  },
  gallery: {
    label: '게시판',
    render: galleryHtml,
    followups: w => {
      const base = isStarBoard(w) ? '/성좌' : '/갤';
      return [
        ...(w.post ? [[base + ' 목록으로 돌아가기', '목록으로']] : []),
        [base + ' 다른 글도 보여줘', '다른 글 보기'],
        ['comment', '댓글 달기'],
      ];
    },
    markdown: w =>
      w.post
        ? `**${w.site || ''} ${w.board || ''}: ${w.post.title || ''}**\n\n${w.post.body || ''}\n\n${(w.post.comments || []).map(c => `- ${c.author}: ${c.text}`).join('\n')}\n\n`
        : `**${w.site || ''} ${w.board || ''}**\n\n${(w.posts || []).map(p => '- ' + p.title).join('\n')}\n\n`,
  },
  messenger: {
    label: '메시지',
    render: messengerHtml,
    followups: () => [
      ['reply', '답장하기'],
      ['/톡 (답장하지 않고 상대의 반응을 기다린다)', '답변 더 기다리기'],
    ],
    markdown: w =>
      `**${w.app || '메신저'}: ${w.room || ''}**\n\n${(w.messages || []).map(m => `- ${m.me ? '나' : m.from}: ${m.text}`).join('\n')}\n\n`,
  },
};

// the entry for a reply's widget, or null for none or a type the game does not know
export const widgetOf = w => (w && Object.hasOwn(WIDGETS, w.type) ? WIDGETS[w.type] : null);

export function renderWidget(w, ti) {
  const def = widgetOf(w);
  if (!def) return '';
  let html = '';
  try {
    html = def.render(w, ti);
  } catch (e) {
    console.warn(e);
  }
  if (!html || !app.settings.discreet) return html;
  return `<details class="wrap"><summary>${def.label} 보기</summary>${html}</details>`;
}
