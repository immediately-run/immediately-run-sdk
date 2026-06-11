#!/usr/bin/env node
/*
 * Sync the per-version `integrity.json` manifests from the gh-pages publish dir
 * into the SDK REPO itself (SDK_PACKAGING_SPEC §5.2.1 / SP2-2, decision #6).
 *
 * The trust root for `sdk-integrity.json` must be independent of the gh-pages
 * serving origin it verifies — otherwise an attacker who can swap artifact bytes
 * can swap the hashes in the same write (origin self-attestation). So the SDK
 * release commits the per-version manifests into the repo at
 * `integrity/v<version>/integrity.json` and tags `v<version>`; site-main's build
 * (R3-15) ingests them from git-at-tag, never from the origin.
 *
 * This copies `<pubDir>/v/<V>/integrity.json` → `integrity/v<V>/integrity.json`
 * for every version present in the publish dir. Idempotent: a manifest already
 * committed with identical bytes is left untouched (a published version dir is
 * immutable). Exits 0 always; prints the set of changed versions so CI can decide
 * whether to commit.
 *
 * Usage: node scripts/sync-repo-integrity.mjs <pubDir>   (the gh-pages payload)
 */
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Plan + apply the sync. Returns the list of versions whose repo manifest was
 * created or updated (empty ⇒ nothing to commit). Pure-ish: only touches
 * `<repoRoot>/integrity/`.
 */
export const syncRepoIntegrity = (pubDir, repoRoot = root) => {
  const pubVersionsDir = join(pubDir, 'v');
  if (!existsSync(pubVersionsDir)) return [];
  const changed = [];
  for (const version of readdirSync(pubVersionsDir)) {
    const src = join(pubVersionsDir, version, 'integrity.json');
    if (!existsSync(src)) continue; // a version dir without a manifest yet
    const srcBytes = readFileSync(src);
    const dest = join(repoRoot, 'integrity', `v${version}`, 'integrity.json');
    // Immutable: skip an identical, already-committed manifest.
    if (existsSync(dest) && readFileSync(dest).equals(srcBytes)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, srcBytes);
    changed.push(version);
  }
  return changed.sort();
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const pubDir = process.argv[2];
  if (!pubDir) {
    console.error('usage: sync-repo-integrity.mjs <pubDir> [<repoRoot>]');
    process.exit(1);
  }
  // Optional repoRoot for tests; defaults to this repo. The CI run omits it.
  const changed = syncRepoIntegrity(pubDir, process.argv[3] ?? root);
  if (changed.length === 0) {
    console.log('Repo integrity trust root already up to date — nothing to commit.');
  } else {
    console.log(`Synced integrity manifests into the repo for: ${changed.join(', ')}`);
  }
  // Emit a machine-readable line CI can grep to decide whether to commit/tag.
  console.log(`CHANGED_VERSIONS=${changed.join(',')}`);
}
