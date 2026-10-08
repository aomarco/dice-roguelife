import { PROVIDERS, configureProvider, providerConfig, providerKey, providerUsage } from './providers.js';
import { platform } from './db.js';
import { esc } from './util.js';
import { T } from './i18n.js';
import { redrawNoSample } from './boot.js';

export function providerSettingsHtml() {
  return `<details class="diag-box" open><summary>${T('AI connection')}</summary><div class="diag-body provider-fields">
    <div class="field"><label for="apiProvider">${T('Provider')}</label><select id="apiProvider">${PROVIDERS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="apiEndpoint">${T('API base URL')}</label><input id="apiEndpoint" type="url"></div>
    <div class="field"><label for="apiProtocol">${T('API protocol')}</label><select id="apiProtocol"><option value="compatible">OpenAI-compatible</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option><option value="azure">Azure OpenAI</option><option value="perplexity">Perplexity Sonar</option></select></div>
    <div class="field"><label for="apiKey">${T('API key (optional for local models)')}</label><input id="apiKey" type="password" autocomplete="off"></div>
    <label class="row opt"><input id="apiRemember" type="checkbox">${T('Remember key on this device (stored unencrypted)')}</label>
    <div class="field"><label for="apiModel">${T('Model ID (Azure: deployment name)')}</label><input id="apiModel" autocomplete="off"></div>
    <div class="field"><label for="apiSummary">${T('Summary model ID (optional)')}</label><input id="apiSummary" autocomplete="off"></div>
    <div class="field"><label for="apiVersion">${T('Azure API version')}</label><input id="apiVersion" placeholder="2024-10-21"></div>
    <div class="row"><div class="field grow"><label for="apiMax">${T('Maximum output tokens')}</label><input id="apiMax" type="number" min="64" max="65536"></div><div class="field grow"><label for="apiBudget">${T('Prompt byte limit')}</label><input id="apiBudget" type="number" min="1000" max="2000000"></div></div>
    <div class="field"><label for="apiRetries">${T('Retries for rate limits or server errors')}</label><select id="apiRetries"><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></div>
    <label class="row opt"><input id="apiStream" type="checkbox">${T('Stream replies')}</label>
    <label class="row opt"><input id="apiJson" type="checkbox">${T('Request JSON mode (only if supported by the model)')}</label>
    <label class="row opt"><input id="apiVision" type="checkbox">${T('Enable image analysis (vision model required)')}</label>
    <label class="row opt"><input id="apiPortrait" type="checkbox">${T('AI portrait selection (extra API calls; off by default)')}</label>
    <p class="muted">${T('API calls may cost money. Retries can make extra calls. Fast uses the summary model; Standard and Deep use the narration model. Keys are excluded from game saves and exports.')}</p>
    <div class="row"><button class="btn" id="apiSave">${T('Save connection')}</button><button class="btn ghost" id="apiTest">${T('Test connection (one API call)')}</button></div>
    <p id="apiStatus" role="status" class="muted"></p>
    <p class="muted">${T('Session usage: {calls} calls, {input} input tokens, {output} output tokens (when reported)', { calls: providerUsage.calls, input: providerUsage.input, output: providerUsage.output })}</p>
  </div></details>`;
}
export function bindProviderSettings(root) {
  const q = id => root.querySelector('#api' + id);
  const c = providerConfig();
  for (const [id, key] of [
    ['Provider', 'provider'],
    ['Endpoint', 'endpoint'],
    ['Protocol', 'protocol'],
    ['Model', 'model'],
    ['Summary', 'summaryModel'],
    ['Version', 'apiVersion'],
    ['Max', 'maxTokens'],
    ['Budget', 'promptBytes'],
    ['Retries', 'retries'],
  ])
    q(id).value = c[key] ?? '';
  q('Key').value = providerKey();
  q('Remember').checked = !!localStorage.getItem('dr:provider-key');
  q('Stream').checked = c.stream !== false;
  q('Json').checked = !!c.jsonMode;
  q('Vision').checked = !!c.vision;
  q('Portrait').checked = !!c.portraitAI;
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
    if (
      !Number.isInteger(max) ||
      !Number.isInteger(budget) ||
      !q('Model').value.trim() ||
      !q('Endpoint').value.trim() ||
      max < 64 ||
      max > 65536 ||
      budget < 1000 ||
      budget > 2000000
    )
      throw new Error(T('Enter an endpoint, model and valid limits.'));
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
        portraitAI: q('Portrait').checked,
      },
      q('Key').value,
      q('Remember').checked,
    );
    platform.limits = await platform.sample.limits();
    redrawNoSample();
    q('Status').textContent = T('Connection saved.');
  };
  q('Save').onclick = async () => {
    try {
      await save();
    } catch (e) {
      q('Status').textContent = e.message;
    }
  };
  q('Test').onclick = async () => {
    const b = q('Test');
    b.disabled = true;
    try {
      await save();
      q('Status').textContent = T('Checking...');
      const r = await platform.sample('Reply with the single word ok.', { cache: false });
      q('Status').textContent = T('Connected: {model}', { model: r.modelTierApplied });
    } catch (e) {
      q('Status').textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
}
