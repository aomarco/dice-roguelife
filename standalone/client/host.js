// The host adapter for the standalone page (the contract is in src/js/host.js): saves and images live on the local
// server (../server.js), narration goes through its relay to the provider chosen in ⚙ Settings.
import { uid } from '../../src/js/util.js';
import { tr } from './i18n.js';
import { createApiSample, providerConfig } from './providers.js';
import { bindProviderSettings, showSetupBanner } from './settings.js';

async function api(path, body, { raw, type } = {}) {
  const offline = () =>
    Object.assign(new Error(tr('Start the app with npm start, then reload this page.')), { code: 'storage_error' });
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': raw ? type : 'application/json', 'X-DR-Token': window.DR_SERVER_TOKEN },
      body: raw ? body : JSON.stringify(body),
    });
  } catch {
    throw offline();
  }
  // a restarted server has a new token: this page must be reloaded
  if (response.status === 403) throw offline();
  const out = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(out.message || tr('Request failed.')), { code: out.code || 'storage_error' });
  return out;
}

// documents: the same shapes as memDB (src/js/db.js)
const snap = (id, exists, value) => ({ id, exists, data: () => (exists ? structuredClone(value) : undefined) });
function doc(path) {
  const id = path.split('/').pop();
  return {
    path,
    id,
    get: async () => {
      const r = await api('/api/db', { op: 'get', path });
      return snap(id, r.exists, r.data);
    },
    set: data => api('/api/db', { op: 'set', path, data }),
    update: data => api('/api/db', { op: 'update', path, data }),
    delete: () => api('/api/db', { op: 'delete', path }),
  };
}
function collection(path, where = [], order = null, limit = 1000) {
  return {
    where: (field, op, value) => collection(path, [...where, [field, op, value]], order, limit),
    orderBy: (field, dir = 'asc') => collection(path, where, [field, dir], limit),
    limit: n => collection(path, where, order, n),
    doc: id => doc(path + '/' + (id || uid())),
    add: data => api('/api/db', { op: 'add', path, data }),
    get: async () => {
      const r = await api('/api/db', { op: 'query', path, where, order, limit });
      const docs = r.docs.map(d => snap(d.id, true, d.data));
      return { docs, size: docs.length, empty: !docs.length };
    },
  };
}
const db = { doc, collection };

const assets = {
  upload: (blob, { type } = {}) => api('/api/assets/upload', blob, { raw: true, type: type || blob.type }),
  // the game reads .assets (src/js/library.js, images-view.js); the disk's free space is the byte limit
  list: async () => {
    const { files, free } = await api('/api/assets/list', {});
    const all = files.map(f => ({ ...f, url: assetUrl(f.id) }));
    const bytes = files.reduce((n, f) => n + f.size, 0);
    return { assets: all, files: all, usage: { bytes, files: files.length, maxFiles: 50000, maxBytes: bytes + free } };
  },
  delete: id => api('/api/assets/delete', { id }),
};
const assetUrl = id => '/assets/' + id;

const downloads = {
  save: async ({ filename, data }) => {
    const url = URL.createObjectURL(data),
      a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { status: 'saved' };
  },
};

const sample = createApiSample();
export const standaloneHost = {
  id: 'standalone',
  available: () => !!window.DR_SERVER_TOKEN,
  assetUrl,
  bindSettings: bindProviderSettings,
  connect: async capability => {
    if (capability === 'db') return db;
    if (capability === 'assets') return assets;
    if (capability === 'downloads') return downloads;
    if (capability === 'user') return { id: async () => 'local', isOwner: async () => true, can: async () => true };
    if (capability === 'sample') {
      if (!providerConfig().model) showSetupBanner();
      return sample;
    }
    return null;
  },
};
