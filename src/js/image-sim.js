/* ============ looks-the-same finder for the library: 64x64 grayscale signatures ============ */

export const SIG = 64; // signature side, in pixels
const MAX_DIFF = 8; // the largest difference one pixel may show (0-255)
const MEAN_DIFF = 1.5; // the average difference over the whole picture
const MEAN_GAP = 2; // pictures whose average brightness differs by more than this are never the same

// The same picture stored twice (compressed again, renamed) differs by a few levels at most. A different expression,
// outfit or prop changes a small area a lot, so the largest single difference is what tells them apart.
export function similar(a, b) {
  if (Math.abs(a.ar - b.ar) > 0.02 * Math.max(a.ar, b.ar)) return false;
  const p = a.px,
    q = b.px;
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const d = p[i] > q[i] ? p[i] - q[i] : q[i] - p[i];
    if (d > MAX_DIFF) return false;
    sum += d;
  }
  return sum / p.length <= MEAN_DIFF;
}

// sigs: [{ ar, px, mean }] -> groups of indexes (two or more) that look the same
export function groupSimilar(sigs) {
  const parent = sigs.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const order = sigs.map((_, i) => i).sort((i, j) => sigs[i].mean - sigs[j].mean);
  for (let x = 0; x < order.length; x++) {
    const i = order[x];
    for (let y = x + 1; y < order.length; y++) {
      const j = order[y];
      if (sigs[j].mean - sigs[i].mean > MEAN_GAP) break;
      if (find(i) !== find(j) && similar(sigs[i], sigs[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  sigs.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  return [...groups.values()].filter(g => g.length > 1);
}

// the signature of one picture: transparent areas count as mid grey; shrunk in two steps so small details average out
export async function visualSig(blob) {
  const bmp = await createImageBitmap(blob);
  const ar = bmp.width / bmp.height;
  const step = side => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = side;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    return [cv, c];
  };
  const [mid, mc] = step(SIG * 4);
  mc.fillStyle = '#808080';
  mc.fillRect(0, 0, SIG * 4, SIG * 4);
  mc.drawImage(bmp, 0, 0, SIG * 4, SIG * 4);
  const [, sc] = step(SIG);
  sc.drawImage(mid, 0, 0, SIG, SIG);
  const d = sc.getImageData(0, 0, SIG, SIG).data;
  const px = new Uint8Array(SIG * SIG);
  let sum = 0;
  for (let i = 0; i < px.length; i++) {
    const v = Math.round(0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]);
    px[i] = v;
    sum += v;
  }
  if (bmp.close) bmp.close();
  return { ar, px, mean: sum / px.length };
}
