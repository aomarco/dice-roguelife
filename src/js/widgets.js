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
import { setting } from './settings.js';
import { cmdName } from './data.js';
import { N_, T, Tc } from './i18n.js';

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
function galleryHtml(w) {
  const p = w.post;
  const anon = T('Anon');
  return `<div class="w w-gal"><div class="gh"><small>${esc(w.site || T('Community'))}</small><div>${esc(w.board || T('Board'))}</div></div>
    ${w.posts && w.posts.length ? `<ul>${w.posts.map(x => `<li><button data-open="${esc(x.title)}"><div class="t">${esc(x.title)} <span class="muted">[${esc(x.comments ?? 0)}]</span></div><div class="m">${esc(x.author || anon)} | ${esc(T('Views {n}', { n: x.views ?? 0 }))} | ${esc(T('Likes {n}', { n: x.likes ?? 0 }))}</div></button></li>`).join('')}</ul>` : ''}
    ${
      p
        ? `<div class="post"><h6>${esc(p.title)}</h6><div class="pm">${esc(p.author || anon)} | ${esc(T('Views {n}', { n: p.views ?? 0 }))}</div><div class="pb">${esc(p.body || '')}</div>
      <div class="votes"><span>${T('Upvote')}<b>${esc(p.likes ?? 0)}</b></span><span>${T('Downvote')}<b>${esc(p.dislikes ?? 0)}</b></span></div>
      <div class="cmts">${(p.comments || []).map(c => `<div class="cmt ${c.reply ? 're' : ''}"><small>${esc(c.author || anon)}</small>${esc(c.text)}</div>`).join('')}</div></div>`
        : ''
    }</div>`;
}
function messengerHtml(w) {
  return `<div class="w w-msg"><div class="mh"><small>${esc(w.app || Tc('app', 'Messenger'))}</small>${esc(w.room || T('Chat'))}</div><div class="ms">${(w.messages || []).map(m => `<div class="m ${m.me ? 'me' : ''}">${m.me ? '' : `<small>${esc(m.from)}</small>`}<p>${esc(m.text)}</p></div>`).join('')}</div></div>`;
}
// a constellation board (the /성좌 command) is a gallery whose site or board names the constellations
const isStarBoard = w => mentionsStars((w.site || '') + (w.board || ''));

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
      const base = cmdName(isStarBoard(w) ? 'star' : 'board');
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
