#!/usr/bin/env node
// fix-dist-esm-specifiers.mjs — make the published ESM dist importable by node's
// resolver (R3-495).
//
// tsup's 1:1 passthrough (`bundle: false`) preserves the SOURCE's extensionless
// relative specifiers verbatim, and node's ESM resolver — like a native browser
// module graph — requires extensions: `export * from './MDXProvider'` in
// dist/index.js is unresolvable outside a bundler. The subpath-import suite worked
// around this with a resolve hook (R3-421), which masked the defect from exactly
// the consumers the package is published for: the fresh-repo smoke's plain-node
// probe of the installed package failed on it (ERR_MODULE_NOT_FOUND, the red
// 2026-09-16 nightly), and any SSR/CLI/tooling import hits the same wall.
//
// This pass rewrites relative specifiers in dist/**/*.js to the file that exists:
// './x' → './x.js', './dir' → './dir/index.js'. CJS needs nothing (require is
// extension-tolerant), and the exports map handles subpaths — only INTRA-dist
// relative specifiers are touched.
//
// Fail-closed: a relative specifier resolving to NEITHER candidate is a build
// error, never a silent pass-through. Idempotent: already-extensioned specifiers
// are untouched, so a second run is a no-op (asserted by the build itself being
// deterministic).
//
// Known limit, accepted: the rewrite is textual, so a string literal CONTAINING a
// `from './x'`-shaped snippet would be corrupted too. The SDK ships no such string
// today (the jest suite + both e2e suites + the subpath-import suite — now WITHOUT
// its resolve-hook crutch — all run the rewritten dist), and a future one fails
// loudly at import time, not silently.
//
// The `.d.ts` surface keeps tsup's extensionless specifiers (TS resolves them under
// every moduleResolution mode that resolves the package at all); the smoke's defect
// was runtime-only. If a nodenext-typecheck consumer ever appears, extend the walk
// to *.d.ts in the same pass — do not add a second rewriter.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/** Every `.js` file under `dir`, recursively. */
const walkJs = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJs(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
};

// A relative import/export specifier in any of the three syntactic positions:
// `… from './x'`, `import('./x')`, `import './x'`. The specifier body is captured
// without its quotes; anything not starting with '.' is left untouched (bare
// imports resolve through node_modules and are the consumer's problem).
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.[^'"]*)\2/g;

const HAS_EXTENSION = /\.[cm]?js$|\.json$|\.css$/;

export function fixFile(file) {
  const text = readFileSync(file, 'utf8');
  const misses = [];
  const out = text.replace(SPECIFIER, (all, head, quote, spec) => {
    if (HAS_EXTENSION.test(spec)) return all;
    const base = join(dirname(file), spec);
    let fixed = null;
    if (existsSync(`${base}.js`)) fixed = `${spec}.js`;
    else if (existsSync(join(base, 'index.js'))) fixed = `${spec}/index.js`;
    else misses.push(spec);
    return fixed ? `${head}${quote}${fixed}${quote}` : all;
  });
  if (misses.length > 0) {
    throw new Error(
      `${relative(root, file)}: ${misses.length} relative specifier(s) resolve to neither ` +
        `<spec>.js nor <spec>/index.js: ${misses.join(', ')} — the dist is incomplete; ` +
        'do not paper over a missing emit.',
    );
  }
  return { out, changed: out !== text };
}

const isSelfTest = process.argv.includes('--self-test');

if (isSelfTest) {
  // A gate that cannot be shown to fire is not a gate.
  const tmp = join(root, 'node_modules', '.cache', 'fix-dist-esm-specifiers-selftest');
  const { mkdirSync, rmSync, writeFileSync: wf } = await import('node:fs');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'sub'), { recursive: true });
  wf(join(tmp, 'sub', 'index.js'), 'export const leaf = 1;\n');
  wf(join(tmp, 'leaf.js'), 'export const x = 1;\n');
  const target = join(tmp, 'main.js');
  wf(
    target,
    [
      `export * from './leaf';`,
      `import { leaf } from './sub';`,
      `import './leaf.js';`,
      `const later = await import('./leaf');`,
      `import { mkdir } from 'node:fs';`,
      `export * as ns from './sub';`,
    ].join('\n') + '\n',
  );
  const { fixFile: fix } = { fixFile };
  const first = fix(target);
  console.assert(first.out.includes(`from './leaf.js'`), 'static export-from gains .js');
  console.assert(first.out.includes(`from './sub/index.js'`), 'directory spec gains /index.js');
  console.assert(first.out.includes(`import './leaf.js'`), 'side-effect import already extensioned stays');
  console.assert(first.out.includes(`import('./leaf.js')`), 'dynamic import gains .js');
  console.assert(first.out.includes(`from 'node:fs'`), 'bare imports untouched');
  console.assert(first.out.includes(`from './sub/index.js'`), 'export-namespace form also fixed');
  // idempotency: the SECOND run over the rewritten content changes nothing
  wf(target, first.out);
  console.assert(fix(target).changed === false, 'a second run is a no-op');
  // fail-closed: a specifier to nothing throws
  wf(join(tmp, 'broken.js'), `import './nowhere';\n`);
  let threw = false;
  try {
    fix(join(tmp, 'broken.js'));
  } catch {
    threw = true;
  }
  console.assert(threw, 'an unresolvable specifier is a build error');
  rmSync(tmp, { recursive: true, force: true });
  console.log('✓ fix-dist-esm-specifiers self-test: 8 assertions');
  process.exit(0);
}

const files = walkJs(dist);
let changed = 0;
for (const file of files) {
  const { out, changed: did } = fixFile(file);
  if (did) {
    writeFileSync(file, out);
    changed += 1;
  }
}
console.log(`fix-dist-esm-specifiers: ${changed}/${files.length} dist .js files rewritten to extensioned specifiers`);
