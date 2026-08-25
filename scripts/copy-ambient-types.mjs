#!/usr/bin/env node
/*
 * Ship `src/ambient.d.ts` (+ its `ambient-fs.d.ts` sibling, R3-276b) as
 * `dist/ambient*.d.ts` (R3-276).
 *
 * They are declaration files, not source files, so they are excluded from tsup's
 * entry globs — tsup would emit `ambient.d.cjs` / `ambient.d.d.cts`, names that
 * are neither loadable nor referenceable. They are copied verbatim instead,
 * which also keeps them readable: an app author who follows the
 * `/// <reference types=…>` into the package finds the prose about the host's
 * mount-before-boot obligation, not a generated restatement of it.
 *
 * The relative `./sandboxTypes` import resolves in dist for the same reason every
 * other emitted `.d.ts` does: the tree shape is preserved (`bundle: false`).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['ambient.d.ts', 'ambient-fs.d.ts'];

for (const name of files) {
  const src = join(root, 'src', name);
  const out = join(root, 'dist', name);

  if (!existsSync(src)) {
    console.error(`error: ${src} missing — the ambient declarations are part of the public surface.`);
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(src, out);
  console.log(`✓ Copied src/${name} → dist/${name}`);
}
