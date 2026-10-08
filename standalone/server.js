// The standalone app: a server on this computer only (127.0.0.1) that serves the game page, keeps saves, images and
// the AI connection on disk (store.js) and relays narration requests to the chosen provider (relay.js). See README.md.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream, readFileSync, statfsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../tools/build.js';
import { apiError, relaySample } from './relay.js';
import { openStore, readJsonFile, writeAtomic } from './store.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CONFIG = join(HERE, 'config.json');
const MAX_JSON = 32_000_000; // a save page or an image analysis request
const MAX_ASSET = 25_000_000;
const IDLE = 300_000; // a provider silent this long is given up on (a slow local model still streams)
const HOST_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i;

// standalone/config.json, written by hand or from ⚙ Settings → Server settings; every field is optional
export function checkConfig(c) {
  const ok =
    c &&
    typeof c === 'object' &&
    (c.port === undefined || (Number.isInteger(c.port) && c.port >= 1 && c.port <= 65535)) &&
    (c.dataDir === undefined || (typeof c.dataDir === 'string' && c.dataDir.trim() !== '')) &&
    (c.hosts === undefined ||
      (Array.isArray(c.hosts) && c.hosts.length <= 10 && c.hosts.every(h => HOST_NAME.test(h))));
  if (!ok) throw apiError('bad_settings', 'config.json: port is 1 to 65535, dataDir a folder, hosts a list of names.');
  if (c.hosts) c.hosts = c.hosts.map(h => h.toLowerCase()); // browsers send host names in lower case
  return c;
}
// a profile by name, never something every object has (a profile named "constructor" or "toString")
const profileOf = (c, name) => (Object.hasOwn(c.profiles, name) ? c.profiles[name] : undefined);

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
// what the page may see of the AI connection profiles: everything but the keys
const profilesView = c => ({
  active: c.active,
  profiles: Object.entries(c.profiles).map(([name, p]) => ({ name, config: p.config, hasKey: !!p.apiKey })),
});

// Options (port, dataDir, hosts) default to config.json; tests also pass configFile and fetcher.
export async function startServer({ configFile = CONFIG, fetcher = fetch, ...options } = {}) {
  const config = { ...checkConfig(readJsonFile(configFile, {})), ...options };
  const dataDir = resolve(HERE, config.dataDir || 'data');
  let names = config.hosts || []; // other names this server answers to, through a proxy here (e.g. `tailscale serve`)
  const token = randomBytes(32).toString('hex');
  const store = openStore(dataDir);
  const { html } = await build(undefined, {
    entry: join(HERE, 'client', 'main.js'),
    css: readFileSync(join(HERE, 'client', 'standalone.css'), 'utf8'),
  });
  const page = html.replace('<script>', `<script>window.DR_SERVER_TOKEN=${JSON.stringify(token)};`);
  const port = () => server.address().port;
  // this computer's own names, with the port, and without it on 80 (browsers leave a default port out)
  const local = () => ['127.0.0.1', 'localhost'].flatMap(h => (port() === 80 ? [h, `${h}:80`] : [`${h}:${port()}`]));
  const cookieName = () => `dr_token_${port()}`; // cookies aren't kept apart by port
  // reads the profiles, lets edit change them, saves them and returns what the page may see
  const editConnection = edit => {
    const c = store.connection.get();
    edit(c);
    store.connection.set(c);
    return profilesView(c);
  };

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
    // AI connection profiles: the page sees each one without its key, and picks the one that narrates
    '/api/connection/get': async () => profilesView(store.connection.get()),
    '/api/connection/use': async req => {
      const { name } = await readJson(req, 1000);
      return editConnection(c => {
        if (!profileOf(c, name)) throw apiError('no_profile', 'No such profile.');
        c.active = name;
      });
    },
    '/api/connection/delete': async req => {
      const { name } = await readJson(req, 1000);
      return editConnection(c => {
        delete c.profiles[name];
        if (c.active === name) c.active = Object.keys(c.profiles)[0] || '';
      });
    },
    // Saves a profile (previous: the one it was, for a rename; none for a new one) and makes it the one in use.
    // A blank key keeps the profile's own, unless the endpoint changed.
    '/api/connection/set': async req => {
      const { name: raw, previous, config, apiKey } = await readJson(req, 100_000);
      const name = String(raw || '').trim();
      if (!name || name.length > 40 || name === '__proto__') throw apiError('bad_name', 'Profile name.');
      return editConnection(c => {
        if (name !== previous && profileOf(c, name)) throw apiError('name_taken', 'That profile name is taken.');
        const old = profileOf(c, previous) || { config: {}, apiKey: '' };
        const key = apiKey ? String(apiKey).trim() : config.endpoint === old.config.endpoint ? old.apiKey : '';
        if (previous && previous !== name) delete c.profiles[previous];
        c.profiles[name] = { config, apiKey: key };
        c.active = name;
      });
    },
    // ⚙ Settings → Server settings: what config.json says, and what this run uses (port and folder change at the next
    // start, names at once)
    '/api/server/get': async () => {
      const saved = readJsonFile(configFile, {});
      return {
        port: saved.port ?? 3000,
        dataDir: saved.dataDir || 'data',
        hosts: saved.hosts || [],
        running: { port: port(), dataPath: dataDir },
      };
    },
    '/api/server/set': async req => {
      const next = checkConfig(await readJson(req, 10_000));
      writeAtomic(configFile, JSON.stringify({ ...readJsonFile(configFile, {}), ...next }, null, 2) + '\n');
      names = next.hosts || [];
      return { restart: (next.port ?? 3000) !== port() || resolve(HERE, next.dataDir || 'data') !== dataDir };
    },
  };

  async function handle(req, res) {
    const host = String(req.headers.host || '').toLowerCase();
    if (!local().includes(host) && !names.includes(host)) return res.writeHead(403).end();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict`,
      });
      return res.end(page);
    }
    // Pictures load through <img>, which can't send a header: the page's cookie admits them. An id is never reused,
    // so the browser may keep each one, and the sandbox keeps an uploaded SVG or page from running as this site.
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      if (!String(req.headers.cookie || '').includes(`${cookieName()}=${token}`)) return res.writeHead(403).end();
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
    const origin = req.headers.origin;
    const fromHere = local().some(h => origin === 'http://' + h) || names.some(n => origin === 'https://' + n);
    if (req.headers['x-dr-token'] !== token || (origin && !fromHere)) return res.writeHead(403).end();
    res.setHeader('Cache-Control', 'no-store');
    if (route === 'sample') return relay(req, res, store, fetcher);
    try {
      sendJson(res, 200, await route(req));
    } catch (e) {
      // only a code goes back; the page words it (client/net.js)
      if (!e.code) console.error(e);
      sendJson(res, 400, { code: e.code || 'storage_error' });
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
    server.listen(config.port ?? 3000, '127.0.0.1', resolve);
  });
  return server;
}

// one narration request: the page sends the prompt and its profile, the server adds that profile's settings and key
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
    const { prompt, image, json, quick, profile } = await readJson(req, MAX_JSON, 'prompt_too_large');
    const c = store.connection.get();
    const chosen = profileOf(c, profile || c.active);
    if (!chosen) throw apiError(profile ? 'no_profile' : 'not_configured', 'No such profile.');
    const { config, apiKey } = chosen;
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
  const server = await startServer();
  console.log(`Dice Roguelife (standalone): http://localhost:${server.address().port}`);
}
