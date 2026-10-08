import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store.js';
import { startServer } from '../server.js';

function withStore(run) {
  const dir = mkdtempSync(join(tmpdir(), 'dr-store-'));
  const store = openStore(dir);
  try {
    return run(store, dir);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('documents: get, set, update, delete, add, as memDB does', () =>
  withStore(({ docOp }) => {
    assert.deepEqual(docOp({ op: 'get', path: 'data/users/local/settings' }), { exists: false, data: undefined });
    docOp({ op: 'set', path: 'data/users/local/settings', data: { a: 1, b: { c: 2 } } });
    docOp({ op: 'update', path: 'data/users/local/settings', data: { b: { d: 3 }, e: 'x' } });
    assert.deepEqual(docOp({ op: 'get', path: 'data/users/local/settings' }).data, { a: 1, b: { d: 3 }, e: 'x' });
    const { id } = docOp({ op: 'add', path: 'hall', data: { score: 5 } });
    assert.equal(docOp({ op: 'get', path: 'hall/' + id }).data.score, 5);
    docOp({ op: 'delete', path: 'hall/' + id });
    assert.equal(docOp({ op: 'get', path: 'hall/' + id }).exists, false);
    assert.throws(() => docOp({ op: 'get', path: 'hall' }), { code: 'invalid_path' });
    assert.throws(() => docOp({ op: 'query', path: 'hall/x' }), { code: 'invalid_path' });
    assert.throws(() => docOp({ op: 'set', path: 'a/../b', data: {} }), { code: 'invalid_path' });
  }));

test('queries: direct children only, where, orderBy and limit', () =>
  withStore(({ docOp }) => {
    const col = 'data/users/local/saves/items/s1/pages';
    for (const p of [3, 1, 4, 2]) docOp({ op: 'set', path: `${col}/p${p}`, data: { p, first: p * 10 } });
    docOp({ op: 'set', path: `${col}/p1/deeper/x`, data: { p: 99 } });
    const ids = r => r.docs.map(d => d.id);
    assert.deepEqual(ids(docOp({ op: 'query', path: col, order: ['p', 'asc'] })), ['p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(ids(docOp({ op: 'query', path: col, where: [['p', '>', 1]], order: ['p', 'asc'], limit: 2 })), [
      'p2',
      'p3',
    ]);
    assert.deepEqual(ids(docOp({ op: 'query', path: col, where: [['first', '<=', 20]], order: ['first', 'desc'] })), [
      'p2',
      'p1',
    ]);
    assert.deepEqual(ids(docOp({ op: 'query', path: col, where: [['p', '==', 4]] })), ['p4']);
    assert.throws(() => docOp({ op: 'query', path: col, where: [["p') OR 1=1 --", '>', 0]] }), {
      code: 'invalid_query',
    });
    assert.throws(() => docOp({ op: 'query', path: col, where: [['p', 'in', [1]]] }), { code: 'invalid_query' });
  }));

test('the server keeps saves and images across restarts, and images need the page cookie', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dr-server-'));
  const open = async () => {
    const server = await startServer({ port: 0, dataDir });
    const url = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(url);
    const token = /window.DR_SERVER_TOKEN="([a-f0-9]+)"/.exec(await res.text())[1];
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const call = (path, body, headers = {}) =>
      fetch(url + path, { method: 'POST', headers: { 'X-DR-Token': token, ...headers }, body });
    const stop = async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    };
    return { url, cookie, call, stop };
  };
  try {
    let s = await open();
    await s.call('/api/db', JSON.stringify({ op: 'set', path: 'data/users/local/saves/items/a', data: { n: 1 } }));
    const png = new Uint8Array([137, 80, 78, 71]);
    const { id } = await (await s.call('/api/assets/upload', png, { 'Content-Type': 'image/png' })).json();
    assert.equal((await fetch(`${s.url}/assets/${id}`)).status, 403);
    assert.equal((await s.call('/api/db', '{}', { 'X-DR-Token': 'wrong' })).status, 403);
    await s.stop();

    s = await open();
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
    await s.stop();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
