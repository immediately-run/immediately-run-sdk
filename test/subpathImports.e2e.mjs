// R3-421 — statically importing EVERY public subpath of the built SDK in a
// hostless realm (plain node: no sandbox, no injected bundler, no
// `__immediatelyRun__` global) must not throw. This is the exit criterion
// "static imports of every SDK subpath render under `vite dev` with no host":
// `sdk/tasks` used to register its TASK_INPUT listener at module evaluation,
// which called the host transport resolver and threw "no host transport" — one
// static `import` of the subpath took the whole app down under plain `vite dev`.
//
// The subpath list is DERIVED from package.json `exports` — the real producer —
// not hand-typed: each non-wildcard entry is resolved directly, and each `*`
// pattern is expanded against the files actually present in dist/. A module tsup
// emits tomorrow is covered the day it lands.
//
// Import mechanics: NONE. Until R3-495, tsup emitted extensionless relative
// specifiers that node's ESM resolver rejects, and this suite carried a resolve
// hook mapping `./x` → `./x.js` — a crutch that made the suite green while the
// PUBLISHED package stayed broken for exactly the plain-node import it claimed
// to prove (the fresh-repo smoke caught it, 2026-09-16). The build now rewrites
// the dist to extensioned specifiers (`scripts/fix-dist-esm-specifiers.mjs`, run
// as the last build step), so this suite imports the dist the way a real
// consumer does — no hook, no translation. If these imports start failing with
// ERR_MODULE_NOT_FOUND on a relative specifier, the fixer regressed: fix the
// build, never this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every `.js` file under `dir`, as paths relative to `dir` (posix separators). */
const walkJs = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out;
};

/**
 * Expand package.json `exports` into the list of importable files (ESM targets).
 * A `*` in the target (`./dist/*.js`) is expanded against dist/ contents — the
 * node resolver lets the pattern match nested paths (`components/Include`), so
 * every emitted module IS a public subpath and every one must import cleanly.
 */
const publicEntryFiles = () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.exports && typeof pkg.exports === 'object', 'package.json has an exports map');
  const files = new Set();
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    const esm = typeof target === 'string' ? target : target.import;
    if (!esm) continue;
    if (esm.includes('*')) {
      const [prefix, suffix] = esm.split('*');
      const dir = join(root, prefix);
      assert.ok(existsSync(dir), `wildcard export "${subpath}" points at an existing dir (${prefix})`);
      for (const rel of walkJs(dir)) {
        if (rel.endsWith(suffix)) files.add(join(dir, rel));
      }
    } else {
      files.add(join(root, esm));
    }
  }
  return [...files].sort();
};

const entries = publicEntryFiles();

test('the exports map expands to a non-trivial set of subpath entries', () => {
  // A refactor that empties the expansion would make the suite below vacuous.
  assert.ok(entries.length >= 50, `expected the SDK's full subpath surface, got ${entries.length}`);
  const rels = entries.map((f) => relative(root, f).split('\\').join('/'));
  for (const mustHave of ['dist/index.js', 'dist/tasks.js', 'dist/launch.js', 'dist/fs.js', 'dist/hooks.js']) {
    assert.ok(rels.includes(mustHave), `${mustHave} is a public entry`);
  }
});

test('no host transport is reachable in this realm (the premise of the suite)', () => {
  assert.equal(globalThis.__immediatelyRun__, undefined);
  assert.equal(globalThis.module?.evaluation, undefined);
});

for (const file of entries) {
  const rel = relative(root, file).split('\\').join('/');
  test(`static import of ${rel} does not throw without a host`, async () => {
    await import(pathToFileURL(file).href);
  });
}
