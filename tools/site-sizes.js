// Writes each guide-site image's size into docs/index.html (width/height, plus data-size-<lang> where the languages'
// shots differ), so the page keeps its layout while lazy screenshots load and a #link lands on its section.
//   node tools/site-sizes.js        (tools/shots.js runs it after every capture)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../docs', import.meta.url));
const PAGE = join(DOCS, 'index.html');
const LANGS = ['en', 'ko', 'ja'];

function size(file) {
  const b = readFileSync(file);
  if (b[0] === 0x89) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length; i += 2 + b.readUInt16BE(i + 2)) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
  }
  throw new Error(`no size in ${file}`);
}

export function siteSizes() {
  const html = readFileSync(PAGE, 'utf8');
  const next = html.replace(/<img\b[^>]*>/g, tag => {
    const src = (/\ssrc="(images\/[^"]+)"/.exec(tag) || [])[1];
    if (!src || !existsSync(join(DOCS, src))) return tag;
    const [w, h] = size(join(DOCS, src));
    let attrs = ` width="${w}" height="${h}"`;
    if (/-(en|ko|ja)\.png$/.test(src)) {
      const per = LANGS.map(l => [l, join(DOCS, src.replace(/-(en|ko|ja)\.png$/, `-${l}.png`))])
        .filter(([, f]) => existsSync(f))
        .map(([l, f]) => [l, size(f).join('x')]);
      if (new Set(per.map(p => p[1])).size > 1) attrs += per.map(([l, s]) => ` data-size-${l}="${s}"`).join('');
    }
    return tag.replace(/\s(width|height|data-size-(en|ko|ja))="[^"]*"/g, '').replace(/^<img/, '<img' + attrs);
  });
  if (next !== html) writeFileSync(PAGE, next);
  return next !== html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(siteSizes() ? 'docs/index.html: image sizes updated' : 'docs/index.html: image sizes already current');
