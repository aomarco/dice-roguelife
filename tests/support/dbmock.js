window.__store = new Map();
const __store = window.__store;
__store.set('config/prompt', window.__DR_PROMPT);
const __mk = p => ({
  get: async () => ({
    exists: __store.has(p),
    id: p.split('/').pop(),
    data: () => JSON.parse(JSON.stringify(__store.get(p))),
  }),
  set: async d => {
    __store.set(p, JSON.parse(JSON.stringify(d)));
  },
  delete: async () => {
    __store.delete(p);
  },
  update: async () => {},
});
const __col = (c, w = [], o = null, l = 1000) => ({
  where: (f, op, v) => __col(c, [...w, [f, op, v]], o, l),
  orderBy: (f, d = 'asc') => __col(c, w, [f, d], l),
  limit: n => __col(c, w, o, n),
  doc: id => __mk(c + '/' + (id || Math.random().toString(36).slice(2))),
  add: async d => {
    const id = Math.random().toString(36).slice(2);
    __store.set(c + '/' + id, JSON.parse(JSON.stringify(d)));
    return { id };
  },
  get: async () => {
    let docs = [...__store.keys()]
      .filter(k => k.startsWith(c + '/') && !k.slice(c.length + 1).includes('/'))
      .map(k => ({ id: k.split('/').pop(), exists: true, data: () => JSON.parse(JSON.stringify(__store.get(k))) }));
    for (const [f, op, v] of w)
      docs = docs.filter(d => {
        const x = d.data()[f];
        return op === '=='
          ? x === v
          : op === '<='
            ? x <= v
            : op === '>='
              ? x >= v
              : op === '<'
                ? x < v
                : op === '>'
                  ? x > v
                  : true;
      });
    if (o) docs.sort((a, b) => (a.data()[o[0]] > b.data()[o[0]] ? 1 : -1) * (o[1] === 'desc' ? -1 : 1));
    docs = docs.slice(0, l);
    return { docs, size: docs.length, empty: !docs.length };
  },
});
window.__dbmock = { doc: __mk, collection: __col };
