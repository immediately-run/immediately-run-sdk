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
 * committed with identical bytes is left untouched.
 *
 * IMMUTABILITY GUARD: a published version's artifact is immutable — its gh-pages
 * bytes, its git-tag integrity, and its npm tarball must never change once the
 * version is committed here. So if a freshly-built manifest DIFFERS from the one
 * already committed for that version, this FAILS instead of silently following
 * the new bytes. That is the exact divergence that broke prod: code landed on
 * `main` after the `v0.8.0` tag (R3-19, R3-21) without a version bump, the CI
 * rebuilt+republished `v/0.8.0/` from the newer `main`, and the host's git-at-tag
 * pin no longer matched the served bytes → integrity verification failed closed.
 * The guard runs BEFORE the gh-pages deploy step, so a violation also stops the
 * mutated bytes from ever being published. The fix for a real change is always to
 * bump the package version (a new, never-published `v<N>` dir is written freely).
 *
 * Exits 0 on success (prints the set of changed versions so CI can decide whether
 * to commit); exits 1 on an immutability violation.
 *
 * Usage: node scripts/sync-repo-integrity.mjs <pubDir>   (the gh-pages payload)
 */
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Thrown when a freshly-built manifest would overwrite an already-committed one
 *  with different bytes — i.e. a published version's artifact was mutated. */
export class ImmutabilityViolation extends Error {
  constructor(versions) {
    super(
      `Immutability violation: the integrity trust root for already-published ` +
        `version(s) [${versions.join(', ')}] would change. A published SDK version ` +
        `is immutable — its gh-pages bytes, git-tag integrity, and npm tarball must ` +
        `never change once released. Bump the package version instead of re-publishing ` +
        `${versions.length > 1 ? 'these versions' : 'this version'} with different bytes.\n` +
        `\nThis means THIS BUILD produced different bytes for ${
          versions.length > 1 ? 'those versions' : 'that version'
        }. ` +
        `It does NOT mean the serving origin drifted — since R3-286 a version the trust ` +
        `root already pins is carried from the repo, and an origin that disagrees is ` +
        `reported by \`backfill-integrity\` as an OriginDivergence, before this runs. ` +
        `If the version listed here is one you did not touch, look at what regenerated ` +
        `its payload, not at the origin.`,
    );
    this.name = 'ImmutabilityViolation';
    this.versions = versions;
  }
}

/**
 * Plan + apply the sync. Returns the list of versions whose repo manifest was
 * newly created (empty ⇒ nothing to commit). Throws {@link ImmutabilityViolation}
 * if any already-committed manifest would change. Only touches `<repoRoot>/integrity/`,
 * and only after the violation check passes (no partial writes on violation).
 */
export const syncRepoIntegrity = (pubDir, repoRoot = root) => {
  const pubVersionsDir = join(pubDir, 'v');
  if (!existsSync(pubVersionsDir)) return [];
  const versions = readdirSync(pubVersionsDir).filter((v) => existsSync(join(pubVersionsDir, v, 'integrity.json')));
  const srcOf = (v) => readFileSync(join(pubVersionsDir, v, 'integrity.json'));
  const destOf = (v) => join(repoRoot, 'integrity', `v${v}`, 'integrity.json');

  // Pass 1 — detect immutability violations before writing anything. A committed
  // manifest whose bytes would change means a released version was mutated.
  const violations = versions.filter((v) => existsSync(destOf(v)) && !readFileSync(destOf(v)).equals(srcOf(v)));
  if (violations.length) throw new ImmutabilityViolation(violations.sort());

  // Pass 2 — write only never-committed versions (an existing dest is, post-Pass-1,
  // guaranteed byte-identical ⇒ a no-op).
  const changed = [];
  for (const version of versions) {
    if (existsSync(destOf(version))) continue;
    mkdirSync(dirname(destOf(version)), { recursive: true });
    writeFileSync(destOf(version), srcOf(version));
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
  let changed;
  try {
    changed = syncRepoIntegrity(pubDir, process.argv[3] ?? root);
  } catch (err) {
    if (err instanceof ImmutabilityViolation) {
      // `::error::` surfaces it as a red CI annotation; the non-zero exit fails the
      // release job BEFORE the gh-pages deploy, so the mutated bytes never publish.
      console.error(`::error::${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  if (changed.length === 0) {
    console.log('Repo integrity trust root already up to date — nothing to commit.');
  } else {
    console.log(`Synced integrity manifests into the repo for: ${changed.join(', ')}`);
  }
  // Emit a machine-readable line CI can grep to decide whether to commit/tag.
  console.log(`CHANGED_VERSIONS=${changed.join(',')}`);
}
