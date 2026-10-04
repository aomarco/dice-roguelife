/* ============ compat: old saves brought up to date ============ */
import { currencyOf, initMurim, rollSubStats, WORLD_ALIAS, WORLDS } from './data.js';
import { dedupeQuests, snapshotRules } from './rules.js';

export function compat(st) {
  st.cast = st.cast || {};
  if (st.life && st.life.world && WORLD_ALIAS[st.life.world.id]) {
    const [bg, en] = WORLD_ALIAS[st.life.world.id];
    const nw = WORLDS.find(w => w.id === bg);
    if (nw) {
      st.life.world = nw;
      if (en && !st.life.entry) st.life.entry = en;
    }
  }
  if (st.life && !st.life.entry) st.life.entry = 'native';
  if (!st.rules) st.rules = snapshotRules();
  if (Array.isArray(st.quests)) st.quests = dedupeQuests(st.quests);
  if (!st.goldV && st.stats && st.life && st.life.world) {
    const m = currencyOf(st.life.world.id)[1];
    if (m > 1) st.stats.gold = Math.round((st.stats.gold || 0) * m);
    st.goldV = 2;
  }
  st.titles = Array.isArray(st.titles) ? st.titles : st.title && st.title !== '없음' ? [st.title] : [];
  if (st.stats && st.stats.str === undefined) Object.assign(st.stats, rollSubStats(st.life ? st.life.originTier : 'C'));
  if (st.stats && st.stats.con === undefined) st.stats.con = rollSubStats(st.life ? st.life.originTier : 'C').con;
  st.clock = st.clock || { day: 0, date: '', time: '', weather: '', place: '' };
  if (st.life && st.life.world.id === 'murim' && !st.murim) st.murim = initMurim(st.life.originTier);
  return st;
}
