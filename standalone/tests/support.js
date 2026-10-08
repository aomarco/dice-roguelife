// A standalone server on a free port with its own data folder, as the page sees it: its token and its picture cookie.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server.js';

export const tempDir = () => mkdtempSync(join(tmpdir(), 'dr-standalone-'));

export async function openServer({ dataDir = tempDir(), ...options } = {}) {
  const server = await startServer({ port: 0, dataDir, configFile: join(dataDir, 'config.json'), ...options });
  const url = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(url);
  const token = /window.DR_SERVER_TOKEN="([a-f0-9]+)"/.exec(await res.text())[1];
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const call = (path, body, headers = {}) =>
    fetch(url + path, { method: 'POST', headers: { 'X-DR-Token': token, ...headers }, body });
  // keep: leave the data folder for the next server
  const stop = async ({ keep = false } = {}) => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (!keep) rmSync(dataDir, { recursive: true, force: true });
  };
  return { url, cookie, call, stop, dataDir };
}
