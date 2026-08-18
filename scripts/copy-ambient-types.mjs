#!/usr/bin/env node
/*
 * Ship `src/ambient.d.ts` as `dist/ambient.d.ts` (R3-276).
 *
 * It is a declaration file, not a source file, so it is excluded from tsup's entry
 * globs — tsup would emit `ambient.d.cjs` / `ambient.d.d.cts`, names that are
 * neither loadable nor referenceable. It is copied verbatim instead, which also
 * keeps it readable: an app author who follows the `/// <reference types=…>` into
 * the package finds the prose about the host's mount-before-boot obligation, not a
 * generated restatement of it.
 *
 * The relative `./sandboxTypes` import resolves in dist for the same reason every
 * other emitted `.d.ts` does: the tree shape is preserved (`bundle: false`).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src/ambient.d.ts');
const out = join(root, 'dist/ambient.d.ts');

if (!existsSync(src)) {
  console.error(`error: ${src} missing — the ambient declarations are part of the public surface.`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
copyFileSync(src, out);
console.log('✓ Copied src/ambient.d.ts → dist/ambient.d.ts');
