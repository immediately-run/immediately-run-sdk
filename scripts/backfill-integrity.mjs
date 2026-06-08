#!/usr/bin/env node
/*
 * Backfill `integrity.json` for an ALREADY-PUBLISHED self-hosted SDK version
 * (SDK_PACKAGING_SPEC §5.2). Versions published before integrity generation
 * existed (e.g. the 0.2.8 floor) have files on the gh-pages origin but no
 * integrity manifest; this script fetches the version's manifest.json + every
 * fetchable file from the LIVE origin, hashes the bytes as served, and writes
 * `<out>/v/<version>/integrity.json` for inclusion in the next gh-pages
 * publish (keep_files preserves the rest of the version dir).
 *
 * Trust note (deliberate, documented): a backfilled manifest attests "what the
 * origin serves at backfill time" — trust-on-first-use, weaker than the
 * build-time hashes `build-selfhost.mjs` now emits for new versions. That is
 * acceptable for the floor: rebuilding an old tag cannot guarantee
 * byte-identity either (toolchain drift), and TOFU still converts any FUTURE
 * tampering of the origin into a detectable mismatch.
 *
 * Usage: node scripts/backfill-integrity.mjs <version> [<outDir>] [--force]
 *   <outDir> default: ./selfhost   (same layout as build-selfhost.mjs)
 *   --force: regenerate even if the live origin already serves integrity.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const ORIGIN = 'https://immediately-run.github.io/immediately-run-sdk';

const args = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');
const version = args[0];
if (!version) {
  console.error('usage: backfill-integrity.mjs <version> [<outDir>] [--force]');
  process.exit(1);
}
const outBase = args[1] ?? 'selfhost';
const base = `${ORIGIN}/v/${version}`;

const fetchBytes = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

// Idempotent: if the origin already serves integrity.json for this version,
// there is nothing to backfill (a published version dir is immutable).
const existing = await fetch(`${base}/integrity.json`);
if (existing.ok && !force) {
  console.log(`v/${version}/integrity.json already published — nothing to do.`);
  process.exit(0);
}

const manifestBytes = await fetchBytes(`${base}/manifest.json`);
const { files } = JSON.parse(manifestBytes.toString('utf8'));

const sha384 = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;
const integrityFiles = {};
for (const rel of files) {
  integrityFiles[rel] = sha384(await fetchBytes(`${base}/${rel}`));
}
integrityFiles['manifest.json'] = sha384(manifestBytes);

const target = join(outBase, 'v', version, 'integrity.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  JSON.stringify(
    {
      schemaVersion: 1,
      name: '@immediately-run/sdk',
      version,
      algorithm: 'sha384',
      files: integrityFiles,
      // Provenance marker: hashes attest the origin's bytes at backfill time
      // (TOFU), not a from-source build. New versions get build-time hashes.
      backfilledAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(`Backfilled ${target} (${Object.keys(integrityFiles).length} files, TOFU from live origin).`);
