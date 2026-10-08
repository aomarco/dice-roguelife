import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect } from 'node:net';
import { basename, join } from 'node:path';
import { loadConfig } from '../server.js';
import { openStore } from '../store.js';
import { openServer, tempDir } from './support.js';

function withStore(run) {
  const dir = tempDir();
  const store = openStore(dir);
  try {
    return run(store, dir);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('documents: get, set, delete, add, as memDB does', () =>
  withStore(({ docOp }) => {
    const path = 'data/users/local/settings';
    assert.deepEqual(docOp({ op: 'get', path }), { exists: false, data: undefined });
    docOp({ op: 'set', path, data: { a: 1, b: { c: 2 } } });
    assert.deepEqual(docOp({ op: 'get', path }).data, { a: 1, b: { c: 2 } });
    const { id } = docOp({ op: 'add', path: 'hall', data: { score: 5 } });
    assert.equal(docOp({ op: 'get', path: 'hall/' + id }).data.score, 5);
    docOp({ op: 'delete', path: 'hall/' + id });
    assert.equal(docOp({ op: 'get', path: 'hall/' + id }).exists, false);
    assert.throws(() => docOp({ op: 'get', path: 'hall' }), { code: 'invalid_path' });
    assert.throws(() => docOp({ op: 'query', path: 'hall/x' }), { code: 'invalid_path' });
    assert.throws(() => docOp({ op: 'set', path: 'a/../b/c', data: {} }), { code: 'invalid_path' });
  }));

test('queries: direct children only, where, orderBy and limit', () =>
  withStore(({ docOp }) => {
    const col = 'data/users/local/saves/items/s1/pages';
    for (const p of [3, 1, 4, 2])
      docOp({ op: 'set', path: `${col}/p${p}`, data: { p, first: p * 10, turns: [{ p }] } });
    docOp({ op: 'set', path: `${col}/p1/deeper/x`, data: { p: 99 } });
    const ids = q => docOp({ op: 'query', path: col, ...q }).docs.map(d => d.id);
    assert.deepEqual(ids({ order: ['p', 'asc'] }), ['p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(ids({ where: [['p', '>', 1]], order: ['p', 'asc'], limit: 2 }), ['p2', 'p3']);
    assert.deepEqual(ids({ where: [['first', '<=', 20]], order: ['first', 'desc'] }), ['p2', 'p1']);
    assert.deepEqual(ids({ where: [['p', '==', 4]] }), ['p4']);
    assert.deepEqual(docOp({ op: 'query', path: col, where: [['p', '==', 4]] }).docs[0].data.turns, [{ p: 4 }]);
    assert.throws(() => ids({ where: [["p') OR 1=1 --", '>', 0]] }), { code: 'invalid_query' });
    assert.throws(() => ids({ where: [['p', 'in', [1]]] }), { code: 'invalid_query' });
  }));

test('the server keeps saves and images across restarts, and images need the page cookie', async () => {
  let s = await openServer();
  const { dataDir } = s;
  try {
    await s.call('/api/db', JSON.stringify({ op: 'set', path: 'data/users/local/saves/items/a', data: { n: 1 } }));
    const png = new Uint8Array([137, 80, 78, 71]);
    const { id } = await (await s.call('/api/assets/upload', png, { 'Content-Type': 'image/png' })).json();
    assert.equal((await fetch(`${s.url}/assets/${id}`)).status, 403);
    assert.equal((await s.call('/api/db', '{}', { 'X-DR-Token': 'wrong' })).status, 403);
    await s.stop({ keep: true });

    s = await openServer({ dataDir });
    const got = await (
      await s.call('/api/db', JSON.stringify({ op: 'get', path: 'data/users/local/saves/items/a' }))
    ).json();
    assert.deepEqual(got, { exists: true, data: { n: 1 } });
    const img = await fetch(`${s.url}/assets/${id}`, { headers: { Cookie: s.cookie } });
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.deepEqual(new Uint8Array(await img.arrayBuffer()), png);
    const list = await (await s.call('/api/assets/list', '{}')).json();
    assert.deepEqual(
      list.files.map(f => [f.id, f.contentType, f.size]),
      [[id, 'image/png', 4]],
    );
    await s.call('/api/assets/delete', JSON.stringify({ id }));
    assert.equal((await fetch(`${s.url}/assets/${id}`, { headers: { Cookie: s.cookie } })).status, 404);
  } finally {
    await s.stop();
  }
});

test('the key stays on the server: never sent back, kept for the same endpoint, dropped for another', async () => {
  const s = await openServer();
  const set = async body => (await s.call('/api/connection/set', JSON.stringify(body))).json();
  const get = async () => (await s.call('/api/connection/get', '{}')).json();
  const config = { endpoint: 'https://a.example/v1', model: 'm' };
  try {
    assert.deepEqual(await set({ config, apiKey: 'secret-1' }), { hasKey: true });
    assert.deepEqual(await get(), { config, hasKey: true });
    await set({ config: { ...config, model: 'm2' } });
    assert.equal(JSON.parse(readFileSync(join(s.dataDir, 'connection.json'), 'utf8')).apiKey, 'secret-1');
    assert.deepEqual(await set({ config: { ...config, endpoint: 'https://b.example/v1' } }), { hasKey: false });
  } finally {
    await s.stop();
  }
});

test('bad requests never stop the server; image lists are kept; stored files run in a sandbox', async () => {
  const s = await openServer();
  const port = new URL(s.url).port;
  const raw = line =>
    new Promise((resolve, reject) => {
      const sock = connect(port, '127.0.0.1', () => sock.end(`${line} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`));
      sock.on('data', d => resolve(String(d).split('\r\n')[0]));
      sock.on('error', reject);
    });
  try {
    assert.match(await raw('GET //['), /^HTTP\/1\.1 [45]\d\d/);
    const manifest = await s.call('/api/assets/upload', '{"images":[]}', { 'Content-Type': 'application/json' });
    const { id } = await manifest.json();
    const back = await fetch(`${s.url}/assets/${id}`, { headers: { Cookie: s.cookie } });
    assert.equal(await back.text(), '{"images":[]}');
    assert.match(back.headers.get('content-security-policy'), /sandbox/);
    const html = await s.call('/api/assets/upload', '<script>', { 'Content-Type': 'text/html' });
    assert.equal(html.status, 400);
    assert.equal((await fetch(s.url)).status, 200);
  } finally {
    await s.stop();
  }
});

test('config.json: port, data folder (relative to standalone/) and extra host names', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'config.json');
    writeFileSync(file, JSON.stringify({ port: 3100, dataDir: 'my-data', hosts: ['my-pc.tail1234.ts.net'] }));
    const c = loadConfig(file);
    assert.equal(c.port, 3100);
    assert.equal(basename(c.dataDir), 'my-data');
    assert.deepEqual(c.extraHosts, ['my-pc.tail1234.ts.net']);
    assert.deepEqual(loadConfig(join(dir, 'missing.json')), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('server settings from ⚙: written to config.json, names allowed at once, port and folder after a restart', async () => {
  const s = await openServer();
  const set = body => s.call('/api/server/set', JSON.stringify(body));
  const port = Number(new URL(s.url).port);
  try {
    const now = await (await s.call('/api/server/get', '{}')).json();
    assert.deepEqual([now.port, now.dataDir, now.hosts], [port, 'data', []]);
    const r = await (await set({ port, dataDir: 'data', hosts: ['my-pc.tail1234.ts.net'] })).json();
    assert.deepEqual(r, { restart: true }); // the test server's data folder isn't standalone/data
    const file = JSON.parse(readFileSync(join(s.dataDir, 'config.json'), 'utf8'));
    assert.deepEqual(file, { port, dataDir: 'data', hosts: ['my-pc.tail1234.ts.net'] });
    const status = await new Promise((resolve, reject) => {
      const req = request(s.url, { headers: { Host: 'my-pc.tail1234.ts.net' } }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 200);
    assert.equal((await set({ port: 0, dataDir: 'data', hosts: [] })).status, 400);
    assert.equal((await set({ port, dataDir: 'data', hosts: ['bad host/'] })).status, 400);
    assert.equal((await set({ port, dataDir: '', hosts: [] })).status, 400);
  } finally {
    await s.stop();
  }
});
