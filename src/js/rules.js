/* ============ rules: what a save froze at its start, growth, checks, titles ============ */
import { WORLDS } from './data.js';
import { app } from './app.js';
import { setting } from './settings.js';

const RULE_KEYS = ['growth', 'knowledgeGuard', 'dice', 'gambler', 'gamblerP'];
export function snapshotRules() {
  const r = {};
  for (const k of RULE_KEYS) r[k] = app.settings[k] === undefined ? null : app.settings[k];
  return r;
}
export function rule(k) {
  if (app.state && app.state.rules && k in app.state.rules) {
    const v = app.state.rules[k];
    return v === null ? undefined : v;
  }
  return app.settings[k];
}
const GROWTH_LEVELS = {
  stingy: { name: '짠맛', gm: 0.5, subMax: 1, cool: 8, key: 'stingy' },
  tight: { name: '빡빡함', gm: 0.75, subMax: 2, cool: 4, key: 'stingy' },
  normal: { name: '보통', gm: 1, subMax: 3, cool: 0, key: '' },
  ample: { name: '넉넉함', gm: 1.25, subMax: 3, cool: 0, key: 'generous' },
  generous: { name: '후함', gm: 1.5, subMax: 4, cool: 0, key: 'generous' },
};
export function lifeDiff(l) {
  l = l || (app.state && app.state.life);
  if (!l) return 3;
  if (l.diff) return l.diff;
  const w = WORLDS.find(x => x.id === (l.world || {}).id);
  const d = w && w.diff;
  return Array.isArray(d) ? Math.round((d[0] + d[1]) / 2) : d || 3;
}
export function growthLevel() {
  const g = rule('growth') || 'auto';
  if (GROWTH_LEVELS[g] && g !== 'auto') return GROWTH_LEVELS[g];
  const d = lifeDiff();
  const ds = { 1: 1, 2: 1, 3: 0, 4: -1, 5: -1 }[d] || 0;
  const ps = { star: -1, dealer: -1, archivist: 0, fan: 1, custom: 0 }[setting('adminPersona')] || 0;
  const early = app.state && app.state.lifeStart != null && app.state.next - app.state.lifeStart < 20 ? 1 : 0; // beginners learn fast
  const t = ds + ps + early;
  return GROWTH_LEVELS[t <= -2 ? 'stingy' : t === -1 ? 'tight' : t === 0 ? 'normal' : t === 1 ? 'ample' : 'generous'];
}
const SYSTEM_WORLDS = ['hunter', 'vrmmo', 'tower', 'academy'];
export let statusVisible = function statusVisible() {
  const m = setting('statusMode');
  if (m === 'never') return false;
  if (m === 'always') return true;
  if (!app.state) return true;
  if (app.state.statusUnlocked) return true;
  if (m === 'awaken') return false;
  return !SYSTEM_WORLDS.includes(app.state.life.world.id);
};
/* ---- dice ---- */
// An offered choice ends in its chance, "(성공 확률 30%)", maybe with a word that makes it decisive ("결정적").
// A d100 at or below the chance succeeds. Succeeding at a low chance, or failing at a high one, is critical.
export const ODDS_RE = /\s*\(\s*성공\s*확률\s*(\d{1,3})\s*%([^)]*)\)\s*$/;
export const PIVOTAL_RE = /결정적|운명|목숨/; // the dice reveal plays whatever the result
const CRIT_SUCCESS_MAX = 20; // a success at this chance or lower is critical
const CRIT_FAIL_MIN = 80; // a failure at this chance or higher is critical
export function rollGrade(r) {
  return r.ok ? (r.p <= CRIT_SUCCESS_MAX ? 'critSuccess' : 'success') : r.p >= CRIT_FAIL_MIN ? 'critFail' : 'fail';
}
export function critOf(r) {
  return !!r && r.p != null && (rollGrade(r).startsWith('crit') || !!r.pivotal);
}
// a skill's energy cost as % of max, or 0 for none
export const costPct = v => {
  const n = Math.round(Number(String(v == null ? '' : v).replace('%', '')));
  return n >= 1 && n <= 100 ? n : 0;
};
// combat power worn items add; growth caps apply to the base only
export const itemBonus = () =>
  ((app.state && app.state.equipped) || []).reduce((a, n) => {
    const it = (app.state.items || []).find(x => x.name === n);
    return a + ((it && it.power) || 0);
  }, 0);
export const TITLES_MAX = 3;
export function titlesOn() {
  let on = Array.isArray(app.state.titlesOn)
    ? app.state.titlesOn.filter(t => (app.state.titles || []).includes(t))
    : null;
  if (!on || !on.length) on = app.state.title && app.state.title !== '없음' ? [app.state.title] : [];
  return on.slice(0, TITLES_MAX);
}
export function sameQuest(a, b) {
  const n = x => String(x || '').replace(/[^0-9A-Za-z가-힣]/g, '');
  const A = n(a),
    B = n(b);
  if (!A || !B) return false;
  if (A === B || A.includes(B) || B.includes(A)) return true;
  const ta = qTok(a),
    tb = qTok(b);
  if (!ta.length || !tb.length) return false;
  const hit = ta.filter(w => tb.some(v => v.includes(w) || w.includes(v))).length;
  return hit / Math.min(ta.length, tb.length) >= 0.6;
}
export function dedupeQuests(list) {
  const out = [];
  for (const q of list || []) {
    const ex = q.status === 'active' && out.find(x => x.status === 'active' && sameQuest(x.title, q.title));
    if (ex) {
      if (q.note) ex.note = q.note;
    } else out.push(q);
  }
  return out;
}

const qTok = t =>
  String(t || '')
    .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

// the functions above that tests may replace (window.DR.mock): each setter swaps the binding every caller uses
export const mocks = {
  statusVisible: f => (statusVisible = f),
};
