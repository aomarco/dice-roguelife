/* ============ images: lookups over the image library (by id, character sets, worlds, portraits) ============ */
import { host } from './host.js';
import { esc, pick } from './util.js';
import { EMO_FB, WORLD_ALIAS, WORLDS } from './data.js';
import { app } from './app.js';
import { canonName } from './people.js';

export const imgUrl = id => host().assetUrl(id);
export function sceneHtml(sc, people) {
  // background banner on top, the people present in a row underneath (never layered)
  const ppl = (people || []).filter(p => p && p.x).slice(0, 3);
  const bg = sc ? `<div class="scene" style="background-image:url('${imgUrl(sc.id)}')"></div>` : '';
  const row = ppl.length
    ? `<div class="castrow n${ppl.length}">${ppl.map(p => `<figure><img class="char" alt="" src="${imgUrl(p.x.id)}">${p.npc ? `<figcaption>${esc(p.npc)}</figcaption>` : ''}</figure>`).join('')}</div>`
    : '';
  return bg + row;
}
export function turnPeople(ti, o) {
  // [{x,npc}] for a turn, main speaker first; older turns only have img.char
  const list =
    Array.isArray(ti.chars) && ti.chars.length ? ti.chars : ti.char ? [{ id: ti.char, npc: o.speaker || '' }] : [];
  return list.map(c => ({ x: imgById(c.id), npc: canonName(c.npc || ''), hidden: !!c.hidden })).filter(p => p.x);
}
export function imgById(id) {
  if (!id) return null;
  const m = (app.settings.dupMap || {})[id];
  return app.images.find(x => x.id === id) || (m ? app.images.find(x => x.id === m) : null);
}
export function setCover(k, imgs) {
  imgs = imgs || charSetsAll()[k] || [];
  const c = (app.setMeta[k] || {}).cover;
  return (
    (c && imgs.find(x => x.id === c)) ||
    imgs.find(x => x.emotion === 'neutral') ||
    imgs.find(x => x.emotion === 'smile') ||
    imgs[0]
  );
}
export function charSetsAll() {
  const m = {};
  for (const x of app.images) {
    if (x.kind !== 'char') continue;
    const k = x.set || x.name;
    (m[k] = m[k] || []).push(x);
  }
  return m;
}
export function charSets() {
  const m = {};
  for (const x of app.images) {
    if (x.kind !== 'char' || x.off || (app.setMeta[x.set || x.name] || {}).off || (x.set || x.name) === 'admin')
      continue;
    const k = x.set || x.name;
    (m[k] = m[k] || []).push(x);
  }
  return m;
}
export function genderOf(k) {
  const g = (app.setMeta[k] || {}).gender;
  if (g) return g;
  return /^female/.test(k) ? 'female' : /^male/.test(k) ? 'male' : null;
}
// possess named no background, so the label just drops
export const liveWorldIds = list => [
  ...new Set(
    list
      .map(v => (WORLD_ALIAS[v] ? (v === 'possess' ? null : WORLD_ALIAS[v][0]) : v))
      .filter(v => v && WORLDS.some(o => o.id === v)),
  ),
];
export function worldsOf(x) {
  if (!x) return [];
  let w = x.worlds;
  if (typeof w === 'string')
    w = w
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  if (Array.isArray(w)) return liveWorldIds(w);
  return x.world && x.world !== 'any' && x.world !== 'multi' ? liveWorldIds([x.world]) : [];
}
// an image or set card fits these worlds (ids); none means every world. `world` is the older single label kept in step.
export function setWorlds(x, ids) {
  x.worlds = ids;
  x.world = ids.length === 1 ? ids[0] : ids.length ? 'multi' : 'any';
}
// labels are the source of truth: list every world an image fits
export function fitsWorld(x, w) {
  const ws = worldsOf(x);
  return !ws.length || ws.includes(w);
}
export function worldChips(sel, attr) {
  const cur = new Set(sel || []);
  return `<div class="seg world-chips">${WORLDS.map(w => `<button type="button" ${attr}="${w.id}" aria-pressed="${cur.has(w.id)}" class="chip-sm">${w.name}</button>`).join('')}</div><div class="muted world-chips-note">아무것도 안 고르면 모든 세계</div>`;
}
export function bgKey(x) {
  return String(x.name || '').replace(/^bg[_-]/, '');
}
export function pickEmotion(k, emo, look) {
  const imgs = charSets()[k];
  if (!imgs || !imgs.length) return null;
  const by = e => imgs.filter(x => (x.emotion || 'neutral') === e);
  let c = by(emo);
  if (!c.length && EMO_FB[emo]) c = by(EMO_FB[emo]);
  if (!c.length) c = by('neutral');
  if (!c.length) c = imgs;
  const want = (Array.isArray(look) ? look : []).map(x => String(x).toLowerCase()).filter(Boolean);
  if (want.length) {
    const hit = c.filter(x =>
      [...(x.tags || []), x.variant || '']
        .join(' ')
        .toLowerCase()
        .split(/[\s,_]+/)
        .some(t => t && want.includes(t)),
    );
    if (hit.length) c = hit;
  }
  return pick(c);
}
