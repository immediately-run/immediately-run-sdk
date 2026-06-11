#!/usr/bin/env node
/*
 * Backfill `integrity.json` for EVERY published self-hosted SDK version from the
 * floor up to current (SDK_PACKAGING_SPEC §5.2 / SP2-2). The host carries the
 * floor..current range as `sdk-integrity.json`, so the repo trust root must hold
 * a manifest for every version an app may pin — not just the latest. Enumerates
 * the published versions from npm, keeps those >= floor, and backfills each into
 * `<out>/v/<version>/integrity.json` (idempotent — a version already present,
 * whether build-time or previously backfilled, is left untouched).
 *
 * Usage: node scripts/backfill-all-integrity.mjs <floor> [<outDir>]
 *   <outDir> default: ./selfhost
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { backfillVersion } from './backfill-integrity.mjs';

const PKG = '@immediately-run/sdk';

// Compare two `major.minor.patch` strings; returns <0, 0, >0. Pre-release/build
// suffixes aren't used by this package's published versions, so a numeric
// triple compare is sufficient.
export const compareSemver = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

/** Published versions (from npm) at or above `floor`, oldest first. */
export const versionsAtOrAbove = (allVersions, floor) =>
  allVersions.filter((v) => compareSemver(v, floor) >= 0).sort(compareSemver);

const publishedVersions = () => {
  const out = execFileSync('npm', ['view', PKG, 'versions', '--json'], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  // npm returns a bare string for a single-version package, an array otherwise.
  return Array.isArray(parsed) ? parsed : [parsed];
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const floor = process.argv[2];
  if (!floor) {
    console.error('usage: backfill-all-integrity.mjs <floor> [<outDir>]');
    process.exit(1);
  }
  const outBase = process.argv[3] ?? 'selfhost';

  const targets = versionsAtOrAbove(publishedVersions(), floor);
  console.log(
    `Backfilling integrity for ${targets.length} version(s) >= ${floor}: ${targets.join(', ')}`,
  );
  let written = 0;
  for (const version of targets) {
    const result = await backfillVersion(version, outBase);
    if (result === 'written') written++;
    console.log(`  v/${version}: ${result}`);
  }
  console.log(`Done — ${written} written, ${targets.length - written} already present.`);
}
