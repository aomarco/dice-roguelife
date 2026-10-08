import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build, writePage } from './build.js';
import { apiError, relaySample } from './provider-api.js';

export async function startServer({ port = Number(process.env.PORT) || 3000, fetcher = fetch } = {}) {
  const token = randomBytes(32).toString('hex');
  const { html } = await build();
  writePage(html);
  const page = html.replace('<script>', `<script>window.DR_SERVER_TOKEN=${JSON.stringify(token)};`);
  const server = createServer(async (req, res) => {
    const address = server.address();
    const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    if (!hosts.includes(req.headers.host)) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'GET' && ['/', '/dice-roguelife.html'].includes(req.url)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(page);
      return;
    }
    if (req.method !== 'POST' || req.url !== '/api/sample') {
      res.writeHead(404).end();
      return;
    }
    if (
      req.headers['x-dr-token'] !== token ||
      (req.headers.origin && !hosts.some(h => req.headers.origin === 'http://' + h))
    ) {
      res.writeHead(403).end();
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 175000);
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      let raw = '',
        bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 12000000) throw apiError('prompt_too_large', 'Request too large.');
        raw += chunk;
      }
      const input = JSON.parse(raw);
      const emit = event => {
        if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        res.write(JSON.stringify(event) + '\n');
      };
      await relaySample(input, emit, controller.signal, fetcher);
      res.end();
    } catch (e) {
      // Provider bodies and credentials never enter diagnostics or server logs.
      const failure = {
        code: e.code || (controller.signal.aborted ? 'timeout' : 'provider_error'),
        message: e.code
          ? e.message
          : controller.signal.aborted
            ? 'The provider timed out.'
            : 'Could not reach the provider. Check your connection and endpoint.',
      };
      if (!res.destroyed) {
        if (res.headersSent) res.end(JSON.stringify({ error: failure }) + '\n');
        else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(failure));
        }
      }
    } finally {
      clearTimeout(timer);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  console.log(`Dice Roguelife: http://localhost:${server.address().port}`);
}
