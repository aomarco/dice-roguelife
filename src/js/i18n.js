/* ============ i18n ============ */
// English is the source; src/locales/<lang>.json maps the English to each other language (see CLAUDE.md).
import KO from '../locales/ko.json' with { type: 'json' };
import JA from '../locales/ja.json' with { type: 'json' };

export const SOURCE_LANG = 'en';
export const UI_LANGS = ['en', 'ko', 'ja'];
export const LANG_NAMES = { en: 'English', ko: '한국어', ja: '日本語' }; // i18n-ignore: each in its own language
const LOCALES = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP' };
const CATALOGS = { ko: KO, ja: JA };

let cur = SOURCE_LANG;

// {name} from vars; {n|one|other} picks by whether vars.n is 1
function fill(s, vars) {
  if (!vars) return String(s);
  return String(s)
    .replace(/\{(\w+)\|([^|{}]*)\|([^|{}]*)\}/g, (m, k, one, other) =>
      vars[k] === undefined ? m : Number(vars[k]) === 1 ? one : other,
    )
    .replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
}

export function tIn(lang, en, vars) {
  const c = CATALOGS[lang];
  return fill(c && c[en] !== undefined ? c[en] : en, vars);
}
// capital T: `t` is a common local name here (a turn, a timer) and would shadow it
export function T(en, vars) {
  return tIn(cur, en, vars);
}
// one language's entry for a key, or undefined (no English fallback)
export const catalogEntry = (lang, key) => (CATALOGS[lang] || {})[key];
// marks text for translation where it is defined; T() translates it where it is shown
export const N_ = en => en;
// same English, different meaning in another language: the catalog key is 'en|ctx'
export function Tc(ctx, en, vars) {
  const c = CATALOGS[cur];
  return tIn(cur, c && c[en + '|' + ctx] !== undefined ? en + '|' + ctx : en, vars);
}

export function uiLang() {
  return cur;
}
export const isKo = () => cur === 'ko';
export const locale = (lang = cur) => LOCALES[lang] || 'en-US';
export const okLang = l => UI_LANGS.includes(l);
// <option>s naming each language in itself
export const langOptions = (langs = UI_LANGS) =>
  langs.map(l => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('');

const LS_KEY = 'dr:uiLang';
export function browserLang() {
  const first = typeof navigator !== 'undefined' && ((navigator.languages || [])[0] || navigator.language);
  const base = String(first || '')
    .toLowerCase()
    .split('-')[0];
  return okLang(base) ? base : SOURCE_LANG;
}
export function rememberedLang() {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (okLang(v)) return v;
  } catch {
    // storage blocked: use the browser's language
  }
  return null;
}
export function setUiLang(l) {
  cur = okLang(l) ? l : SOURCE_LANG;
  try {
    localStorage.setItem(LS_KEY, cur);
  } catch {
    // storage blocked: the settings document still keeps the choice
  }
  if (typeof document !== 'undefined') document.documentElement.lang = cur;
  return cur;
}

// index.html marks fixed text with data-t / data-t-html / data-t-attr; the English is kept in data-en* to switch back
export const oneLine = s =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
export function translateStatic(root = document) {
  root.querySelectorAll('[data-t]').forEach(el => {
    if (el.dataset.en === undefined) el.dataset.en = oneLine(el.textContent);
    el.textContent = T(el.dataset.en);
  });
  root.querySelectorAll('[data-t-html]').forEach(el => {
    if (el.dataset.enHtml === undefined) el.dataset.enHtml = oneLine(el.innerHTML);
    el.innerHTML = T(el.dataset.enHtml);
  });
  root.querySelectorAll('[data-t-attr]').forEach(el => {
    for (const a of el.dataset.tAttr.split(',').map(x => x.trim())) {
      const key = 'en' + a.replace(/(^|-)(\w)/g, (m, d, c) => c.toUpperCase());
      if (el.dataset[key] === undefined) el.dataset[key] = el.getAttribute(a) || '';
      el.setAttribute(a, T(el.dataset[key]));
    }
  });
}
