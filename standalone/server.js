// The standalone app: a server on this computer only (127.0.0.1) that serves the game page, keeps saves, images and
// the AI connection on disk (store.js) and relays narration requests to the chosen provider (relay.js). See README.md.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statfsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../tools/build.js';
import { apiError, relaySample } from './relay.js';
import { openStore } from './store.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MAX_JSON = 32_000_000; // a save page or an image analysis request
const MAX_ASSET = 25_000_000;
const IDLE = 300_000; // a provider silent this long is given up on (a slow local model still streams)

// standalone/config.json, all optional: port, dataDir (relative to standalone/) and hosts (see README.md)
export function loadConfig(file = join(HERE, 'config.json')) {
  const c = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const out = {};
  if (c.port) out.port = c.port;
  if (c.dataDir) out.dataDir = resolve(HERE, c.dataDir);
  if (c.hosts) out.extraHosts = c.hosts;
  return out;
}

async function readBody(req, max, code = 'too_large') {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw apiError(code, 'Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const readJson = async (req, max = MAX_JSON, code) => JSON.parse(await readBody(req, max, code));
const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};

// extraHosts: names other devices reach this server by through a proxy on this computer (e.g. `tailscale serve`)
export async function startServer({
  port = 3000,
  dataDir = join(HERE, 'data'),
  extraHosts = [],
  fetcher = fetch,
} = {}) {
  const token = randomBytes(32).toString('hex');
  const store = openStore(dataDir);
  const { html } = await build(undefined, {
    entry: join(HERE, 'client', 'main.js'),
    css: readFileSync(join(HERE, 'client', 'standalone.css'), 'utf8'),
  });
  const page = html.replace('<script>', `<script>window.DR_SERVER_TOKEN=${JSON.stringify(token)};`);
  let hosts, origins, cookieName; // set once listening, when the port is known

  const routes = {
    '/api/db': async req => store.docOp(await readJson(req)),
    // pictures, and the image list the game keeps for copies (images-view.js saveManifest)
    '/api/assets/upload': async req => {
      const type = String(req.headers['content-type'] || '');
      if (!/^(image\/[\w.+-]+|application\/json)$/.test(type)) throw apiError('invalid_request', 'Not a stored type.');
      return { id: store.assets.add(await readBody(req, MAX_ASSET), type) };
    },
    '/api/assets/list': async () => {
      const disk = statfsSync(dataDir);
      return { files: store.assets.list(), free: disk.bavail * disk.bsize };
    },
    '/api/assets/delete': async req => {
      store.assets.delete((await readJson(req, 1000)).id);
      return {};
    },
    // the page sees the connection without its key; a new endpoint without a new key drops the old one
    '/api/connection/get': async () => {
      const { config, apiKey } = store.connection.get();
      return { config, hasKey: !!apiKey };
    },
    '/api/connection/set': async req => {
      const next = await readJson(req, 100_000);
      const old = store.connection.get();
      const apiKey = next.apiKey
        ? String(next.apiKey).trim()
        : next.config.endpoint === old.config.endpoint
          ? old.apiKey
          : '';
      store.connection.set({ config: next.config, apiKey });
      return { hasKey: !!apiKey };
    },
  };

  async function handle(req, res) {
    if (!hosts.includes(req.headers.host)) return res.writeHead(403).end();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`,
      });
      return res.end(page);
    }
    // Pictures load through <img>, which can't send a header: the page's cookie admits them. An id is never reused,
    // so the browser may keep each one, and the sandbox keeps an uploaded SVG or page from running as this site.
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      if (!String(req.headers.cookie || '').includes(`${cookieName}=${token}`)) return res.writeHead(403).end();
      const asset = store.assets.get(url.pathname.slice('/assets/'.length));
      if (!asset) return res.writeHead(404).end();
      res.writeHead(200, {
        'Content-Type': asset.type,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      return pipeline(createReadStream(asset.file), res);
    }
    const route = req.method === 'POST' && (url.pathname === '/api/sample' ? 'sample' : routes[url.pathname]);
    if (!route) return res.writeHead(404).end();
    if (req.headers['x-dr-token'] !== token || (req.headers.origin && !origins.includes(req.headers.origin)))
      return res.writeHead(403).end();
    res.setHeader('Cache-Control', 'no-store');
    if (route === 'sample') return relay(req, res, store, fetcher);
    try {
      sendJson(res, 200, await route(req));
    } catch (e) {
      if (!e.code) console.error(e);
      sendJson(res, 400, { code: e.code || 'storage_error', message: e.code ? e.message : 'Request failed.' });
    }
  }
  const server = createServer((req, res) =>
    handle(req, res).catch(e => {
      console.error(e);
      if (!res.headersSent) res.writeHead(400);
      res.end();
    }),
  );
  server.on('close', () => store.close());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  port = server.address().port;
  hosts = [`127.0.0.1:${port}`, `localhost:${port}`, ...extraHosts];
  origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...extraHosts.map(h => 'https://' + h)];
  cookieName = `dr_token_${port}`; // cookies aren't kept apart by port
  return server;
}

// one narration request: the page sends the prompt, the server adds the stored connection and key
async function relay(req, res, store, fetcher) {
  const controller = new AbortController();
  let timer;
  const idle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), IDLE);
  };
  idle();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const { prompt, image, json, quick } = await readJson(req, MAX_JSON, 'prompt_too_large');
    const { config, apiKey } = store.connection.get();
    if (!config.model) throw apiError('not_configured', 'No model chosen.');
    const model = quick && config.summaryModel ? config.summaryModel : config.model;
    const emit = event => {
      idle();
      if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
      res.write(JSON.stringify(event) + '\n');
    };
    await relaySample({ config: { ...config, model }, apiKey, prompt, image, json }, emit, controller.signal, fetcher);
    res.end();
  } catch (e) {
    // only a code goes back: provider bodies and keys never reach logs or the page
    const code = controller.signal.aborted ? 'timeout' : typeof e.code === 'string' ? e.code : 'provider_error';
    if (res.destroyed) return;
    if (res.headersSent) res.end(JSON.stringify({ error: { code } }) + '\n');
    else sendJson(res, 400, { code });
  } finally {
    clearTimeout(timer);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer(loadConfig());
  console.log(`Dice Roguelife (standalone): http://localhost:${server.address().port}`);
}
