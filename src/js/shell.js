/* ============ shell: discreet mode, title taps, tabs ============ */
import { $, noteIgnored, toast } from './util.js';
import { app } from './app.js';
import { saveSettings } from './settings.js';
import { closeSheet } from './sheet.js';
import { renderLog } from './log.js';
import { applyEnterHint } from './composer.js';
import { T } from './i18n.js';

/* ============ discreet mode ============ */
export function applyDiscreet() {
  try {
    applyEnterHint();
  } catch (e) {
    noteIgnored('discreet mode: enter hint', e);
  }
  document.documentElement.classList.toggle('wdark', !!app.settings.wdark);
  const on = !!app.settings.discreet;
  document.documentElement.classList.toggle('discreet', on);
  document.title = on ? 'Claude' : T('Dice Roguelife');
  const tc = $('#themeColor');
  if (tc) tc.content = on ? '#262624' : '#000000';
  const b = $('.brand');
  b.childNodes[0].nodeValue = on ? 'Claude' : T('Dice Roguelife');
  if (on) closeSheet();
}
let brandTaps = [];
export function bindDiscreetTaps() {
  // three quick taps on the title switch discreet mode
  $('.brand').addEventListener('click', async () => {
    const now = Date.now();
    brandTaps = brandTaps.filter(at => now - at < 900);
    brandTaps.push(now);
    if (brandTaps.length >= 3) {
      brandTaps = [];
      app.settings.discreet = !app.settings.discreet;
      applyDiscreet();
      if (app.state) renderLog();
      await saveSettings().catch(e => noteIgnored('app: dset settings', e));
      toast(app.settings.discreet ? T('Discreet mode on') : T('Discreet mode off'));
    }
  });
}
/* ============ tabs ============ */
export function bindTabs() {
  document.querySelectorAll('nav.tabs button').forEach(b => (b.onclick = () => showTab(b.dataset.tab)));
}
const tabViews = {}; // tab name -> its render function, handed in by main.js (setTabViews)
let shownTab = 'play';
export function setTabViews(views) {
  Object.assign(tabViews, views);
}
export function showTab(tab) {
  shownTab = tab;
  document
    .querySelectorAll('nav.tabs button')
    .forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
  if (tabViews[tab]) tabViews[tab]();
}
export const activeTab = () => shownTab;
export function bindScrollFade() {
  // scrollbars show while a pane scrolls, then fade
  document.querySelectorAll('.log,.view').forEach(el => {
    let tm = null;
    el.addEventListener(
      'scroll',
      () => {
        el.classList.add('scrolling');
        clearTimeout(tm);
        tm = setTimeout(() => el.classList.remove('scrolling'), 900);
      },
      { passive: true },
    );
  });
}
