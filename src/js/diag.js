/* ============ diagnostics: the recent errors kept for ⚙ ============ */
import { nowIso } from './util.js';
import { locale } from './i18n.js';
import { dset } from './db.js';
import { app, APP_VERSION } from './app.js';

export const ERRLOG = [];
let diagTimer = null;
export function catchPageErrors() {
  window.addEventListener('error', e => {
    try {
      logErr('page', e.error || { message: e.message });
    } catch {
      // the error logger must never throw from inside an error handler
    }
  });
  window.addEventListener('unhandledrejection', e => {
    try {
      const r = e.reason;
      if (r && r.code === 'cancelled') return;
      logErr('async', r || { message: 'unhandled rejection' });
    } catch {
      // the error logger must never throw from inside an error handler
    }
  });
}
// the last few errors, readable later when something goes wrong
export function logErr(stage, e) {
  ERRLOG.unshift({
    t: new Date().toLocaleTimeString(locale()),
    at: nowIso(),
    stage,
    code: (e && e.code) || '',
    msg: String((e && e.message) || e).slice(0, 200),
    text: String((e && e.text) || '').slice(0, 300),
    save: (app.currentSave && app.currentSave.id) || '',
    v: 'v' + APP_VERSION,
  });
  ERRLOG.length = Math.min(ERRLOG.length, 8);
  clearTimeout(diagTimer);
  diagTimer = setTimeout(() => {
    dset('diag', { errors: ERRLOG.slice(0, 8), at: nowIso() }).catch(() => {}); // the error log never reports on itself
  }, 1500);
}
