// The standalone app: a server on this computer only (127.0.0.1) that serves the game page, keeps saves and images
// on disk (store.js) and relays narration requests to the chosen AI provider (relay.js). See README.md.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../tools/build.js';
import { apiError, relaySample } from './relay.js';
import { openStore } from './store.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MAX_JSON = 32_000_000; // a save page or an image analysis request
const MAX_ASSET = 25_000_000;

async function readBody(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw apiError('prompt_too_large', 'Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

export async function startServer({
  port = Number(process.env.PORT) || 3000,
  dataDir = process.env.DR_DATA || join(HERE, 'data'),
  fetcher = fetch,
} = {}) {
  const token = randomBytes(32).toString('hex');
  const store = openStore(dataDir);
  const { html } = await build(undefined, {
    entry: join(HERE, 'client', 'main.js'),
    css: readFileSync(join(HERE, 'client', 'standalone.css'), 'utf8'),
  });
  const page = html.replace('<script>', `<script>window.DR_SERVER_TOKEN=${JSON.stringify(token)};`);
  const cookie = `dr_token=${token}; Path=/; HttpOnly; SameSite=Strict`;

  const server = createServer(async (req, res) => {
    const address = server.address();
    const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    if (!hosts.includes(req.headers.host)) return res.writeHead(403).end();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://' + req.headers.host);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dice-roguelife.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookie });
      return res.end(page);
    }
    // pictures load through <img>, which can't send a header: the page's cookie admits them
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      if (!String(req.headers.cookie || '').includes(`dr_token=${token}`)) return res.writeHead(403).end();
      const asset = store.assets.get(url.pathname.slice('/assets/'.length));
      if (!asset) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': asset.type });
      return res.end(asset.bytes);
    }
    if (
      req.method !== 'POST' ||
      req.headers['x-dr-token'] !== token ||
      (req.headers.origin && !hosts.some(h => req.headers.origin === 'http://' + h))
    )
      return res.writeHead(url.pathname.startsWith('/api/') ? 403 : 404).end();

    try {
      if (url.pathname === '/api/db') return sendJson(res, 200, store.docOp(JSON.parse(await readBody(req, MAX_JSON))));
      if (url.pathname === '/api/assets/upload') {
        const type = String(req.headers['content-type'] || '');
        if (!/^image\/[\w.+-]+$/.test(type)) throw apiError('invalid_request', 'Only images can be uploaded.');
        return sendJson(res, 200, { id: store.assets.add(await readBody(req, MAX_ASSET), type) });
      }
      if (url.pathname === '/api/assets/list') {
        const disk = statfsSync(dataDir);
        return sendJson(res, 200, { files: store.assets.list(), free: disk.bavail * disk.bsize });
      }
      if (url.pathname === '/api/assets/delete') {
        store.assets.delete(JSON.parse(await readBody(req, 1000)).id);
        return sendJson(res, 200, {});
      }
      if (url.pathname === '/api/sample') return await relay(req, res, fetcher);
      return res.writeHead(404).end();
    } catch (e) {
      if (!e.code) console.error(e);
      if (!res.headersSent)
        sendJson(res, 400, { code: e.code || 'storage_error', message: e.code ? e.message : 'Request failed.' });
      else res.end();
    }
  });
  server.on('close', () => store.close());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function relay(req, res, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 175000);
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const input = JSON.parse(await readBody(req, MAX_JSON));
    const emit = event => {
      if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
      res.write(JSON.stringify(event) + '\n');
    };
    await relaySample(input, emit, controller.signal, fetcher);
    res.end();
  } catch (e) {
    // provider bodies and keys never reach logs or the page
    const failure = {
      code: e.code || (controller.signal.aborted ? 'timeout' : 'provider_error'),
      message: e.code
        ? e.message
        : controller.signal.aborted
          ? 'The provider timed out.'
          : 'Could not reach the provider. Check your connection and endpoint.',
    };
    if (res.destroyed) return;
    if (res.headersSent) res.end(JSON.stringify({ error: failure }) + '\n');
    else sendJson(res, 400, failure);
  } finally {
    clearTimeout(timer);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  console.log(`Dice Roguelife (standalone): http://localhost:${server.address().port}`);
}
