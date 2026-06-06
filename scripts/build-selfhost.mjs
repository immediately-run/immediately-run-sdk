#!/usr/bin/env node
/*
 * Build the self-hosted, versioned SDK artifact the sandbox bundler fetches when
 * an app opts `@immediately-run/sdk` into `immediately.run`.`resolveFromRegistry`
 * (SDK_PACKAGING_SPEC §5/§11, Option A). Produces, under
 * `<out>/v/<version>/`, the SAME layout the sandbox's copy-sdk.sh vendors — ESM
 * `.js` (+ `.js.map`, `.d.ts`) preserving directory structure, a minimal
 * package.json, and a manifest.json the bundler reads at boot — so a
 * self-hosted module is byte-for-byte the vendored one, just versioned and
 * served from our gh-pages origin (lag-free, immune to npm→CDN replication).
 *
 * Usage: node scripts/build-selfhost.mjs <outDir>   (default: ./selfhost)
 *
 * Idempotent: a version dir is immutable, so re-running for an already-published
 * version reproduces identical bytes. Publishing uses keep_files so prior
 * versions accumulate.
 */
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(
  await import('node:fs').then((fs) => fs.readFileSync(join(root, 'package.json'), 'utf8')),
);
const version = pkg.version;
const outBase = process.argv[2] ?? join(root, 'selfhost');
const dest = join(outBase, 'v', version);

if (!existsSync(dist)) {
  console.error(`error: ${dist} not found — run 'npm run build' first.`);
  process.exit(1);
}

// Walk dist/, copying the runtime files (matches copy-sdk.sh's set).
const KEEP = /\.(js|js\.map|d\.ts)$/;
const jsFiles = [];
const walk = (dir, rel = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(join(dir, entry.name), childRel);
    } else if (KEEP.test(entry.name)) {
      const target = join(dest, childRel);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(dir, entry.name), target);
      if (entry.name.endsWith('.js')) jsFiles.push(childRel);
    }
  }
};
walk(dist);

// Minimal package.json so the in-sandbox resolver maps the bare specifier to
// the flattened ESM entrypoint (identical to copy-sdk.sh).
writeFileSync(
  join(dest, 'package.json'),
  JSON.stringify(
    { name: '@immediately-run/sdk', main: './index.js', module: './index.js', types: './index.d.ts' },
    null,
    2,
  ) + '\n',
);

// Manifest of fetchable files (.js + package.json), sorted — the same shape the
// bundler's addLocalModules reads. Sourcemaps/.d.ts are copied for debuggability
// but intentionally not listed (the bundler only fetches manifest entries).
writeFileSync(
  join(dest, 'manifest.json'),
  JSON.stringify({ files: [...jsFiles, 'package.json'].sort() }, null, 2) + '\n',
);

console.log(`Built self-hosted SDK ${version} -> ${dest} (${jsFiles.length} js files)`);
