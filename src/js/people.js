/* ============ people: names, aliases, relations ============ */
import { app } from './app.js';

export function canonName(n) {
  let x = String(n || '').trim();
  const A = (app.state && app.state.aliases) || {};
  for (let k = 0; k < 4 && A[x]; k++) x = A[x];
  return x;
}
export function aliasOut(o) {
  const A = app.state && app.state.aliases;
  if (!A || !Object.keys(A).length || !o)
    return o; /* a merged label used again is the kept person, before faces or notes are touched */
  if (o.speaker) o.speaker = canonName(o.speaker);
  if (Array.isArray(o.also_present))
    o.also_present.forEach(p => {
      if (p && p.name) p.name = canonName(p.name);
    });
  const m = o.memory;
  if (m && Array.isArray(m.relations))
    m.relations.forEach(r => {
      if (r && r.name) r.name = canonName(r.name);
    });
  if (typeof o.narration === 'string')
    o.narration = o.narration.replace(/\[\[(?!@)([^\]]+)\]\]/g, (x, n) => `[[${canonName(n)}]]`);
  return o;
}
export function renamePerson(a, b) {
  let moved = false;
  if (a && b && a !== b) {
    app.state.aliases = app.state.aliases || {};
    if (app.state.aliases[b] === a) delete app.state.aliases[b];
    app.state.aliases[a] = b;
    for (const k of Object.keys(app.state.aliases)) if (app.state.aliases[k] === a) app.state.aliases[k] = b;
    moved = true;
  } /* one person under two labels: the kept label takes the face, its weight and the notes */
  for (const k of ['cast', 'castW', 'castWhy', 'seen']) {
    const m = app.state[k];
    if (m && Object.prototype.hasOwnProperty.call(m, a)) {
      if (m[b] == null) m[b] = m[a];
      else if (k === 'seen') m[b] = (m[b] || 0) + (m[a] || 0);
      delete m[a];
      moved = true;
    }
  }
  const R = app.state.relations;
  if (R && R[a] != null) {
    R[b] = R[b] ? (R[b] + ' ' + R[a]).slice(0, 300) : R[a];
    delete R[a];
    moved = true;
  }
  if (app.state.meta && app.state.meta[a]) {
    const ma = app.state.meta[a],
      mb = app.state.meta[b];
    if (mb) {
      mb.f = Math.min(mb.f, ma.f);
      mb.l = Math.max(mb.l || 0, ma.l || 0);
    } else app.state.meta[b] = ma;
    delete app.state.meta[a];
    moved = true;
  }
  if (Array.isArray(app.state.noFace)) {
    const n = app.state.noFace.length;
    app.state.noFace = app.state.noFace.filter(x => x !== a);
    if (app.state.noFace.length !== n) moved = true;
  }
  return moved;
}
const REL_FRESH = 200;
function ledgerNames() {
  const t = Object.values(app.state.ledger || {}).join(' ');
  return Object.keys(app.state.relations || {}).filter(n => t.includes(n));
}
export function activeRel() {
  const t = app.state.next || 0,
    meta = app.state.meta || {},
    led = new Set(ledgerNames());
  return Object.entries(app.state.relations || {})
    .filter(([n]) => {
      const m = meta[n];
      return led.has(n) || !m || m.l == null || t - m.l <= REL_FRESH;
    })
    .slice(-12);
}
export function markSeen(name) {
  if (!name) return;
  const t = app.state.next;
  app.state.meta = app.state.meta || {};
  const m = app.state.meta[name] || (app.state.meta[name] = { f: t });
  m.l = t;
  if (m.f == null || t < m.f) m.f = t;
}
