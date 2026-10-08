// Endpoint presets are data; protocol differences belong to the relay adapters.
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
  /* Storage can be disabled; session configuration still works. */
}
export const providerConfig = () => ({ ...config });
export const providerKey = () => apiKey;
export function configureProvider(next, key, remember) {
  config = { ...next };
  apiKey = key.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (remember) localStorage.setItem(KEY_KEY, apiKey);
  else localStorage.removeItem(KEY_KEY);
  replay.clear();
}
export const providerUsage = { calls: 0, input: 0, output: 0 };
const replay = new Map();
function error(code, message, text) {
  return Object.assign(new Error(message), { code, text });
}
export function parseReply(text) {
  const raw = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const starts = [...raw.matchAll(/[\[{]/g)].map(m => m.index);
  for (const start of starts) {
    const stack = [];
    let quoted = false,
      escaped = false;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') {
        if (stack.pop() !== (c === '}' ? '{' : '[')) break;
        if (!stack.length) {
          try {
            const value = JSON.parse(raw.slice(start, i + 1));
            if (value && typeof value === 'object') return value;
          } catch {
            /* Try another complete object, never manufacture truncated state. */
          }
          break;
        }
      }
    }
  }
  throw error('no_json', 'The model did not return a complete JSON object.', text);
}

export function validNarration(reply) {
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const optional = (v, check) => v == null || check(v);
  const safe = (v, depth = 0) => {
    if (depth > 40 || (typeof v === 'number' && !Number.isFinite(v))) return false;
    if (v && typeof v === 'object')
      return Object.entries(v).every(
        ([k, x]) => !['__proto__', 'prototype', 'constructor'].includes(k) && safe(x, depth + 1),
      );
    return true;
  };
  if (!object(reply) || !safe(reply)) return false;
  for (const k of ['narration', 'admin', 'scene', 'speaker', 'emotion'])
    if (!optional(reply[k], v => typeof v === 'string')) return false;
  for (const k of ['stat_changes', 'memory', 'clock', 'murim', 'energy', 'ledger', 'widget', 'check'])
    if (!optional(reply[k], object)) return false;
  for (const k of ['choices', 'system', 'equip', 'unequip', 'remove_skills', 'speaker_look'])
    if (!optional(reply[k], v => Array.isArray(v) && v.every(x => typeof x === 'string'))) return false;
  for (const k of ['items', 'also_present', 'add_skills', 'evolve_skills'])
    if (!optional(reply[k], v => Array.isArray(v) && v.every(object))) return false;
  if (
    reply.stat_changes &&
    !Object.values(reply.stat_changes).every(
      v => (typeof v === 'number' || typeof v === 'string') && Number.isFinite(Number(v)),
    )
  )
    return false;
  for (const k of ['lore', 'relations', 'quests'])
    if (!optional(reply.memory?.[k], v => Array.isArray(v) && v.every(object))) return false;
  return true;
}

export function createApiSample() {
  const sample = async (prompt, opts = {}) => {
    if (!config.model) throw error('not_granted', 'Choose a provider and model in Settings.');
    if (!window.DR_SERVER_TOKEN) throw error('not_granted', 'Start the local app with npm start.');
    const model = opts.modelTier === 'quick' && config.summaryModel ? config.summaryModel : config.model;
    const cacheAllowed = opts.cache && !opts.images;
    const cacheKey = JSON.stringify([config, model, prompt]);
    const cached = replay.get(cacheKey);
    if (opts.signal?.aborted) throw error('cancelled', 'Cancelled');
    if (cacheAllowed && !opts.cache.refresh && cached && cached.until > Date.now()) {
      opts.onText?.({ text: cached.result.text });
      return cached.result;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    opts.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 180000);
    let text = '',
      result;
    try {
      let image;
      if (opts.images) {
        if (!config.vision)
          throw error('invalid_config', 'Enable image analysis and select a vision model in Settings.');
        if (
          !(opts.images instanceof Blob) ||
          opts.images.size > 8000000 ||
          !/^image\/(png|jpeg|webp|gif)$/.test(opts.images.type)
        )
          throw error('invalid_config', 'Use a PNG, JPEG, WebP or GIF image smaller than 8 MB.');
        const bytes = new Uint8Array(await opts.images.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        image = { type: opts.images.type, data: btoa(binary) };
      }
      const response = await fetch('/api/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DR-Token': window.DR_SERVER_TOKEN },
        body: JSON.stringify({ config: { ...config, model }, apiKey, prompt, image, json: !!opts.json }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const e = await response.json();
        throw error(e.code || 'provider_error', e.message || 'Request failed');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const consume = line => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.error) throw error(event.error.code, event.error.message);
        if (event.text !== undefined) {
          text += event.text;
          opts.onText?.({ text });
        }
        if (event.done) result = { text, modelTierApplied: event.model || model, usage: event.usage };
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
      if (!result) throw error('provider_error', 'The connection ended before the reply completed.');
      providerUsage.calls++;
      providerUsage.input += result.usage?.input || 0;
      providerUsage.output += result.usage?.output || 0;
      if (opts.json) parseReply(result.text);
      if (cacheAllowed) {
        for (const [k, v] of replay) if (v.until < Date.now()) replay.delete(k);
        if (replay.size >= 32) replay.delete(replay.keys().next().value);
        replay.set(cacheKey, { result, until: Date.now() + Math.min(opts.cache.gcTime || 3600000, 3600000) });
      }
      return result;
    } catch (e) {
      if (controller.signal.aborted)
        throw error(
          opts.signal?.aborted ? 'cancelled' : 'timeout',
          opts.signal?.aborted ? 'Cancelled' : 'The provider timed out.',
        );
      throw e;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', abort);
    }
  };
  sample.json = async (prompt, opts = {}) => parseReply((await sample(prompt, { ...opts, json: true })).text);
  sample.limits = async () => ({ maxPromptBytes: Number(config.promptBytes) || 200000, images: !!config.vision });
  return sample;
}
