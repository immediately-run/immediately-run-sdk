#!/usr/bin/env node
/*
 * No NEW `bundler.*` consumers (R3-278, PLATFORM_LAYERING_SPEC §2 target 4).
 *
 * `module.evaluation.module.bundler.*` stops being API: every remaining read lives
 * in the adapter modules below, each now annotated with its deprecation window and
 * its protocol equivalent. This gate makes "remaining" enforceable — a new ambient
 * read anywhere else in src/ fails `verify`, so the window can only ever NARROW.
 *
 * The scan is for `bundler.` member reads off the injected global (the
 * `module.evaluation.module.bundler` shape), inside src/, excluding tests (tests
 * construct fake bundlers by design) and declaration files. The allowlist is the
 * adapter tier itself; deleting an adapter shrinks it.
 *
 * Usage:
 *   node scripts/check-bundler-reads.mjs [--self-test]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The adapter tier: the only files permitted to read the injected bundler.
 *  Each entry names the protocol equivalent that retires it. */
const ADAPTERS = new Map([
  ['src/injectedBundler.ts', '§4 transport metadata paths (event-fill)'],
  ['src/fs.ts', '__sandpackSharedFs discovery global / openFs'],
  ['src/mounts.ts', 'transportMountService (mount-add/remove mirror)'],
  ['src/sandboxUtils.ts', 'hostRuntime discovery-global transport'],
  ['src/hostTransport.ts', 'hostRuntime discovery-global transport'],
  ['src/pushChannel.ts', 'hostRuntime discovery-global transport'],
  ['src/runtime.ts', 'hostRuntime discovery-global transport'],
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(p) && !/\.(test|d)\.(ts|tsx)$/.test(p) ? [p] : [];
  });

/** Member reads off the injected bundler: `bundler.<member>` (covers
 *  `…module?.bundler?.mounts`, `bundler.fs.isFile`, `bundler.messageBus`, and the
 *  optional-chained spellings). */
const BUNDLER_READ = /bundler[?.]+\s*\w/g;

const scan = (files) => {
  const offenders = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split('\\').join('/');
    const src = readFileSync(f, 'utf8')
      // strip comments and strings — the doc comments name `bundler.*` constantly
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g, (m) => m.replace(/[^\n]/g, ' '));
    if (BUNDLER_READ.test(src)) offenders.push(rel);
  }
  return offenders;
};

const run = () => {
  const files = walk(join(ROOT, 'src'));
  const offenders = scan(files).filter((rel) => !ADAPTERS.has(rel));
  if (offenders.length) {
    console.error(
      `error: new \`bundler.*\` consumers outside the adapter tier (R3-278 — the deprecation window only narrows):\n` +
        offenders.map((o) => `  ${o}`).join('\n') +
        `\nUse the protocol equivalents (see src/injectedBundler.ts' module doc); the adapter allowlist is scripts/check-bundler-reads.mjs.`,
    );
    process.exit(1);
  }
  console.log(`OK no bundler.* consumers outside the ${ADAPTERS.size}-file adapter tier (R3-278).`);
};

const selfTest = () => {
  const cases = [
    ['a member read is caught', () => scanText('const x = module?.evaluation?.module?.bundler?.mounts;')],
    ['a doc comment naming bundler.* is NOT caught', () => !scanText('// reads bundler.fs these days\nconst y = 1;')],
    ['a string mentioning bundler.mounts is NOT caught', () => !scanText("const s = 'bundler.mounts';")],
    ['the real src tree is clean outside adapters', () => scan(walk(join(ROOT, 'src'))).every((r) => ADAPTERS.has(r))],
  ];
  const scanText = (code) => {
    const stripped = code
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g, (m) => m.replace(/[^\n]/g, ' '));
    return BUNDLER_READ.test(stripped);
  };
  let failed = 0;
  for (const [name, fn] of cases) {
    const pass = fn();
    console.log(`${pass ? '✓' : '✗'} ${name}`);
    if (!pass) failed++;
  }
  console.log(`\n${cases.length - failed}/${cases.length} self-test cases.`);
  return failed === 0;
};

if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
run();
