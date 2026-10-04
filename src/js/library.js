/* ============ image library: index, set cards ============ */
import { noteIgnored, nowIso, sha256Hex, toast } from './util.js';
import { WORLD_ALIAS } from './data.js';
import { dget, dset, isPrivileged, platform, thaw, userCol } from './db.js';
import { app } from './app.js';
import { saveSettings } from './settings.js';
import { logErr } from './diag.js';
import { imgUrl } from './images.js';

export let imgError = '';
export const SETDOC = k => platform.shared.doc(`sets/${k}`);
export const IMGX = {
  // image index pages: imgidx/<p> = {p,n,rows}. Same 5,000-document cap as everything else, so ~120 images per document.
  max: 120,
  map: new Map(),
  strip(x) {
    const o = Object.assign({}, x);
    delete o._p;
    return o;
  },
  ref(p) {
    return platform.shared.doc(`imgidx/${String(p).padStart(4, '0')}`);
  },
  pageOf(id) {
    return this.map.get(id);
  },
  nextPage() {
    const counts = {};
    for (const p of this.map.values()) counts[p] = (counts[p] || 0) + 1;
    const ps = Object.keys(counts)
      .map(Number)
      .sort((a, b) => a - b);
    for (const p of ps) if (counts[p] < this.max) return p;
    return ps.length ? ps[ps.length - 1] + 1 : 0;
  },
  rows(p, extra, skip) {
    const rs = app.images
      .filter(x => this.map.get(x.id) === p && x.id !== skip && (!extra || x.id !== extra.id))
      .map(x => this.strip(x));
    if (extra) rs.push(this.strip(extra));
    return rs;
  },
  async write(p, extra, skip) {
    this.ver = (this.ver || 0) + 1;
    const rs = this.rows(p, extra, skip);
    if (!rs.length) {
      await this.ref(p)
        .delete()
        .catch(e => noteIgnored('library: this.ref.delete', e));
      return;
    }
    await this.ref(p).set({ p, n: rs.length, rows: rs });
  },
  doc(id) {
    return {
      set: async x => {
        const p = IMGX.assign(id);
        // a picture already in the list is written through the page writer, so edits and uploads never overwrite each other
        if (app.images.includes(x)) await IMGX.save(p);
        else await IMGX.write(p, Object.assign({}, x, { id }));
      },
      delete: async () => {
        const p = IMGX.map.get(id);
        if (p == null) return;
        IMGX.map.delete(id);
        await IMGX.write(p, null, id);
      },
    };
  },
  // The page a picture belongs to, picked now (before anything is written).
  assign(id) {
    let p = this.map.get(id);
    if (p == null) {
      p = this.nextPage();
      this.map.set(id, p);
    }
    return p;
  },
  // Pictures sent side by side each get their own page (a "lane"), so their list writes never wait for each other:
  // lane 0 fills one page, lane 1 another, and so on. A lane moves to a free page when its page is full.
  lanes: [],
  laneAssign(id, lane) {
    let p = this.map.get(id);
    if (p != null) return p;
    const counts = {};
    for (const q of this.map.values()) counts[q] = (counts[q] || 0) + 1;
    let cur = this.lanes[lane];
    if (cur == null || (counts[cur] || 0) >= this.max) {
      const taken = new Set(this.lanes.filter((q, i) => i !== lane && q != null));
      let q = 0;
      while ((counts[q] || 0) >= this.max || taken.has(q)) q++;
      this.lanes[lane] = cur = q;
    }
    this.map.set(id, cur);
    return cur;
  },
  // Write a page and wait until a write that includes the pictures in memory right now has finished. At most one write
  // of a page is in flight; rows that land while it runs go out together in the next one, so a fast database is written
  // almost every time and a slow one is written in bigger steps. Pages are separate documents and run side by side.
  pending: new Map(),
  save(p) {
    let s = this.pending.get(p);
    if (!s) {
      s = { running: false, waiters: [] };
      this.pending.set(p, s);
    }
    return new Promise((resolve, reject) => {
      s.waiters.push({ resolve, reject });
      if (!s.running) this.pump(p, s);
    });
  },
  async pump(p, s) {
    s.running = true;
    while (s.waiters.length) {
      const batch = s.waiters.splice(0); // the writers waiting now are covered by the write below
      let err = null;
      try {
        await this.write(p);
      } catch (e) {
        err = e;
      }
      for (const w of batch) err ? w.reject(err) : w.resolve();
    }
    s.running = false;
  },
  async flush(ids, onStat) {
    // write every page that holds one of these ids, once; different pages in parallel
    for (const id of ids) this.assign(id);
    const ps = [...new Set(ids.map(id => this.map.get(id)))];
    let n = 0;
    const queue = [...ps];
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        onStat && onStat(++n, ps.length);
        await this.save(p);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, ps.length) }, worker));
  },
  async clear() {
    const ps = [...new Set(this.map.values())];
    this.map.clear();
    for (const p of ps)
      await this.ref(p)
        .delete()
        .catch(e => noteIgnored('library: this.ref.delete', e));
  },
  async load() {
    const out = [];
    let after = -1;
    for (let g = 0; g < 60; g++) {
      const r = await platform.shared.collection('imgidx').where('p', '>', after).orderBy('p', 'asc').limit(20).get();
      if (!r.docs.length) break;
      for (const d of r.docs) {
        const pg = thaw(d.data());
        for (const x of pg.rows || []) {
          this.map.set(x.id, pg.p);
          out.push(x);
        }
        after = pg.p;
      }
      if (r.docs.length < 20) break;
    }
    return out;
  },
  async legacyAll() {
    const out = [];
    let last = '';
    for (let g = 0; g < 40; g++) {
      const r = await platform.shared.collection('images').where('id', '>', last).orderBy('id', 'asc').limit(500).get();
      if (!r.docs.length) break;
      for (const d of r.docs) out.push(thaw(d.data()));
      last = out[out.length - 1].id;
      if (r.docs.length < 500) break;
    }
    return out;
  },
  async migrate(legacy) {
    // one doc per image -> pages; verify, then delete the old docs in the background
    const pages = [];
    for (let i = 0; i < legacy.length; i += this.max) pages.push(legacy.slice(i, i + this.max));
    for (let p = 0; p < pages.length; p++) {
      await this.ref(p).set({ p, n: pages[p].length, rows: pages[p].map(x => this.strip(x)) });
      for (const x of pages[p]) this.map.set(x.id, p);
    }
    const check = await this.load();
    if (check.length < legacy.length) throw new Error('image index migration verify failed');
    (async () => {
      let n = 0;
      for (const x of legacy) {
        try {
          await platform.shared.doc(`images/${x.id}`).delete();
          n++;
        } catch (e) {
          noteIgnored('legacy images: delete an old document', e);
        }
      }
      if (n) toast(`이미지 목록 정리 완료 (${n}건)`, 3000);
    })();
  },
};
export const IMGDOC = id => IMGX.doc(id);
export async function loadImages() {
  imgError = '';
  try {
    app.images = await IMGX.load();
  } catch (e) {
    app.images = [];
    imgError = (e && (e.code || e.message)) || 'unknown';
  }
  if (!app.images.length && !platform.memMode) {
    // older layout: one document per image
    try {
      const legacy = await IMGX.legacyAll();
      if (legacy.length) {
        toast('이미지 목록 형식을 정리하는 중...', 4000);
        await IMGX.migrate(legacy);
        app.images = await IMGX.load();
      }
    } catch (e) {
      console.warn('imgidx migrate', e);
      imgError = imgError || (e && e.message) || 'migrate';
    }
  }
  if (!app.images.length && platform.assets && !platform.memMode && !platform.localMode) {
    // a duplicate: assets came along, the index did not
    try {
      const m = await findManifestAsset();
      if (m) {
        toast('복제본 이미지 목록을 복원하는 중...', 4000);
        const hit = await restoreFromManifest(m.data);
        if (hit) toast(`이미지 ${hit}장 목록 복원 완료`, 4000);
      }
    } catch (e) {
      noteIgnored('images: restore from manifest', e);
    }
  }
  if (!app.images.length && !platform.memMode && !platform.localMode) {
    // owner: move the index out of the private subtree once
    try {
      const q = await userCol('images/items').limit(1000).get();
      const old = q.docs.map(d => thaw(d.data()));
      if (old.length) {
        for (const x of old) await IMGDOC(x.id).set(x);
        app.images = old;
        const q2 = await userCol('sets/items').limit(1000).get();
        for (const d of q2.docs) await SETDOC(d.id).set(d.data());
        toast(`이미지 목록 ${old.length}건을 공유 영역으로 옮겼어요`);
      }
    } catch (e) {
      noteIgnored('images: move the private list to the shared one', e);
    }
  }
}
// One-time migration from the v1.0-1.9.2 layout (data/local/<name>/<id>), which only worked when no user id was available.
export async function migrateLegacy() {
  if (platform.memMode || platform.localMode) return;
  try {
    const done = await dget('settings');
    if (done && done.migrated) return;
    const L = 'data/local';
    const col = async c => {
      try {
        return (await platform.db.collection(`${L}/${c}`).limit(1000).get()).docs;
      } catch (e) {
        return [];
      }
    };
    const imgs = await col('images'),
      sets = await col('sets'),
      saves = await col('saves'),
      states = await col('states'),
      hall = await col('hall');
    let n = 0;
    for (const d of imgs) {
      await IMGDOC(d.id).set(d.data());
      n++;
    }
    for (const d of sets) {
      await SETDOC(d.id).set(d.data());
      n++;
    }
    for (const d of states) {
      await dset(`states/items/${d.id}`, d.data());
      n++;
    }
    for (const d of hall) {
      await dset(`hall/items/${d.id}`, d.data());
      n++;
    }
    for (const d of saves) {
      await dset(`saves/items/${d.id}`, d.data());
      n++;
      const ts = await col(`saves/${d.id}/turns`);
      for (let k = 0; k < ts.length; k += 10) {
        await Promise.all(
          ts
            .slice(k, k + 10)
            .map(t => platform.db.doc(`${platform.userPath}/saves/items/${d.id}/turns/${t.id}`).set(t.data())),
        );
        n += Math.min(10, ts.length - k);
      }
    }
    let st = null;
    try {
      const x = await platform.db.doc(`${L}/settings/main`).get();
      st = x.exists ? x.data() : null;
    } catch (e) {
      noteIgnored('legacy settings: read', e);
    }
    app.settings = Object.assign(app.settings, st || {}, { migrated: true });
    await saveSettings();
    if (n) toast(`이전 데이터 ${n}건을 옮겨왔어요`, 4000);
  } catch (e) {
    console.warn('migrate', e);
  }
}
export async function loadSets() {
  try {
    const q = await platform.shared.collection('sets').limit(1000).get();
    app.setMeta = {};
    q.docs.forEach(d => {
      app.setMeta[d.id] = thaw(d.data());
    });
  } catch (e) {
    app.setMeta = {};
  }
  migrateWorldLabels().catch(e => logErr('wlabels', e));
}
export async function migrateWorldLabels() {
  // retired world ids on cards and images become the backgrounds they meant; runs once on the owner's device
  const old = v => Object.prototype.hasOwnProperty.call(WORLD_ALIAS, v);
  const fix = list => [
    ...new Set(list.map(v => (old(v) ? (v === 'possess' ? null : WORLD_ALIAS[v][0]) : v)).filter(Boolean)),
  ];
  const setKs = Object.keys(app.setMeta).filter(
    k => Array.isArray(app.setMeta[k].worlds) && app.setMeta[k].worlds.some(old),
  );
  const imgIds = app.images.filter(x => Array.isArray(x.worlds) && x.worlds.some(old)).map(x => x.id);
  if (!setKs.length && !imgIds.length) return;
  if (!(await isPrivileged())) return;
  for (const k of setKs) {
    app.setMeta[k].worlds = fix(app.setMeta[k].worlds);
    if (old(app.setMeta[k].world)) app.setMeta[k].world = app.setMeta[k].worlds[0] || 'any';
    await SETDOC(k).set(app.setMeta[k]);
  }
  for (const x of app.images) if (Array.isArray(x.worlds) && x.worlds.some(old)) x.worlds = fix(x.worlds);
  await IMGX.flush(imgIds);
  toast(`세계 라벨 정리: 세트 ${setKs.length}개, 이미지 ${imgIds.length}장`, 4000);
}
export async function findManifestAsset() {
  try {
    const l = (await platform.assets.list()).assets
      .filter(a => /json|text/.test(a.contentType || ''))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    for (const a of l) {
      try {
        const j = await (await fetch(a.url || imgUrl(a.id))).json();
        if (j && j.kind === 'dice-roguelife-manifest') return { asset: a, data: j };
      } catch {
        // unreadable or not a manifest: look at the next file
      }
    }
  } catch (e) {
    noteIgnored('find manifest: list assets', e);
  }
  return null;
}
// rebuilds the image list from a manifest (saveManifest in images-view.js): each stored file whose hash is in it gets
// its row back. Returns how many did. onProgress(text) hears how far it is.
export async function restoreFromManifest(m, onProgress = () => {}) {
  const byS = new Map(m.items.filter(i => i.shash).map(i => [i.shash, i]));
  let list = [];
  try {
    list = (await platform.assets.list()).assets.filter(a => /^image\//.test(a.contentType || ''));
  } catch (e) {
    return 0;
  }
  let n = 0,
    hit = 0;
  for (const a of list) {
    if (app.images.some(x => x.id === a.id)) continue;
    onProgress(`${++n}/${list.length} 목록 복원 중`);
    try {
      const b = await (await fetch(a.url || imgUrl(a.id))).blob();
      const h = await sha256Hex(b);
      const it = byS.get(h);
      if (!it) continue;
      const row = Object.assign({}, it, { id: a.id, shash: h, createdAt: a.createdAt || nowIso() });
      await IMGDOC(a.id).set(row);
      app.images.push(row);
      hit++;
    } catch (e) {
      noteIgnored('restore from manifest: one image', e);
    }
  }
  for (const [k, v] of Object.entries(m.sets || {})) {
    app.setMeta[k] = v;
    await SETDOC(k)
      .set(v)
      .catch(e => noteIgnored('images-view: SETDOC.set', e));
  }
  onProgress('');
  return hit;
}
