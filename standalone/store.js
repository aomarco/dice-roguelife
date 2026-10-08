// The game's document store and image files on disk: one SQLite file (Node's built-in node:sqlite) plus a folder of
// images. Documents behave like memDB in src/js/db.js, the reference for what the game expects.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const storeError = (code, message) => Object.assign(new Error(message), { code });
const FIELD = /^\w+$/;
const OPS = { '==': '=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };
const ID = /^[\w-]{1,64}$/;

function checkPath(path, isDoc) {
  const parts = typeof path === 'string' ? path.split('/') : [];
  if (!parts.length || parts.some(p => !p || p === '.' || p === '..') || (parts.length % 2 === 0) !== isDoc)
    throw storeError('invalid_path', `Not a ${isDoc ? 'document' : 'collection'} path: ${path}`);
  return path;
}
const parentOf = path => path.slice(0, path.lastIndexOf('/'));
// node:sqlite binds numbers and strings; the game only compares those
function bindable(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  throw storeError('invalid_query', 'Only numbers and strings can be compared.');
}

export function openStore(dir) {
  const files = join(dir, 'assets');
  mkdirSync(files, { recursive: true });
  const db = new DatabaseSync(join(dir, 'dice-roguelife.db'));
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, parent TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS docs_parent ON docs (parent);
    CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL, created TEXT NOT NULL);`);
  const getDoc = db.prepare('SELECT data FROM docs WHERE path = ?');
  const putDoc = db.prepare('INSERT OR REPLACE INTO docs (path, parent, data) VALUES (?, ?, ?)');
  const delDoc = db.prepare('DELETE FROM docs WHERE path = ?');
  const read = path => {
    const row = getDoc.get(path);
    return row ? JSON.parse(row.data) : undefined;
  };
  const write = (path, data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw storeError('invalid_data', 'A document is an object.');
    putDoc.run(path, parentOf(path), JSON.stringify(data));
  };

  // one request from the page: op (get, set, update, delete, add, query) on path, with data or a query
  function docOp({ op, path, data, where = [], order = null, limit = 1000 }) {
    switch (op) {
      case 'get': {
        const value = read(checkPath(path, true));
        return { exists: value !== undefined, data: value };
      }
      case 'set':
        write(checkPath(path, true), data);
        return {};
      case 'update':
        // node:sqlite is synchronous, so nothing runs between this read and write
        write(checkPath(path, true), { ...read(path), ...data });
        return {};
      case 'delete':
        delDoc.run(checkPath(path, true));
        return {};
      case 'add': {
        const id = randomUUID();
        write(checkPath(path, false) + '/' + id, data);
        return { id };
      }
      case 'query': {
        let sql = 'SELECT path, data FROM docs WHERE parent = ?';
        const args = [checkPath(path, false)];
        for (const [field, cmp, value] of where) {
          if (!FIELD.test(field) || !OPS[cmp]) throw storeError('invalid_query', 'Unsupported condition.');
          sql += ` AND json_extract(data, '$.${field}') ${OPS[cmp]} ?`;
          args.push(bindable(value));
        }
        if (order) {
          if (!FIELD.test(order[0])) throw storeError('invalid_query', 'Unsupported order.');
          sql += ` ORDER BY json_extract(data, '$.${order[0]}') ${order[1] === 'desc' ? 'DESC' : 'ASC'}`;
        }
        sql += ' LIMIT ?';
        args.push(Math.max(0, Math.min(Number(limit) || 0, 10000)));
        const docs = db
          .prepare(sql)
          .all(...args)
          .map(r => ({ id: r.path.slice(r.path.lastIndexOf('/') + 1), data: JSON.parse(r.data) }));
        return { docs };
      }
      default:
        throw storeError('invalid_query', 'Unknown operation.');
    }
  }

  const assets = {
    add(bytes, type) {
      const id = randomUUID(),
        tmp = join(files, id + '.tmp');
      writeFileSync(tmp, bytes);
      renameSync(tmp, join(files, id));
      db.prepare('INSERT INTO assets (id, type, size, created) VALUES (?, ?, ?, ?)').run(
        id,
        type,
        bytes.length,
        new Date().toISOString(),
      );
      return id;
    },
    // { type, bytes } or null
    get(id) {
      if (!ID.test(id)) return null;
      const row = db.prepare('SELECT type FROM assets WHERE id = ?').get(id);
      return row ? { type: row.type, bytes: readFileSync(join(files, id)) } : null;
    },
    list: () => db.prepare('SELECT id, type AS contentType, size, created AS createdAt FROM assets').all(),
    delete(id) {
      if (!ID.test(id)) return;
      db.prepare('DELETE FROM assets WHERE id = ?').run(id);
      rmSync(join(files, id), { force: true });
    },
  };

  return { docOp, assets, close: () => db.close() };
}
