// Flags line comments whose text looks like code that a '//' swallowed (a call ending in ';', or text ending in ';'
// or '}'). A one-line function with a trailing comment can silently comment out the rest of that line; this catches it.
// usage: node tools/comment-scan.js <file.js>...   exit 0 clean, 1 suspicious comments found, 2 could not run
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as espree from 'espree';

const CALL_RE = /[A-Za-z_$][\w$.]*\([^()]*\)\s*;/;
const END_RE = /[;}]\s*$/;

// "file:line: comment" for every suspicious line comment in the given files
export function scanFiles(files) {
  return files.flatMap(file => {
    const ast = espree.parse(readFileSync(file, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
      comment: true,
      loc: true,
    });
    return ast.comments
      .filter(c => c.type === 'Line' && (CALL_RE.test(c.value.trim()) || END_RE.test(c.value.trim())))
      .map(
        c =>
          `${relative(process.cwd(), file).replace(/\\/g, '/')}:${c.loc.start.line}: ${c.value.trim().slice(0, 140)}`,
      );
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const hits = scanFiles(process.argv.slice(2));
    console.log(hits.length + ' suspicious line comment(s)');
    hits.forEach(h => console.log('  ' + h));
    process.exitCode = hits.length ? 1 : 0;
  } catch (e) {
    console.error('comment-scan: ' + e.message);
    process.exitCode = 2;
  }
}
