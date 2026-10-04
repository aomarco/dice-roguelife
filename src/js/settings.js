/* ============ settings: this player's preferences ============ */
import { dset } from './db.js';
import { app } from './app.js';

// app.settings holds them (loaded at boot from the 'settings' document). setting(key) reads one with its default
// when it was never set, and saveSettings() writes them: one write at a time, in order, so an older copy never
// lands after a newer one.
export const SETTING_DEFAULTS = {
  tier: 'default', // the narrator's model tier
  len: 'normal', // reply length
  lang: 'ko', // play language
  adminPersona: 'star',
  statusMode: 'auto', // when the status window shows numbers
  growth: 'auto', // how generous stat growth is
  questStyle: 'board',
  newsStyle: 'broadcast',
  gamblerP: 0.15, // the chance of a jackpot, and of a doom, each turn with the gambler's stone
};

let writes = Promise.resolve();
let loaded = false; // set once boot has read the stored settings: before that a write would replace them with defaults

export function setting(key) {
  return app.settings[key] || SETTING_DEFAULTS[key];
}
export function settingsLoaded() {
  loaded = true;
}
export function saveSettings() {
  if (!loaded) return Promise.resolve(); // the start failed before the settings were read: keep the stored ones
  const write = writes.then(() => dset('settings', app.settings));
  writes = write.catch(() => {}); // the queue only orders the writes: whoever awaits `write` gets its error
  return write;
}
