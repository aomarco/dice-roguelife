// Builds, checks, tests and packages a release.
//
//   npm ci                                once per checkout: the pinned esbuild, ESLint, Prettier and Playwright
//   node tools/release.js 2.2.0           set the version (package.json), build, check, run every test, package
//   node tools/release.js 2.2.0 --fast    the same without the test suite
//   node tools/release.js --check         bundle and check the current source (syntax, lint, format, swallowed code)
//   node tools/release.js --mark-prompt   record prompts.json as the prompt now live in the DB
//                                         (and refresh that record inside the package in OUT_DIR)
//
// Output goes to ./dist unless OUT_DIR is set: the page dice-roguelife.html, the handoff zip, and livedb/ when the
// prompt changed. npm run release / lint run the same commands. Publishing the page and writing config/prompt are
// done with the Artifact tool afterwards (RELEASING.md).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Script } from 'node:vm';
import { unzipSync, zipSync } from 'fflate';
import { PAGE, ROOT, build, writePage } from './build.js';
import { scanFiles } from './comment-scan.js';
import { check as checkI18n } from './i18n-check.js';

const OUT = process.env.OUT_DIR || join(ROOT, 'dist');
const RELEASED = join(ROOT, 'tools', '.released_prompt.json');
const MARK = 'tools/.released_prompt.json'; // its path inside the package
const LINTED = ['src/js', 'tools', 'tests', 'standalone']; // what ESLint and the comment scan read
const FORMATTED = ['src', 'tools', 'tests', 'standalone', 'eslint.config.js', 'playwright.config.js']; // what Prettier keeps in shape
const NOT_PACKAGED = new Set(['.git', 'node_modules', 'dist', 'data', 'shots', 'test-results', 'playwright-report']); // data: local image libraries, never shipped
const USAGE = 'usage: node tools/release.js <x.y.z> [--fast] | --check | --mark-prompt';

const at = (...parts) => join(ROOT, ...parts);
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const rel = path => relative(ROOT, path).split(sep).join('/');

function die(msg) {
  console.log('STOP:', msg);
  process.exit(1);
}

// every .js file under the given folders, sorted
function jsFiles(dirs) {
  return dirs
    .flatMap(d => readdirSync(at(d), { recursive: true }).map(f => at(d, String(f))))
    .filter(f => f.endsWith('.js'))
    .sort();
}

// the devDependency `name` must be installed at the version package.json pins; anything else stops the release
function pinned(name) {
  const want = readJson(at('package.json')).devDependencies[name];
  const pkg = at('node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(pkg)) die(`${name} is not installed: run \`npm ci\` in ${ROOT}`);
  const have = readJson(pkg).version;
  if (have !== want) die(`${name} ${have} is installed but package.json pins ${want}: run \`npm ci\``);
}

async function lint() {
  pinned('eslint');
  const { ESLint } = await import('eslint'); // after the pin check, so a missing install gets its message
  const eslint = new ESLint({ cwd: ROOT });
  const files = jsFiles(LINTED);
  // a config that no longer matches a folder still "passes" with zero rules, so confirm the rules reach every file
  for (const f of files) {
    const level = ((await eslint.calculateConfigForFile(f))?.rules?.['no-undef'] || [0])[0];
    if (level !== 2 && level !== 'error') die(`eslint.config.js does not apply its rules to ${rel(f)}`);
  }
  const results = await eslint.lintFiles(LINTED);
  const linted = new Set(results.map(r => r.filePath));
  const missing = files.filter(f => !linted.has(f));
  if (missing.length) die('ESLint skipped ' + missing.map(rel).join(', '));
  let errors = 0;
  for (const r of results)
    for (const m of r.messages) {
      if (!m.ruleId && !m.fatal) die(`ESLint did not lint ${rel(r.filePath)}: ${m.message}`);
      errors += m.severity === 2;
      const level = m.severity === 2 ? 'Error' : 'Warning';
      console.log(
        `  lint: ${rel(r.filePath)}:${m.line || 0}:${m.column || 0}: ${m.message} [${level}/${m.ruleId || 'parse'}]`,
      );
    }
  if (errors) die(`${errors} lint error(s)`);
}

function checkFormat() {
  pinned('prettier');
  const r = spawnSync(
    process.execPath,
    [at('node_modules', 'prettier', 'bin', 'prettier.cjs'), '--check', ...FORMATTED],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  if (r.status === 1) die('not formatted (run `npm run format`):\n' + (r.stdout + r.stderr).trim().slice(-1200));
  if (r.status !== 0) die(`Prettier did not run (exit ${r.status})\n` + (r.stderr || r.stdout || '').slice(-800));
}

// syntax of the bundled script, then lint, format, and code swallowed by a line comment
async function check(js) {
  pinned('esbuild'); // the bundle came from the pinned esbuild
  try {
    new Script(js, { filename: 'bundle.js' });
  } catch (e) {
    die('syntax error in the bundle\n' + e.message);
  }
  await lint();
  checkFormat();
  // a '//' comment that swallowed code on its line passes syntax and lint, so look for it
  const hits = scanFiles(jsFiles(LINTED));
  if (hits.length) die('code inside a line comment\n  ' + hits.join('\n  '));
  if (!checkI18n()) die('translation check failed (node tools/i18n-check.js --list)');
}

function runTests(page) {
  pinned('@playwright/test');
  const cli = at('node_modules', '@playwright', 'test', 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'test'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, DR_URL: pathToFileURL(page).href },
  });
  if (r.status !== 0) die('tests failed');
}

