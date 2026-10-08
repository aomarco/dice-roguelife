// The AI connection: provider presets, the player's settings, and the game's 'sample' capability over the relay.
import { N_ } from '../../src/js/i18n.js';
import { tr } from './i18n.js';

// endpoint presets are data; protocol differences live in the relay (../relay.js)
export const PROVIDERS = [
  ['openai', 'OpenAI', 'https://api.openai.com/v1', 'openai'],
  ['anthropic', 'Anthropic', 'https://api.anthropic.com/v1', 'anthropic'],
  ['gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini'],
  ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1'],
  ['groq', 'Groq', 'https://api.groq.com/openai/v1'],
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1'],
  ['mistral', 'Mistral', 'https://api.mistral.ai/v1'],
  ['xai', 'xAI', 'https://api.x.ai/v1'],
  ['together', 'Together', 'https://api.together.ai/v1'],
  ['fireworks', 'Fireworks', 'https://api.fireworks.ai/inference/v1'],
  ['deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai'],
  ['cerebras', 'Cerebras', 'https://api.cerebras.ai/v1'],
  ['perplexity', 'Perplexity Sonar', 'https://api.perplexity.ai', 'perplexity'],
  ['nvidia', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1'],
  ['huggingface', 'Hugging Face', 'https://router.huggingface.co/v1'],
  ['ollama', 'Ollama', 'http://localhost:11434/v1'],
  ['lmstudio', 'LM Studio', 'http://localhost:1234/v1'],
  ['llamacpp', 'llama.cpp', 'http://localhost:8080/v1'],
  ['vllm', 'vLLM', 'http://localhost:8000/v1'],
  ['azure', 'Azure OpenAI', '', 'azure'],
  ['custom', 'Custom', ''],
].map(([id, name, endpoint, protocol = 'compatible']) => ({ id, name, endpoint, protocol }));

const CONFIG_KEY = 'dr:provider';
const KEY_KEY = 'dr:provider-key';
let config = {
  provider: 'openai',
  endpoint: PROVIDERS[0].endpoint,
  protocol: 'openai',
  model: '',
  maxTokens: 4096,
  retries: 0,
  promptBytes: 200000,
  jsonMode: false,
  stream: true,
};
let apiKey = '';
try {
  config = { ...config, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
  apiKey = localStorage.getItem(KEY_KEY) || '';
} catch {
  // storage can be off: the connection then lasts for this visit
}
export const providerConfig = () => ({ ...config });
export const providerKey = () => apiKey;
export const keyRemembered = () => {
  try {
    return !!localStorage.getItem(KEY_KEY);
  } catch {
    return false;
  }
};
export function configureProvider(next, key, remember) {
  config = { ...next };
  apiKey = key.trim();
  replay.clear();
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    if (remember) localStorage.setItem(KEY_KEY, apiKey);
    else localStorage.removeItem(KEY_KEY);
  } catch {
    // storage off: kept for this visit only
  }
}
export const providerUsage = { calls: 0, input: 0, output: 0 };
const replay = new Map(); // finished replies the game may ask for again (its cache option), for up to an hour

// The relay's failure codes, as the game reads them (prompt.js FATAL, turn.js sampleError). Failures that another
// try won't fix become 'sampling_disabled': the game makes no fallback calls and shows the message as is.
const FAILURES = {
  not_configured: ['sampling_disabled', N_('Choose an AI provider and model in Settings to start playing.')],
  no_server: ['sampling_disabled', N_('Start the app with npm start, then reload this page.')],
  invalid_config: ['sampling_disabled', N_('Check the endpoint, model and limits in Settings.')],
  not_granted: ['sampling_disabled', N_('Authentication failed. Check your API key and access to this model.')],
  insufficient_credit: ['sampling_disabled', N_('The API account has insufficient credit or quota.')],
  provider_unavailable: ['sampling_disabled', N_('The provider is temporarily unavailable.')],
  invalid_request: [
    'sampling_disabled',
    N_('The provider rejected this request. Check the endpoint, model, JSON mode and output limit.'),
  ],
  output_limit: ['sampling_disabled', N_('The reply hit the output limit. Increase it in Settings.')],
  timeout: ['sampling_disabled', N_('The provider timed out.')],
  provider_error: ['sampling_disabled', N_('Could not reach the provider. Check your connection and endpoint.')],
  no_vision: ['sampling_disabled', N_('Turn on image analysis and choose a vision model in Settings.')],
  bad_image: ['sampling_disabled', N_('Use a PNG, JPEG, WebP or GIF image smaller than 8 MB.')],
  rate_limited: ['rate_limited', N_('The provider rate limit was reached. Wait before trying again.')],
  prompt_too_large: ['prompt_too_large', N_('The model context limit was exceeded. Reduce recent memory.')],
  refused: ['refused', N_('The provider refused this request.')],
  cancelled: ['cancelled', N_('Cancelled')],
};
function failure(code, fallbackMessage) {
  const [gameCode, text] = FAILURES[code] || ['sampling_disabled', null];
  return Object.assign(new Error(text ? tr(text) : fallbackMessage || tr('Request failed.')), {
    code: gameCode,
    relayCode: code,
  });
}

// the text of a JSON reply, parsed: fences and talk around it are left for the game's own lenient reading
function parseJson(text) {
  const t = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const o = JSON.parse(t);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch {
    // not plain JSON: the game reads e.text more leniently (prompt.js extractJson)
  }
  throw Object.assign(new Error(tr('The reply was not valid JSON.')), { code: 'no_json', text });
}

async function imagePart(blob) {
  if (!config.vision) throw failure('no_vision');
  if (!(blob instanceof Blob) || blob.size > 8000000 || !/^image\/(png|jpeg|webp|gif)$/.test(blob.type))
    throw failure('bad_image');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { type: blob.type, data: btoa(binary) };
}

// one streamed request to the relay, resolving to the text, the model that answered and the token usage
async function relay(body, signal, onText) {
  let response;
  try {
    response = await fetch('/api/sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DR-Token': window.DR_SERVER_TOKEN },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw failure('no_server');
  }
  // a restarted server has a new token: this page must be reloaded
  if (response.status === 403) throw failure('no_server');
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw failure(e.code || 'provider_error', e.message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    text = '',
    result = null;
  const consume = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw failure(event.error.code, event.error.message);
    if (event.text !== undefined) {
      text += event.text;
      if (onText) onText({ text });
    }
    if (event.done) result = { text, modelTierApplied: event.model || body.config.model, usage: event.usage };
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (chunk.done) break;
    }
    consume(buffer);
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!result) throw failure('provider_error');
  return result;
}

