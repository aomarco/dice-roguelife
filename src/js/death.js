/* ============ death & ledger ============ */
import { esc } from './util.js';
import { tierRank, TIERS } from './data.js';
import { platform } from './db.js';
import { app, currentRun, exclusive } from './app.js';
import { setting } from './settings.js';
import { cueScore } from './sound.js';
import { pushTurn } from './persistence.js';
import { renderLog } from './log.js';
import { sampleError } from './turn.js';
import { fillTemplate, prompts, turnText } from './prompt.js';

export function deathPanel() {
  if (app.state.pendingInherit !== undefined)
    return `<div class="turn"><div class="row death-actions"><button class="btn primary" id="regressBtn">회귀하기</button></div></div>`;
  return `<div class="turn death"><h4>사망</h4><p class="death-lead">${app.state.lifeNo}번째 삶이 끝났습니다.</p><button class="btn primary" id="ledgerBtn">인생 결산</button></div>`;
}
export function ledgerCard(o, ti) {
  if (!o) return '';
  return `<div class="death"><h4>인생 결산</h4><div class="row ledger-score-row"><span class="score">${esc(o.score)}</span><span class="muted">점</span></div>
   <p class="ledger-epitaph">${esc(o.epitaph || '')}</p><p class="muted ledger-summary">${esc(o.summary || '')}</p>
   ${(o.highlights || []).map(h => `<div class="skill"><div><p class="ledger-highlight">${esc(h)}</p></div></div>`).join('')}
   ${o.inherit && o.inherit.name ? `<div class="item ledger-inherit"><div class="m">다음 생으로 계승</div><div class="t"><span class="tier ${o.inherit.grade}">${o.inherit.grade}</span> ${esc(o.inherit.name)}</div><div class="m">${esc(o.inherit.desc || '')}</div></div>` : ''}
   ${ti !== undefined ? `<div class="row actions"><button class="btn" data-card="${ti}">공유 카드</button>${platform.memMode || platform.localMode ? '' : `<button class="btn ${o.hallId ? 'ghost' : 'primary'}" data-hall="${ti}" ${o.hallId ? 'disabled' : ''}>${o.hallId ? '전당에 올림' : '전당에 올리기'}</button>`}</div>` : ''}</div>`;
}
export function runLedger() {
  return exclusive(writeLedger);
}
async function writeLedger() {
  const run = currentRun();
  app.phase = 'ledger';
  renderLog();
  const best = app.state.skills.reduce(
    (b, k) => (tierRank(k.grade) < tierRank(b) ? k.grade : b),
    app.state.life.originTier,
  );
  const cap = TIERS[Math.min(TIERS.length - 1, Math.max(tierRank(best), tierRank('SSS')))];
  try {
    const recent = app.turns.slice(-16).map(turnText).join('\n\n');
    const o = await platform.sample.json(
      fillTemplate(prompts.ledger, {
        name: app.state.life.name,
        cap,
        world: app.state.life.world.name,
        race: app.state.life.race,
        origin: app.state.life.origin,
        tier: app.state.life.originTier,
        age: app.state.stats.age,
        power: app.state.stats.power,
        title: app.state.title,
        skills: app.state.skills.map(k => k.name + '(' + k.grade + ')').join(', '),
        summary: app.state.summaries
          .filter(x => x.life === app.state.lifeNo)
          .map(x => x.text)
          .join(' '),
        recent: recent.slice(-8000),
        langLine:
          app.settings.lang === 'en' ? prompts.ledgerLangEn : app.settings.lang === 'ja' ? prompts.ledgerLangJa : '',
      }),
      { modelTier: setting('tier'), cache: false },
    );
    if (run.abandoned) return; // the save was left while the ledger was being written
    const inh =
      o.inherit && o.inherit.name
        ? {
            name: String(o.inherit.name).slice(0, 30),
            grade:
              TIERS.includes(o.inherit.grade) && tierRank(o.inherit.grade) >= tierRank(cap) ? o.inherit.grade : cap,
            desc: String(o.inherit.desc || '').slice(0, 120),
          }
        : {};
    o.inherit = inh;
    app.state.pastLives.push({
      lifeNo: app.state.lifeNo,
      world: app.state.life.world.name,
      origin: app.state.life.origin,
      tier: app.state.life.originTier,
      epitaph: String(o.epitaph || '').slice(0, 120),
      score: o.score,
    });
    app.state.pastLives = app.state.pastLives.slice(-30);
    app.state.pendingInherit = inh;
    app.phase = 'busy';
    cueScore(o.score || 0);
    await pushTurn({ kind: 'ledger', out: o });
  } catch (e) {
    if (run.abandoned) return; // the save was left: the phase belongs to whatever runs now
    app.phase = 'busy';
    sampleError(e);
  }
  renderLog();
}