// the handoff zip: the whole source tree without installs, builds, screenshots and test reports
function makePackage(ver) {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (/^dice-roguelife-handoff-v.*\.zip$/.test(f)) rmSync(join(OUT, f));
  const files = {};
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!NOT_PACKAGED.has(e.name)) walk(full);
      } else if (!/\.(png|zip)$/.test(e.name)) files[rel(full)] = readFileSync(full);
    }
  };
  walk(ROOT);
  const zp = join(OUT, `dice-roguelife-handoff-v${ver.replaceAll('.', '_')}.zip`);
  writeFileSync(zp, zipSync(files, { level: 6 }));
  return zp;
}

// swap the live-prompt record inside an existing package, leaving every other file as it was built
function refreshMark(zp) {
  const files = unzipSync(readFileSync(zp));
  files[MARK] = readFileSync(RELEASED);
  writeFileSync(zp, zipSync(files, { level: 6 }));
}

function markPrompt() {
  copyFileSync(at('prompts.json'), RELEASED);
  console.log('prompts.json recorded as live');
  // packaged before the DB write, so its record is stale
  const zips = existsSync(OUT) ? readdirSync(OUT).filter(f => /^dice-roguelife-handoff-v.*\.zip$/.test(f)) : [];
  for (const z of zips) {
    refreshMark(join(OUT, z));
    console.log('record refreshed in', join(OUT, z));
  }
  if (!zips.length) console.log(`(no package in ${OUT} to refresh: use the same OUT_DIR as the release)`);
}

// package.json is the one place the version lives; package-lock.json mirrors it
function setVersion(ver) {
  for (const name of ['package.json', 'package-lock.json']) {
    const d = readJson(at(name));
    d.version = ver;
    if (name === 'package-lock.json') d.packages[''].version = ver;
    writeFileSync(at(name), JSON.stringify(d, null, 2) + '\n', 'utf8');
  }
}

async function release(ver, fast) {
  const { html, js } = await build(ver);
  console.log('1. built, version', ver);
  await check(js);
  console.log('2. syntax, lint and format ok');
  setVersion(ver);
  const page = writePage(html);
  if (fast) console.log('3. tests skipped (--fast)');
  else {
    runTests(page);
    console.log('3. all tests passed');
  }
  const outPage = join(OUT, 'dice-roguelife.html');
  mkdirSync(OUT, { recursive: true });
  if (outPage !== PAGE) copyFileSync(page, outPage);
  console.log('4. page ->', outPage, '| package ->', makePackage(ver));
  const live = existsSync(RELEASED) ? readJson(RELEASED) : null;
  if (isDeepStrictEqual(live, readJson(at('prompts.json')))) {
    console.log('5. prompt unchanged since the last release');
    return;
  }
  mkdirSync(join(OUT, 'livedb'), { recursive: true });
  const dst = join(OUT, 'livedb', 'prompt_release.json');
  copyFileSync(at('prompts.json'), dst);
  const env = process.env.OUT_DIR ? `OUT_DIR=${process.env.OUT_DIR} ` : '';
  console.log(`5. PROMPT CHANGED: write config/prompt from ${dst} then run: ${env}node tools/release.js --mark-prompt`);
}

const argv = process.argv.slice(2);
if (argv.includes('--mark-prompt')) markPrompt();
else if (argv.includes('--check')) {
  await check((await build()).js);
  console.log('syntax, lint and format ok');
} else if (/^\d+\.\d+\.\d+$/.test(argv[0] || '')) await release(argv[0], argv.includes('--fast'));
else die(USAGE);
