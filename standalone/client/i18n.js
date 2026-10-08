// The add-on's own screen text: its catalogs (../locales), then the game's (words both use, such as 'Settings').
import { T, uiLang } from '../../src/js/i18n.js';
import KO from '../locales/ko.json' with { type: 'json' };
import JA from '../locales/ja.json' with { type: 'json' };

export const CATALOGS = { ko: KO, ja: JA };

export function tr(en, vars) {
  const own = (CATALOGS[uiLang()] || {})[en];
  return T(own !== undefined ? own : en, vars);
}
