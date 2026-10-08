import { createApiSample } from './providers.js';

let opening;
const urls = new Map();
function openDB() {
  return (opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('dice-roguelife', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('docs');
      request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Dice Roguelife tabs to upgrade storage.'));
  }));
}
async function transaction(store, mode, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () =>
      reject(
        Object.assign(tx.error || new Error('Storage failed'), {
          code: tx.error?.name === 'QuotaExceededError' ? 'quota_exceeded' : 'storage_error',
        }),
      );
    run(tx.objectStore(store), value => {
      result = value;
    });
  });
}
const snap = (path, value) => ({
  id: path.split('/').pop(),
  exists: value !== undefined,
  data: () => structuredClone(value),
});
function doc(path) {
  return {
    path,
    id: path.split('/').pop(),
    get: async () =>
      snap(
        path,
        await transaction('docs', 'readonly', (s, done) => {
          s.get(path).onsuccess = e => done(e.target.result);
        }),
      ),
    set: value => transaction('docs', 'readwrite', s => s.put(value, path)),
    delete: () => transaction('docs', 'readwrite', s => s.delete(path)),
    update: value =>
      transaction('docs', 'readwrite', s => {
        s.get(path).onsuccess = e => s.put({ ...e.target.result, ...value }, path);
      }),
  };
}
function collection(path, filters = [], order = null, limit = Infinity) {
  return {
    doc: id => doc(path + '/' + (id || crypto.randomUUID())),
    add: async value => {
      const id = crypto.randomUUID();
      await doc(path + '/' + id).set(value);
      return { id };
    },
    where: (f, op, v) => collection(path, [...filters, [f, op, v]], order, limit),
    orderBy: (f, dir = 'asc') => collection(path, filters, [f, dir], limit),
    limit: n => collection(path, filters, order, n),
    get: async () => {
      const rows = await transaction('docs', 'readonly', (s, done) => {
        const out = [];
        s.openCursor().onsuccess = e => {
          const c = e.target.result;
          if (!c) return done(out);
          if (c.key.startsWith(path + '/') && !c.key.slice(path.length + 1).includes('/')) out.push([c.key, c.value]);
          c.continue();
        };
      });
      let docs = rows
        .filter(([, value]) =>
          filters.every(([f, op, v]) => {
            const x = value[f];
            switch (op) {
              case '==':
                return x === v;
              case '<':
                return x < v;
              case '>':
                return x > v;
              case '<=':
                return x <= v;
              case '>=':
                return x >= v;
              default:
                throw new Error('Unsupported query operator');
            }
          }),
        )
        .map(([key, value]) => snap(key, value));
      if (order)
        docs.sort((a, b) => {
          const x = a.data()[order[0]],
            y = b.data()[order[0]];
          return (x === y ? 0 : x > y ? 1 : -1) * (order[1] === 'desc' ? -1 : 1);
        });
      docs = docs.slice(0, limit);
      return { docs, size: docs.length, empty: !docs.length };
    },
  };
}
const store = { doc, collection };
function assetUrl(id) {
  return urls.get(id) || '';
}
async function loadAssets() {
  const assets = await transaction('assets', 'readonly', (s, done) => {
    s.getAll().onsuccess = e => done(e.target.result);
  });
  for (const a of assets) if (!urls.has(a.id)) urls.set(a.id, URL.createObjectURL(a.blob));
  return assets.map(({ blob, ...a }) => ({ ...a, url: assetUrl(a.id) }));
}
const assets = {
  upload: async (blob, { type } = {}) => {
    const id = crypto.randomUUID();
    await transaction('assets', 'readwrite', s =>
      s.put({ id, blob, contentType: type || blob.type, size: blob.size, createdAt: new Date().toISOString() }),
    );
    urls.set(id, URL.createObjectURL(blob));
    return { id };
  },
  list: async () => {
    const files = await loadAssets();
    const estimate = (await navigator.storage?.estimate?.()) || {};
    return {
      assets: files,
      files,
      usage: {
        bytes: files.reduce((n, a) => n + a.size, 0),
        files: files.length,
        maxFiles: 50000,
        maxBytes: estimate.quota || 1073741824,
        ...estimate,
      },
    };
  },
  delete: async id => {
    await transaction('assets', 'readwrite', s => s.delete(id));
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
  },
};
const sample = createApiSample();
export const browserHost = {
  id: 'browser',
  available: () => true,
  assetUrl,
  assetEntries: () => [...urls.entries()],
  connect: async capability => {
    if (capability === 'db') {
      await openDB();
      return store;
    }
    if (capability === 'assets') {
      await loadAssets();
      return assets;
    }
    if (capability === 'sample') return sample;
    if (capability === 'user') return { id: async () => 'local', isOwner: async () => true, can: async () => true };
    if (capability === 'downloads')
      return {
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
    return null;
  },
};