export function createApiSample() {
  const sample = async (prompt, opts = {}) => {
    if (!config.model) throw failure('not_configured');
    if (!window.DR_SERVER_TOKEN) throw failure('no_server');
    if (opts.signal && opts.signal.aborted) throw failure('cancelled');
    // Fast uses the summary model when there is one
    const model = opts.modelTier === 'quick' && config.summaryModel ? config.summaryModel : config.model;
    const cacheAllowed = opts.cache && !opts.images;
    const cacheKey = JSON.stringify([config, model, prompt, !!opts.json]);
    const cached = replay.get(cacheKey);
    if (cacheAllowed && !opts.cache.refresh && cached && cached.until > Date.now()) {
      if (opts.onText) opts.onText({ text: cached.result.text });
      return cached.result;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (opts.signal) opts.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 180000);
    try {
      const image = opts.images ? await imagePart(opts.images) : undefined;
      const result = await relay(
        { config: { ...config, model }, apiKey, prompt, image, json: !!opts.json },
        controller.signal,
        opts.onText,
      );
      providerUsage.calls++;
      providerUsage.input += (result.usage && result.usage.input) || 0;
      providerUsage.output += (result.usage && result.usage.output) || 0;
      if (cacheAllowed) {
        for (const [k, v] of replay) if (v.until < Date.now()) replay.delete(k);
        if (replay.size >= 32) replay.delete(replay.keys().next().value);
        replay.set(cacheKey, { result, until: Date.now() + Math.min(opts.cache.gcTime || 3600000, 3600000) });
      }
      return result;
    } catch (e) {
      if (controller.signal.aborted) throw failure(opts.signal && opts.signal.aborted ? 'cancelled' : 'timeout');
      throw e;
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', abort);
    }
  };
  sample.json = async (prompt, opts = {}) => parseJson((await sample(prompt, { ...opts, json: true })).text);
  sample.limits = async () => ({ maxPromptBytes: Number(config.promptBytes) || 200000, images: !!config.vision });
  return sample;
}
