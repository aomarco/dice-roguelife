// The AI connection controls in ⚙ Settings, the standalone update steps, and the "choose a model" banner.
import { platform } from '../../src/js/db.js';
import { APP_VERSION } from '../../src/js/app.js';
import { openSheet } from '../../src/js/sheet.js';
import { openSettingsSheet } from '../../src/js/settings-sheet.js';
import { N_ } from '../../src/js/i18n.js';
import { $, esc } from '../../src/js/util.js';
import { tr } from './i18n.js';
import { PROVIDERS, providerConfig, providerHasKey, providerUsage, saveConnection } from './providers.js';

const PROTOCOLS = [
  ['compatible', N_('OpenAI-compatible')],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['gemini', 'Gemini'],
  ['azure', 'Azure OpenAI'],
  ['perplexity', 'Perplexity Sonar'],
];
// form field -> connection setting
const TEXT = {
  Provider: 'provider',
  Endpoint: 'endpoint',
  Protocol: 'protocol',
  Model: 'model',
  Summary: 'summaryModel',
  Version: 'apiVersion',
};
const NUMBERS = { Max: 'maxTokens', Budget: 'promptBytes', Retries: 'retries' };
const CHECKS = { Stream: 'stream', Json: 'jsonMode', Vision: 'vision' };

function panelHtml() {
  const opts = list => list.map(([v, label]) => `<option value="${v}">${esc(tr(label))}</option>`).join('');
  const check = (id, label) => `<label class="row opt"><input id="${id}" type="checkbox">${label}</label>`;
  const field = (id, label, attrs = '') =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" ${attrs}></div>`;
  return `<details class="diag-box" open><summary>${tr('AI connection')}</summary><div class="diag-body provider-fields">
    <div class="field"><label for="apiProvider">${tr('Provider')}</label><select id="apiProvider">${opts(PROVIDERS.map(p => [p.id, p.name]))}</select></div>
    ${field('apiEndpoint', tr('API base URL'), 'type="url"')}
    <div class="field"><label for="apiProtocol">${tr('API protocol')}</label><select id="apiProtocol">${opts(PROTOCOLS)}</select></div>
    ${field('apiKey', tr('API key (optional for local models)'), 'type="password" autocomplete="off"')}
    ${field('apiModel', tr('Model ID (Azure: deployment name)'), 'autocomplete="off"')}
    ${field('apiSummary', tr('Summary model ID (optional)'), 'autocomplete="off"')}
    ${field('apiVersion', tr('Azure API version'), 'placeholder="2024-10-21"')}
    <div class="row"><div class="field grow"><label for="apiMax">${tr('Maximum output tokens')}</label><input id="apiMax" type="number" min="64" max="65536"></div><div class="field grow"><label for="apiBudget">${tr('Prompt byte limit')}</label><input id="apiBudget" type="number" min="1000" max="2000000"></div></div>
    <div class="field"><label for="apiRetries">${tr('Retries for rate limits or server errors')}</label><select id="apiRetries">${opts(['0', '1', '2'].map(n => [n, n]))}</select></div>
    ${check('apiStream', tr('Stream replies'))}
    ${check('apiJson', tr('Request JSON mode (only if supported by the model)'))}
    ${check('apiVision', tr('Enable image analysis (vision model required)'))}
    <p class="muted">${tr('API calls may cost money. Retries can make extra calls. Fast uses the summary model; Standard and Deep use the narration model. The connection and key are kept on this computer, never in game saves or exports.')}</p>
    <div class="row"><button class="btn" id="apiSave">${tr('Save connection')}</button><button class="btn ghost" id="apiTest">${tr('Test connection (one API call)')}</button></div>
    <p id="apiStatus" role="status" class="muted"></p>
    <p class="muted">${tr('Session usage: {calls} calls, {input} input tokens, {output} output tokens (when reported)', providerUsage)}</p>
  </div></details>`;
}

// the host's bindSettings (src/js/host.js): runs each time the settings sheet is drawn
export function bindProviderSettings(root) {
  root.querySelector('.ui-lang-field').insertAdjacentHTML('afterend', panelHtml());
  root.querySelector('#updBtn').onclick = openUpdateSheet;
  if (!providerConfig().model) showSetupBanner(); // again in the screen language, which may have just changed
  const q = id => root.querySelector('#api' + id);
  const c = providerConfig();
  for (const [id, key] of Object.entries({ ...TEXT, ...NUMBERS })) q(id).value = c[key] ?? '';
  for (const [id, key] of Object.entries(CHECKS)) q(id).checked = !!c[key];
  const keyHint = () =>
    (q('Key').placeholder = providerHasKey() ? tr('Saved on this computer. Leave blank to keep it.') : '');
  keyHint();
  q('Provider').onchange = () => {
    const p = PROVIDERS.find(p => p.id === q('Provider').value);
    q('Endpoint').value = p.endpoint;
    q('Protocol').value = p.protocol;
    q('Key').value = q('Model').value = q('Summary').value = '';
  };
  const save = async () => {
    const next = {};
    for (const [id, key] of Object.entries(TEXT)) next[key] = q(id).value.trim();
    for (const [id, key] of Object.entries(NUMBERS)) next[key] = Number(q(id).value);
    for (const [id, key] of Object.entries(CHECKS)) next[key] = q(id).checked;
    const counts = Object.values(NUMBERS).every(k => Number.isInteger(next[k]) && next[k] >= 0);
    if (!next.model || !next.endpoint || !counts || !next.maxTokens || !next.promptBytes)
      throw new Error(tr('Enter an endpoint, model and valid limits.'));
    await saveConnection(next, q('Key').value);
    q('Key').value = '';
    keyHint();
    platform.limits = await platform.sample.limits();
    $('#noSample').classList.add('hidden');
    q('Status').textContent = tr('Connection saved.');
  };
  q('Save').onclick = () => save().catch(e => (q('Status').textContent = e.message));
  q('Test').onclick = async () => {
    q('Test').disabled = true;
    try {
      await save();
      q('Status').textContent = tr('Checking...');
      const r = await platform.sample('Reply with the single word ok.', { cache: false });
      q('Status').textContent = tr('Connected: {model}', { model: r.modelTierApplied });
    } catch (e) {
      q('Status').textContent = e.message;
    } finally {
      q('Test').disabled = false;
    }
  };
}

function openUpdateSheet() {
  openSheet(
    `<h3>${tr('Check for updates')}</h3><p>${tr('Standalone version v{version}', { version: esc(APP_VERSION) })}</p><p>${tr('Stop the server, then run git pull, npm ci and npm start. Your saves stay in standalone/data.')}</p><button class="btn" data-close>${tr('Close')}</button>`,
  );
}

export function showSetupBanner() {
  const n = $('#noSample');
  n.innerHTML = `${tr('Choose an AI provider and model in Settings to start playing.')} <button class="btn inline-action" id="configureAI">${tr('Settings')}</button>`;
  n.classList.remove('hidden');
  $('#configureAI').onclick = openSettingsSheet;
}
