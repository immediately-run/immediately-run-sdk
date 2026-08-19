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
 * R3-286 — THE ORDER OF PREFERENCE IS LOAD-BEARING. For a version the repo trust
 * root already pins (`integrity/v<version>/`), that committed manifest is the
 * answer: it is the SP2-2 record, deliberately independent of the origin it
 * verifies, so the origin must not get a vote on its contents. Only a version the
 * trust root does NOT know is resolved from the origin, and then:
 *   200            → carry the published manifest verbatim
 *   404            → TOFU (a genuinely un-manifested old version — the floor case)
 *   anything else  → THROW, after retries
 * A transient 429/503 used to be indistinguishable from a 404 here, and the
 * fallback was not a retry but a *different, weaker derivation* whose output
 * carries `backfilledAt: <now>` — so its bytes can never match what was committed,
 * and the immutability guard then fails the release with advice ("bump the
 * version") that has nothing to do with the actual fault. One blip on one old
 * version blocked SDK 0.45.1.
 *
 * Importable: `backfillVersion(version, outBase, { force, repoRoot, origin })` is
 * reused by `backfill-all-integrity.mjs`. Run directly it is the single-version CLI:
 *   node scripts/backfill-integrity.mjs <version> [<outDir>] [--force] [--origin <url>]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://immediately-run.github.io/immediately-run-sdk';

/**
 * Thrown when the ORIGIN serves a manifest for a version that differs from the one
 * the repo trust root pins. This is a statement about the origin, not about this
 * build — deliberately a different error from `sync-repo-integrity`'s immutability
 * violation, whose remedy ("bump the package version") would be nonsense here. The
 * trust root is the authority; the origin has drifted from it, and someone must
 * find out why before a deploy silently overwrites the evidence.
 */
export class OriginDivergence extends Error {
  constructor(version, url) {
    super(
      `Origin divergence: ${url} serves bytes that differ from the trust root ` +
        `(integrity/v${version}/integrity.json). The trust root is authoritative and was used. ` +
        `This is NOT a build mutation — investigate the origin before deploying, since the ` +
        `deploy would overwrite the diverged bytes.`,
    );
    this.name = 'OriginDivergence';
    this.version = version;
  }
}

/** The repo root (this file lives in `<root>/scripts/`). */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the SP2-2 trust root keeps a version's committed manifest. */
export const trustRootManifestPath = (version, repoRoot = REPO_ROOT) =>
  join(repoRoot, 'integrity', `v${version}`, 'integrity.json');

const sha384 = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Probe a URL, retrying anything that is not a definitive answer. A **404 is
 * definitive** (the resource is absent) and returns immediately; a 2xx is
 * definitive and returns immediately. Everything else — 429, 5xx, a network
 * throw — is *undetermined*, and undetermined is not the same as absent, which
 * is the whole of R3-286. After the last attempt the caller decides; this only
 * guarantees it is told the truth about what happened.
 */
export const probeWithRetry = async (url, { attempts = 4, baseDelayMs = 500, fetchImpl = fetch } = {}) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url);
      if (res.ok || res.status === 404) return { res };
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i);
  }
  return { error: lastError };
};

const fetchBytes = async (url, fetchImpl = fetch) => {
  const res = await fetchImpl(url);
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
export const backfillVersion = async (
  version,
  outBase,
  { force = false, repoRoot = REPO_ROOT, origin = ORIGIN, fetchImpl = fetch, attempts } = {},
) => {
  const target = join(outBase, 'v', version, 'integrity.json');
  if (existsSync(target) && !force) return 'skipped';
  const base = `${origin}/v/${version}`;
  const write = (bytes) => {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  };

  // 1. The trust root wins. A version already pinned in `integrity/v<version>/` is
  //    answered from the REPO — the origin cannot influence bytes that exist to
  //    verify that origin (SP2-2), and no origin behaviour, healthy or otherwise,
  //    can make a released version's manifest change.
  const pinned = trustRootManifestPath(version, repoRoot);
  if (existsSync(pinned)) {
    const committed = readFileSync(pinned);
    write(committed);
    // A 200 serving DIFFERENT bytes is a real divergence between the origin and
    // the trust root — distinct from "the build mutated a released version", and
    // reported as such. Undetermined (429/5xx/network) is NOT divergence: the
    // trust-root copy is already written, so a blip changes nothing.
    const probe = await probeWithRetry(`${base}/integrity.json`, { fetchImpl, ...(attempts ? { attempts } : {}) });
    if (probe.res?.ok) {
      const served = Buffer.from(await probe.res.arrayBuffer());
      if (!served.equals(committed)) {
        throw new OriginDivergence(version, `${base}/integrity.json`);
      }
    }
    return 'trust-root';
  }

  // 2. Not pinned yet → resolve from the origin, but only on a DEFINITIVE answer.
  const probe = await probeWithRetry(`${base}/integrity.json`, { fetchImpl, ...(attempts ? { attempts } : {}) });
  if (!probe.res) {
    throw new Error(
      `could not determine whether v${version} has a published integrity manifest ` +
        `(${probe.error?.message ?? 'unknown error'} from ${base}/integrity.json, after retries). ` +
        `Refusing to re-derive it: an undetermined probe is NOT an absent manifest, and the ` +
        `fallback would write different bytes for an already-published version (R3-286).`,
    );
  }
  if (probe.res.ok) {
    // The origin already published this version's manifest — carry it verbatim
    // (it may hold the stronger build-time hashes).
    write(Buffer.from(await probe.res.arrayBuffer()));
    return 'written';
  }

  // 3. A definitive 404 → TOFU: hash the served bytes.
  const manifestBytes = await fetchBytes(`${base}/manifest.json`, fetchImpl);
  const { files } = JSON.parse(manifestBytes.toString('utf8'));
  const integrityFiles = {};
  for (const rel of files) integrityFiles[rel] = sha384(await fetchBytes(`${base}/${rel}`, fetchImpl));
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
  // `--origin`/`--repo-root` exist so the tests can drive this against a local stub
  // origin and a temp trust root; CI passes neither. They only move where bytes are
  // READ from — everything written still goes through the immutability guard.
  const flagValue = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const origin = flagValue('--origin');
  const repoRoot = flagValue('--repo-root');
  const attempts = flagValue('--attempts');
  const flagged = new Set(['--force', '--origin', origin, '--repo-root', repoRoot, '--attempts', attempts]);
  const positional = argv.filter((a) => !flagged.has(a));
  const version = positional[0];
  if (!version) {
    console.error(
      'usage: backfill-integrity.mjs <version> [<outDir>] [--force] [--origin <url>] [--repo-root <dir>] [--attempts <n>]',
    );
    process.exit(1);
  }
  const outBase = positional[1] ?? 'selfhost';
  const result = await backfillVersion(version, outBase, {
    force,
    ...(origin ? { origin } : {}),
    ...(repoRoot ? { repoRoot } : {}),
    ...(attempts ? { attempts: Number(attempts) } : {}),
  });
  console.log(
    result === 'skipped'
      ? `v/${version}/integrity.json already present — nothing to do.`
      : result === 'trust-root'
        ? `Carried v/${version}/integrity.json from the repo trust root.`
        : `Backfilled ${join(outBase, 'v', version, 'integrity.json')}.`,
  );
}
