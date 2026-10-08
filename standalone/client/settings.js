// The AI connection controls in ⚙ Settings, the standalone update steps, and the "choose a model" banner.
import { platform } from '../../src/js/db.js';
import { APP_VERSION } from '../../src/js/app.js';
import { openSheet } from '../../src/js/sheet.js';
import { openSettingsSheet } from '../../src/js/settings-sheet.js';
import { $, esc } from '../../src/js/util.js';
import { tr } from './i18n.js';
import {
  PROVIDERS,
  configureProvider,
  keyRemembered,
  providerConfig,
  providerKey,
  providerUsage,
} from './providers.js';

const PROTOCOLS = [
  ['compatible', 'OpenAI-compatible'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['gemini', 'Gemini'],
  ['azure', 'Azure OpenAI'],
  ['perplexity', 'Perplexity Sonar'],
];

function panelHtml() {
  const opts = list => list.map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join('');
  const check = (id, label) => `<label class="row opt"><input id="${id}" type="checkbox">${label}</label>`;
  const field = (id, label, attrs = '') =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" ${attrs}></div>`;
  return `<details class="diag-box" open><summary>${tr('AI connection')}</summary><div class="diag-body provider-fields">
    <div class="field"><label for="apiProvider">${tr('Provider')}</label><select id="apiProvider">${opts(PROVIDERS.map(p => [p.id, p.name]))}</select></div>
    ${field('apiEndpoint', tr('API base URL'), 'type="url"')}
    <div class="field"><label for="apiProtocol">${tr('API protocol')}</label><select id="apiProtocol">${opts(PROTOCOLS)}</select></div>
    ${field('apiKey', tr('API key (optional for local models)'), 'type="password" autocomplete="off"')}
    ${check('apiRemember', tr('Remember key on this device (stored unencrypted)'))}
    ${field('apiModel', tr('Model ID (Azure: deployment name)'), 'autocomplete="off"')}
    ${field('apiSummary', tr('Summary model ID (optional)'), 'autocomplete="off"')}
    ${field('apiVersion', tr('Azure API version'), 'placeholder="2024-10-21"')}
    <div class="row"><div class="field grow"><label for="apiMax">${tr('Maximum output tokens')}</label><input id="apiMax" type="number" min="64" max="65536"></div><div class="field grow"><label for="apiBudget">${tr('Prompt byte limit')}</label><input id="apiBudget" type="number" min="1000" max="2000000"></div></div>
    <div class="field"><label for="apiRetries">${tr('Retries for rate limits or server errors')}</label><select id="apiRetries">${opts(['0', '1', '2'].map(n => [n, n]))}</select></div>
    ${check('apiStream', tr('Stream replies'))}
    ${check('apiJson', tr('Request JSON mode (only if supported by the model)'))}
    ${check('apiVision', tr('Enable image analysis (vision model required)'))}
    <p class="muted">${tr('API calls may cost money. Retries can make extra calls. Fast uses the summary model; Standard and Deep use the narration model. Keys are excluded from game saves and exports.')}</p>
    <div class="row"><button class="btn" id="apiSave">${tr('Save connection')}</button><button class="btn ghost" id="apiTest">${tr('Test connection (one API call)')}</button></div>
    <p id="apiStatus" role="status" class="muted"></p>
    <p class="muted">${tr('Session usage: {calls} calls, {input} input tokens, {output} output tokens (when reported)', providerUsage)}</p>
  </div></details>`;
}

const FIELDS = [
  ['Provider', 'provider'],
  ['Endpoint', 'endpoint'],
  ['Protocol', 'protocol'],
  ['Model', 'model'],
  ['Summary', 'summaryModel'],
  ['Version', 'apiVersion'],
  ['Max', 'maxTokens'],
  ['Budget', 'promptBytes'],
  ['Retries', 'retries'],
];

// the host's bindSettings (src/js/host.js): runs each time the settings sheet is drawn
export function bindProviderSettings(root) {
  root.querySelector('.ui-lang-field').insertAdjacentHTML('afterend', panelHtml());
  root.querySelector('#updBtn').onclick = openUpdateSheet;
  const q = id => root.querySelector('#api' + id);
  const c = providerConfig();
  for (const [id, key] of FIELDS) q(id).value = c[key] ?? '';
  q('Key').value = providerKey();
  q('Remember').checked = keyRemembered();
  q('Stream').checked = c.stream !== false;
  q('Json').checked = !!c.jsonMode;
  q('Vision').checked = !!c.vision;
  q('Provider').onchange = () => {
    const p = PROVIDERS.find(p => p.id === q('Provider').value);
    q('Endpoint').value = p.endpoint;
    q('Protocol').value = p.protocol;
    q('Key').value = '';
    q('Remember').checked = false;
    q('Model').value = '';
    q('Summary').value = '';
  };
  const save = async () => {
    const max = Number(q('Max').value),
      budget = Number(q('Budget').value);
    const bad = !Number.isInteger(max) || max < 64 || max > 65536 || !Number.isInteger(budget) || budget < 1000;
    if (bad || budget > 2000000 || !q('Model').value.trim() || !q('Endpoint').value.trim())
      throw new Error(tr('Enter an endpoint, model and valid limits.'));
    configureProvider(
      {
        provider: q('Provider').value,
        endpoint: q('Endpoint').value.trim(),
        protocol: q('Protocol').value,
        model: q('Model').value.trim(),
        summaryModel: q('Summary').value.trim(),
        apiVersion: q('Version').value.trim(),
        maxTokens: max,
        promptBytes: budget,
        retries: Number(q('Retries').value),
        stream: q('Stream').checked,
        jsonMode: q('Json').checked,
        vision: q('Vision').checked,
      },
      q('Key').value,
      q('Remember').checked,
    );
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
