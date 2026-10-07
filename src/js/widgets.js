/* ============ widgets ============ */
// The screens a command reply can carry. Each type in WIDGETS knows everything the game does with it:
//   label      the folded box's title in discreet mode ("Show News")
//   render     its HTML in the log (ti: the turn index, for buttons that act on this turn)
//   followups  the buttons under it: [text to send, or an action log.js handles, button label]
//   markdown   its text in a markdown export of the save
// A new screen is one more entry here, plus its schema under widgets in prompts.json.
import { esc } from './util.js';
import { mentionsStars } from './reply-words.js';
import { app } from './app.js';
import { setting, widgetStyle } from './settings.js';
import { CMDS, cmdName } from './data.js';
import { locale, N_, T, Tc } from './i18n.js';

function stars(n) {
  n = Math.max(0, Math.min(5, Math.round(n || 0)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function newsHtml(w) {
  const qs = (w.quotes || []).filter(Boolean);
  return `<div class="w ${app.settings.newsStyle === 'paper' ? 'paper' : ''}"><div class="w-news-head"><svg width="70" height="44" viewBox="0 0 70 44" fill="none" aria-hidden="true"><path d="M6 38 L30 22 L44 30 L64 6" stroke="#7F98E8" stroke-width="1.2"/><circle cx="6" cy="38" r="2.2" fill="#C8D4FF"/><circle cx="30" cy="22" r="2.6" fill="#C8D4FF"/><circle cx="44" cy="30" r="2" fill="#C8D4FF"/><circle cx="64" cy="6" r="2.4" fill="#C8D4FF"/><circle cx="52" cy="14" r="1.2" fill="#7F98E8"/></svg><small>${esc(w.section || T('News'))}</small><div class="paper">${esc(w.outlet || '')}</div><time>${esc(w.time || '')}</time><h4>${esc(w.headline || '')}</h4></div>
    <div class="w-news-body">${w.reporter ? `<p class="rep">${T('Reporter')}<b>${esc(w.reporter)}</b></p>` : ''}<p class="art">${esc(w.body || '')}</p>${qs.length ? `<div class="fq">${T('From the scene')}<span>${qs.length}</span></div>${qs.map(q => `<blockquote>${esc(q)}</blockquote>`).join('')}` : ''}</div></div>`;
}
function questHtml(w, ti) {
  const qs = w.quests || [];
  const rk = q => {
    const r = String(q.rank || '').toUpperCase();
    if (/^(EX|SSS|SS|S|A|B|C|D|E|F)$/.test(r)) return r;
    const d = Number(q.difficulty) || 3;
    return d >= 5 ? 'S' : d === 4 ? 'A' : d === 3 ? 'B' : d === 2 ? 'C' : 'D';
  };
  return `<div class="w ${setting('questStyle') === 'board' ? 'board' : ''}"><div class="w-quest"><div class="qh"><span class="rb">!</span><div>${esc(w.board || T('Quest board'))}<small>${esc(w.subtitle || '')}${w.subtitle ? ', ' : ''}${T('{n} {n|posting|postings}', { n: qs.length })}</small></div></div>
    ${qs
      .map((q, i) => {
        const taken = app.state.quests.find(x => x.title === q.title);
        const r = rk(q);
        return `<div class="qcard r-${r}"><div class="no"><span>QUEST ${String(i + 1).padStart(2, '0')}</span><em>${esc(taken ? T('In progress') : q.status || T('Open'))}</em></div><h5><span class="rk">${r}</span>${esc(q.title)}</h5>
      <dl><dt>${T('Client')}</dt><dd>${esc(q.client || '-')}</dd>${q.location ? `<dt>${T('Location')}</dt><dd>${esc(q.location)}</dd>` : ''}<dt>${T('Deadline')}</dt><dd>${esc(q.deadline || '-')}</dd><dt>${T('Difficulty')}</dt><dd><span class="stars" aria-label="${T('Difficulty {n}/5', { n: q.difficulty })}">${stars(q.difficulty)}</span></dd></dl>
      <div class="qb">${esc(q.body || '')}</div>${
        Array.isArray(q.objectives) && q.objectives.length
          ? `<ul class="obj">${q.objectives
              .slice(0, 5)
              .map(o => `<li>${esc(o)}</li>`)
              .join('')}</ul>`
          : ''
      }
      ${q.reward ? `<div class="rw"><div><small>${T('Reward')}</small>${esc(q.reward)}</div></div>` : ''}
      <div class="qa">${q.note ? `<span class="note">${esc(q.note)}</span>` : ''}<button data-accept="${i}" data-turn="${ti}" ${taken ? 'disabled' : ''}>${taken ? T('Accepted') : T('Accept')}</button></div></div>`;
      })
      .join('')}</div></div>`;
}
// Boards and messengers come in the looks players know (settings boardStyle, chatStyle); the widget data is the same.
const short = n => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const first = s => Array.from(String(s || '?').trim())[0] || '?';
// a stable small number per name: a 5ch poster ID, an avatar's color
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
const ID_CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const posterId = s => {
  let h = hash(s);
  return Array.from({ length: 8 }, () => ID_CH[(h = (Math.imul(h, 1103515245) + 12345) >>> 0) % 62]).join('');
};
const avatar = name =>
  `<span class="av" style="background:hsl(${hash(name) % 360} 45% 52%)">${esc(first(name))}</span>`;
// opening a post goes back through the command this board came from, so it keeps its board and look
const postList = (w, item) =>
  w.posts && w.posts.length
    ? `<ul>${w.posts.map((x, i) => `<li><button data-open="${esc(x.title)}" data-via="${esc(boardCmd(w))}">${item(x, i)}</button></li>`).join('')}</ul>`
    : '';

function dcHtml(w, p, anon) {
  return `<div class="w w-gal"><div class="gh"><small>${esc(w.site || T('Community'))}</small><div>${esc(w.board || T('Board'))}</div></div>
    ${postList(w, x => `<div class="t">${esc(x.title)} <span class="muted">[${esc(x.comments ?? 0)}]</span></div><div class="m">${esc(x.author || anon)} | ${esc(T('Views {n}', { n: x.views ?? 0 }))} | ${esc(T('Likes {n}', { n: x.likes ?? 0 }))}</div>`)}
    ${
      p
        ? `<div class="post"><h6>${esc(p.title)}</h6><div class="pm">${esc(p.author || anon)} | ${esc(T('Views {n}', { n: p.views ?? 0 }))}</div><div class="pb">${esc(p.body || '')}</div>
      <div class="votes"><span>${T('Upvote')}<b>${esc(p.likes ?? 0)}</b></span><span>${T('Downvote')}<b>${esc(p.dislikes ?? 0)}</b></span></div>
      <div class="cmts">${(p.comments || []).map(c => `<div class="cmt ${c.reply ? 're' : ''}"><small>${esc(c.author || anon)}</small>${esc(c.text)}</div>`).join('')}</div></div>`
        : ''
    }</div>`;
}
function redditHtml(w, p, anon) {
  const sub = 'r/' + String(w.board || T('Board')).replace(/\s+(\S)/g, (m, c) => c.toUpperCase());
  const vote = n => `<span class="rv"><i>▲</i><b>${short(n)}</b><i>▼</i></span>`;
  const cmts = n => `💬 ${esc(T('{n} {n|comment|comments}', { n: n ?? 0 }))}`;
  return `<div class="w w-gal g-reddit"><div class="gh"><span class="ico">r/</span><div><div>${esc(sub)}</div><small>${esc(w.site || T('Community'))}</small></div></div>
    ${postList(w, x => `${vote(x.likes)}<div><div class="m">u/${esc(x.author || anon)} · ${esc(T('Views {n}', { n: short(x.views) }))}</div><div class="t">${esc(x.title)}</div><div class="m">${cmts(x.comments)}</div></div>`)}
    ${
      p
        ? `<div class="post"><div class="pm">${esc(sub)} · u/${esc(p.author || anon)}</div><h6>${esc(p.title)}</h6><div class="pb">${esc(p.body || '')}</div>
      <div class="bar">${vote((p.likes || 0) - (p.dislikes || 0))}<span>${cmts((p.comments || []).length)}</span></div>
      <div class="cmts">${(p.comments || []).map(c => `<div class="cmt ${c.reply ? 're' : ''}"><small>u/${esc(c.author || anon)}</small>${esc(c.text)}</div>`).join('')}</div></div>`
        : ''
    }</div>`;
}
function chHtml(w, p, anon) {
  const res = (c, n, to) =>
    `<dl class="res"><dt><span class="n">${n}</span> ：<b>${esc(c.author || anon)}</b> <span class="id">ID:${posterId(`${c.author || n}|${p.title}`)}</span></dt><dd>${to ? `<span class="anc">&gt;&gt;${to}</span><br>` : ''}${esc(c.text || '')}</dd></dl>`;
  return `<div class="w w-gal g-5ch"><div class="gh">${esc(w.board || T('Board'))}<small>＠${esc(w.site || T('Community'))}</small></div>
    ${postList(w, (x, i) => `<span class="n">${i + 1}:</span> <span class="t">${esc(x.title)}</span> <span class="c">(${esc(x.comments ?? 0)})</span>`)}
    ${p ? `<div class="post"><h6>${esc(p.title)}</h6>${res({ author: p.author, text: p.body }, 1)}${(p.comments || []).map((c, i) => res(c, i + 2, c.reply ? i + 1 : 0)).join('')}</div>` : ''}</div>`;
}
function nicoHtml(w, p, anon) {
  const stats = (v, c, l) => `<span>▶ ${short(v)}</span><span>💬 ${short(c)}</span><span>★ ${short(l)}</span>`;
  const flow = (p && p.comments ? p.comments : [])
    .slice(0, 12)
    // six lanes; negative delays start them mid-flight and half a lap apart within a lane
    .map(
      (c, i) =>
        `<span style="top:${6 + (i % 6) * 14}%;animation-delay:-${(i % 6) * 1.5 + Math.floor(i / 6) * 4.5}s">${esc(c.text)}</span>`,
    )
    .join('');
  return `<div class="w w-gal g-nico"><div class="gh">${esc(w.board || T('Board'))}<small>${esc(w.site || T('Community'))}</small></div>
    ${postList(w, x => `<span class="th">▶</span><div><div class="t">${esc(x.title)}</div><div class="m">${stats(x.views, x.comments, x.likes)}</div><div class="m">${esc(x.author || anon)}</div></div>`)}
    ${
      p
        ? `<div class="post"><div class="player"><div class="pt">${esc(p.title)}</div><div class="flow">${flow}</div></div><h6>${esc(p.title)}</h6><div class="m">${stats(p.views, (p.comments || []).length, p.likes)} · ${esc(p.author || anon)}</div><div class="pb">${esc(p.body || '')}</div>
      <div class="cmts">${(p.comments || []).map(c => `<div class="cmt"><small>${esc(c.author || anon)}</small>${esc(c.text)}</div>`).join('')}</div></div>`
        : ''
    }</div>`;
}
const BOARDS = { dc: dcHtml, reddit: redditHtml, '5ch': chHtml, nico: nicoHtml };
const galleryHtml = w => (BOARDS[w.look] || BOARDS[widgetStyle('boardStyle')] || dcHtml)(w, w.post, T('Anon'));

const msgs = (w, one) => (w.messages || []).map(one).join('');
const CHATS = {
  kakao: w =>
    `<div class="w w-msg"><div class="mh"><small>${esc(w.app || Tc('app', 'Messenger'))}</small>${esc(w.room || T('Chat'))}</div><div class="ms">${msgs(w, m => `<div class="m ${m.me ? 'me' : ''}">${m.me ? '' : `<small>${esc(m.from)}</small>`}<p>${esc(m.text)}</p></div>`)}</div></div>`,
  whatsapp: w =>
    `<div class="w w-msg c-wa"><div class="mh">${avatar(w.room)}<div>${esc(w.room || T('Chat'))}<small>${esc(w.app || Tc('app', 'Messenger'))}</small></div></div><div class="ms">${msgs(w, m => `<div class="m ${m.me ? 'me' : ''}"><p>${m.me ? '' : `<small>${esc(m.from)}</small>`}${esc(m.text)}${m.me ? '<span class="tk">✓✓</span>' : ''}</p></div>`)}</div></div>`,
  line: w =>
    `<div class="w w-msg c-line"><div class="mh">${esc(w.room || T('Chat'))}<small>${esc(w.app || Tc('app', 'Messenger'))}</small></div><div class="ms">${msgs(w, m => (m.me ? `<div class="m me"><span class="rd">${T('Read')}</span><p>${esc(m.text)}</p></div>` : `<div class="m">${avatar(m.from)}<div><small>${esc(m.from)}</small><p>${esc(m.text)}</p></div></div>`))}</div></div>`,
};
const messengerHtml = w => (CHATS[widgetStyle('chatStyle')] || CHATS.kakao)(w);
// a constellation board (the /성좌 command) is a gallery whose site or board names the constellations
const isStarBoard = w => mentionsStars((w.site || '') + (w.board || ''));
const boardCmd = w => {
  const own = w.look && CMDS.find(c => c.look === w.look); // /reddit, /5ch
  return cmdName(own ? own.id : isStarBoard(w) ? 'star' : 'board');
};

export const WIDGETS = {
  news: {
    label: N_('News'),
    render: newsHtml,
    followups: () => [[`${cmdName('news')} ${T('show me other news too')}`, T('More news')]],
    markdown: w =>
      `**[${w.outlet || Tc('export', 'News')}] ${w.headline || ''}**\n\n${w.body || ''}\n\n${(w.quotes || []).map(q => '> ' + q).join('\n')}\n\n`,
  },
  quest: {
    label: N_('Quests'),
    render: questHtml,
    followups: () => [[`${cmdName('quest')} ${T('show me other quests too')}`, T('Other quests')]],
    markdown: w =>
      `**${w.board || T('Quests')}**\n\n${(w.quests || []).map(q => `- [${q.rank || ''}] ${q.title}: ${q.body || ''}`).join('\n')}\n\n`,
  },
  gallery: {
    label: N_('Board'),
    render: galleryHtml,
    followups: w => {
      const base = boardCmd(w);
      return [
        ...(w.post ? [[`${base} ${T('back to the list')}`, T('Back to list')]] : []),
        [`${base} ${T('show me other posts too')}`, T('Other posts')],
        ['comment', T('Comment')],
      ];
    },
    markdown: w =>
      w.post
        ? `**${w.site || ''} ${w.board || ''}: ${w.post.title || ''}**\n\n${w.post.body || ''}\n\n${(w.post.comments || []).map(c => `- ${c.author}: ${c.text}`).join('\n')}\n\n`
        : `**${w.site || ''} ${w.board || ''}**\n\n${(w.posts || []).map(p => '- ' + p.title).join('\n')}\n\n`,
  },
  messenger: {
    label: N_('Messages'),
    render: messengerHtml,
    followups: () => [
      ['reply', T('Reply')],
      [`${cmdName('chat')} ${T("(don't reply; wait for their response)")}`, T('Wait for a reply')],
    ],
    markdown: w =>
      `**${w.app || Tc('app', 'Messenger')}: ${w.room || ''}**\n\n${(w.messages || []).map(m => `- ${m.me ? T('Me') : m.from}: ${m.text}`).join('\n')}\n\n`,
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
  return `<details class="wrap"><summary>${T('Show {label}', { label: T(def.label) })}</summary>${html}</details>`;
}
