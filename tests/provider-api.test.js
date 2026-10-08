import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { providerRequest, normalizeEvent, readSSE, relaySample, httpError } from '../tools/provider-api.js';
import { startServer } from '../tools/server.js';

const input = (protocol = 'compatible', extra = {}) => ({
  config: { protocol, endpoint: 'https://example.com/v1', model: 'test-model', maxTokens: 512, ...extra },
  apiKey: 'secret-test-key',
  prompt: 'Return JSON',
  json: true,
});
test('dedicated protocols, authentication, JSON opt-in and Azure deployment URLs', () => {
  const openai = providerRequest(input('openai'));
  assert.equal(openai.body.max_completion_tokens, 512);
  assert.equal(openai.headers.Authorization, 'Bearer secret-test-key');
  assert.equal(openai.body.response_format, undefined);
  assert.deepEqual(providerRequest(input('compatible', { jsonMode: true })).body.response_format, {
    type: 'json_object',
  });
  const anthropic = providerRequest(input('anthropic'));
  assert.equal(anthropic.headers['x-api-key'], 'secret-test-key');
  assert.equal(anthropic.body.max_tokens, 512);
  const gemini = providerRequest(input('gemini', { jsonMode: true }));
  assert.equal(gemini.headers['x-goog-api-key'], 'secret-test-key');
  assert.equal(gemini.body.generationConfig.responseMimeType, 'application/json');
  assert.match(gemini.url, /:streamGenerateContent\?alt=sse$/);
  assert.match(
    providerRequest(input('azure', { model: 'deployment name' })).url,
    /deployments\/deployment%20name\/chat\/completions\?api-version=/,
  );
});
test('local keyless models, rejected insecure URLs and prompt limits', () => {
  const local = input('compatible', { endpoint: 'http://localhost:11434/v1' });
  local.apiKey = '';
  assert.equal(providerRequest(local).headers.Authorization, undefined);
  for (const endpoint of [
    'http://example.com/v1',
    'https://user:pass@example.com/v1',
    'https://example.com/v1?key=secret',
  ])
    assert.throws(() => providerRequest(input('compatible', { endpoint })), { code: 'invalid_config' });
  assert.throws(() => providerRequest(input('compatible', { promptBytes: 2 })), { code: 'prompt_too_large' });
});
test('vision attachments use each native format and require opt-in', () => {
  const image = { type: 'image/png', data: 'YQ==' };
  assert.throws(() => providerRequest({ ...input(), image }), { code: 'invalid_config' });
  const compatible = providerRequest({ ...input('compatible', { vision: true }), image });
  assert.equal(compatible.body.messages[0].content[1].image_url.url, 'data:image/png;base64,YQ==');
  const anthropic = providerRequest({ ...input('anthropic', { vision: true }), image });
  assert.equal(anthropic.body.messages[0].content[0].source.data, 'YQ==');
  const gemini = providerRequest({ ...input('gemini', { vision: true }), image });
  assert.equal(gemini.body.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.match(providerRequest(input('perplexity')).url, /\/v1\/sonar$/);
});
test('fragmented SSE decodes Unicode, CRLF and final events', async () => {
  const bytes = new TextEncoder().encode('data: {"text":"안녕"}\r\n\r\ndata: {"last":true}\n\ndata: [DONE]\n\n');
  const stream = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(Uint8Array.of(b));
      c.close();
    },
  });
  const values = [];
  await readSSE(stream, v => values.push(v));
  assert.deepEqual(values, [{ text: '안녕' }, { last: true }]);
});
test('normalization excludes reasoning and detects refusals and truncation', () => {
  assert.equal(
    normalizeEvent('gemini', {
      candidates: [{ content: { parts: [{ text: 'private', thought: true }, { text: 'story' }] } }],
    }).text,
    'story',
  );
  assert.equal(normalizeEvent('anthropic', { delta: { text: 'story' } }).text, 'story');
  assert.equal(normalizeEvent('compatible', { choices: [{ delta: { refusal: 'no' } }] }).refused, true);
  assert.equal(normalizeEvent('compatible', { choices: [{ finish_reason: 'length' }] }).truncated, true);
});
test('relay streams text and usage, handles non-streaming servers, and bounds retries', async () => {
  const emitted = [];
  await relaySample(
    input(),
    e => emitted.push(e),
    new AbortController().signal,
    async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  );
  assert.equal(emitted[0].text, 'hello');
  assert.deepEqual(emitted[1].usage, { input: 10, output: 2 });
  const normal = [];
  await relaySample(
    input(),
    e => normal.push(e),
    new AbortController().signal,
    async () => Response.json({ choices: [{ message: { content: 'normal' }, finish_reason: 'stop' }] }),
  );
  assert.equal(normal[0].text, 'normal');
  let calls = 0;
  await assert.rejects(
    relaySample(
      input(),
      () => {},
      new AbortController().signal,
      async () => {
        calls++;
        return new Response('no', { status: 429 });
      },
    ),
    { code: 'rate_limited' },
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    relaySample(
      input('compatible', { retries: 1 }),
      () => {},
      new AbortController().signal,
      async () => {
        calls++;
        return new Response('no', { status: 503 });
      },
    ),
    { code: 'provider_unavailable' },
  );
  assert.equal(calls, 2);
});
test('incomplete streams and output limits do not commit successful replies', async () => {
  for (const finish of ['', ',"finish_reason":"length"']) {
    const events = [];
    await assert.rejects(
      relaySample(
        input(),
        e => events.push(e),
        new AbortController().signal,
        async () =>
          new Response(`data: {"choices":[{"delta":{"content":"partial"}${finish}}]}\n\n`, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    );
    assert.equal(
      events.some(e => e.done),
      false,
    );
  }
  assert.equal(httpError(429, 'insufficient_quota').code, 'insufficient_credit');
});
test('cancellation reaches upstream fetch', async () => {
  const c = new AbortController();
  const promise = relaySample(
    input(),
    () => {},
    c.signal,
    async (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }),
      ),
  );
  c.abort();
  await assert.rejects(promise, { name: 'AbortError' });
});
test('local relay rejects missing token, foreign origins and rebinding hosts', async () => {
  const server = await startServer({ port: 0 });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url + '/api/sample', { method: 'POST', body: '{}' })).status, 403);
    const page = await (await fetch(url)).text();
    const token = /window.DR_SERVER_TOKEN="([a-f0-9]+)"/.exec(page)[1];
    assert.equal(
      (
        await fetch(url + '/api/sample', {
          method: 'POST',
          headers: { 'X-DR-Token': token, Origin: 'https://attacker.example' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      await new Promise((resolve, reject) => {
        const req = httpRequest(url, { headers: { Host: 'attacker.example' } }, res => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
      }),
      403,
    );
    assert.equal(
      (await fetch(url + '/api/sample', { method: 'POST', headers: { 'X-DR-Token': token }, body: '{}' })).status,
      400,
    );
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
