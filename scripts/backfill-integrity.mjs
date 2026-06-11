#!/usr/bin/env node
/*
 * Backfill `integrity.json` for an ALREADY-PUBLISHED self-hosted SDK version
 * (SDK_PACKAGING_SPEC §5.2). Versions published before integrity generation
 * existed (e.g. the 0.2.8 floor) have files on the gh-pages origin but no
 * integrity manifest; this fetches the version's manifest.json + every
 * fetchable file from the LIVE origin, hashes the bytes as served, and writes
 * `<out>/v/<version>/integrity.json` for inclusion in the next gh-pages
 * publish (keep_files preserves the rest of the version dir) and the repo
 * trust-root sync (sync-repo-integrity.mjs).
 *
 * Trust note (deliberate, documented): a backfilled manifest attests "what the
 * origin serves at backfill time" — trust-on-first-use, weaker than the
 * build-time hashes `build-selfhost.mjs` emits for new versions. That is
 * acceptable for the floor: rebuilding an old tag cannot guarantee
 * byte-identity either (toolchain drift), and TOFU still converts any FUTURE
 * tampering of the origin into a detectable mismatch.
 *
 * Importable: `backfillVersion(version, outBase, { force })` is reused by
 * `backfill-all-integrity.mjs`. Run directly it is the single-version CLI:
 *   node scripts/backfill-integrity.mjs <version> [<outDir>] [--force]
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://immediately-run.github.io/immediately-run-sdk';

const sha384 = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;

const fetchBytes = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

/**
 * Backfill one version's integrity.json into `<outBase>/v/<version>/`.
 * Idempotent: returns `'skipped'` when the local target already exists (a
 * published version dir is immutable) unless `force`; otherwise `'written'`.
 * When the origin already serves an integrity.json, that manifest is persisted
 * verbatim (build-time hashes preferred over a re-hash) rather than recomputed.
 */
export const backfillVersion = async (version, outBase, { force = false } = {}) => {
  const target = join(outBase, 'v', version, 'integrity.json');
  if (existsSync(target) && !force) return 'skipped';
  const base = `${ORIGIN}/v/${version}`;

  const existing = await fetch(`${base}/integrity.json`);
  if (existing.ok) {
    // The origin already published this version's manifest — carry it verbatim
    // (it may hold the stronger build-time hashes).
    const bytes = Buffer.from(await existing.arrayBuffer());
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return 'written';
  }

  // No manifest on the origin → TOFU: hash the served bytes.
  const manifestBytes = await fetchBytes(`${base}/manifest.json`);
  const { files } = JSON.parse(manifestBytes.toString('utf8'));
  const integrityFiles = {};
  for (const rel of files) integrityFiles[rel] = sha384(await fetchBytes(`${base}/${rel}`));
  integrityFiles['manifest.json'] = sha384(manifestBytes);

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
  return 'written';
};

// --- CLI ---------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const positional = argv.filter((a) => a !== '--force');
  const version = positional[0];
  if (!version) {
    console.error('usage: backfill-integrity.mjs <version> [<outDir>] [--force]');
    process.exit(1);
  }
  const outBase = positional[1] ?? 'selfhost';
  const result = await backfillVersion(version, outBase, { force });
  console.log(
    result === 'skipped'
      ? `v/${version}/integrity.json already present — nothing to do.`
      : `Backfilled ${join(outBase, 'v', version, 'integrity.json')}.`,
  );
}
