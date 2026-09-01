#!/usr/bin/env node
// check-publish-version.mjs — CHECK 2 of roadmap R3-327: a PR that changes shipped
// bytes must bump `version` in the SAME PR.
//
// THE FAILURE THIS EXISTS FOR. `sdk #111` changed `src/linkSpace.ts` and did not bump
// `version`. The release job on `main` refused, correctly:
//
//     Immutability violation: the integrity trust root for already-published
//     version(s) [0.45.3] would change. A published SDK version is immutable.
//
// The immutability gate is a GOOD gate. Its only flaw is that it runs AFTER merge, so
// the cost lands on `main` and on whoever pushes next — and the release job is
// `if: github.event_name == 'push'`, so a PR never runs it at all. (`sdk #112`'s
// unrelated bump to `0.46.0` is what incidentally cleared it; nobody fixed it
// deliberately, which is its own argument for this check.) The repo's convention was
// explicit — `5b9c79f Release 0.45.1 — bump in the PR that changes shipped bytes` — and
// lived only in a commit message. Prose does not gate merges.
//
// So: same question, moved to PR time.
//
// NPM IS NOT THE AUTHORITY ON "PUBLISHED" — THE TRUST ROOT IS. The gate that actually
// stops `main` is `sync-repo-integrity.mjs`, and it asks a purely in-repo question: does
// `integrity/v<version>/integrity.json` already exist, and would this build's bytes
// differ from it? npm never enters into it. The two answers diverge whenever a release
// writes the trust root, tags, and deploys gh-pages and THEN dies before `npm publish`
// — which is exactly what happened to `0.57.3` (run 33259081097, 2026-08-30, died in
// `prepublishOnly` → `api:check` on the R3-409 api-snapshot drift). `0.57.3` was frozen
// for the release gate and invisible to `npm view`, so an npm-only version of this check
// waved through three consecutive PRs (#146, #147, #148) and `main` went red on every
// push for two days. A check whose notion of "published" is narrower than the gate it
// front-runs will keep doing that.
//
// So this check consults BOTH, and the local sources come first because they are
// decisive and free:
//   1. `integrity/v*/` — the trust root. Same file the release gate reads; always in the
//      checkout; no network.
//   2. `git tag -l 'v*'` — best-effort. Tagging is the other step that goes red on a
//      re-release, but tags are only present when the checkout fetched them, so an empty
//      list here means "not asked", never "not tagged". It can only ADD versions.
//   3. `npm view <pkg> versions` — the registry, and still the only authority for a repo
//      that has no `integrity/` at all.
// A version any of them knows is immutable. `nextVersion` suggests above the union, so
// the suggestion can never point BELOW something already released (npm's list alone
// would have suggested `0.57.2` while gh-pages was serving `0.57.3`).
//
// SCOPED TO WHAT ACTUALLY SHIPS. The trigger is the tarball globs (`files:` in
// package.json) plus the sources they are built from, MINUS tests, docs, CI config and
// tooling. A PR that changes only tests or docs demands no bump — that is asserted by a
// case below, not by inspection.
//
// The `[skip ci]` trust-root commits release CI pushes after a publish are NOT a special
// case and must not be one: they touch `integrity/`, which is not in the tarball scope,
// so they do not match. Do not special-case by author — an author allowlist is a hole
// somebody eventually walks a real change through.
//
// AN UNREACHABLE REGISTRY, OR AN UNKNOWN BASE, IS A THIRD OUTCOME. "not published" and
// "could not tell" are different answers; a check that silently treats the second as the
// first is worse than no check. Both fail in CI, with the reason attached.
//
// Copied, not shared — see check-dependency-pins.mjs for why.
//
// Run: `node scripts/check-publish-version.mjs`
//      `node scripts/check-publish-version.mjs --base <ref>`  (replay against a base)
//      `node scripts/check-publish-version.mjs --self-test`   (prove it can fail)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Paths that never reach the tarball even when they sit under a shipped directory.
 * This list is the whole of exit criterion 3: a PR that changes only tests, docs or CI
 * config must pass.
 */
const NEVER_SHIPPED = [
  /(^|\/)__tests__\//,
  /(^|\/)__fixtures__\//,
  /(^|\/)(test|tests|e2e)\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /^\.github\//,
  /^scripts\//,
  /^docs?\//,
  /^integrity\//,
  /\.md$/,
  /^\.[^/]+$/, // dotfiles at the root (.gitignore, .prettierrc, …)
  /^(package-lock\.json|api-snapshot\.json)$/,
];

/**
 * Directories whose contents reach the published tarball. `files:` names what npm packs
 * (usually the BUILT output); `src/` is where those bytes come from, and it is what a PR
 * actually edits — checking only `files:` would miss every real case, since `dist/` is
 * generated and gitignored.
 */
export function shippedScope(pkg, extra = ['src']) {
  const globs = Array.isArray(pkg.files) ? pkg.files : [];
  return [...new Set([...globs.map((g) => g.replace(/^\.\//, '').replace(/\/?\*+$/, '')), ...extra])].filter(Boolean);
}

/** Does `path` reach the published tarball? */
export function isShipped(path, scope) {
  if (NEVER_SHIPPED.some((re) => re.test(path))) return false;
  return scope.some((dir) => path === dir || path.startsWith(`${dir}/`));
}

/** `[major, minor, patch]`, or `null` for anything that is not a plain release version. */
const parseVersion = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The highest plain release version in `versions`, as a string, or `null`. */
export function highestVersion(versions) {
  const parsed = versions.map(parseVersion).filter(Boolean).sort(compareVersions);
  return parsed.length ? parsed[parsed.length - 1].join('.') : null;
}

/** Next patch above the highest released version, as a concrete suggestion. */
export function nextVersion(versions) {
  const top = highestVersion(versions);
  if (!top) return null;
  const [maj, min, pat] = parseVersion(top);
  return `${maj}.${min}.${pat + 1}`;
}

/**
 * Every version any source says is already out there, and which source said so.
 * `released` is `{ trustRoot: string[], tags: string[] }` (see the header); `registry`
 * contributes only when it answered. Returns `Map<version, string[] sources>`.
 */
export function releasedVersions({ released = {}, registry } = {}) {
  const out = new Map();
  const add = (version, source) => {
    if (!parseVersion(version)) return;
    if (!out.has(version)) out.set(version, []);
    if (!out.get(version).includes(source)) out.get(version).push(source);
  };
  for (const v of released.trustRoot ?? []) add(v, 'the integrity trust root');
  for (const v of released.tags ?? []) add(v, 'a git tag');
  if (registry?.ok) for (const v of registry.versions) add(v, 'npm');
  return out;
}

/**
 * The pure checker. `registry` is:
 *   `{ ok: true, versions: string[] }`
 *   `{ ok: false, kind: 'not-found' }`            — never published; nothing to violate
 *   `{ ok: false, kind: 'undetermined', detail }` — could not tell → FAIL
 * `released` is the LOCAL evidence, `{ trustRoot: string[], tags: string[] }` — decisive
 * where it speaks, and the reason a version can be immutable while `npm view` has never
 * heard of it (see the header: npm is the narrowest of the three sources).
 * `changedFiles` is `null` when the base ref could not be resolved → FAIL.
 */
export function checkPublishVersion({ pkg, changedFiles, registry, released = {} }) {
  const errors = [];
  const notes = [];
  const scope = shippedScope(pkg);

  if (changedFiles === null) {
    errors.push(
      'Could not determine which files this branch changes (no base ref).\n' +
        '   This is not a pass — without a diff the check has no opinion, and a check with no\n' +
        '   opinion must not report success.',
    );
    return { errors, notes, shipped: [] };
  }

  const shipped = changedFiles.filter((f) => isShipped(f, scope));
  if (shipped.length === 0) {
    notes.push(`No shipped bytes changed (scope: ${scope.join(', ')}) — no version bump required.`);
    return { errors, notes, shipped };
  }

  if (!registry) {
    errors.push('Shipped bytes changed but the registry was not consulted — refusing to report success.');
    return { errors, notes, shipped };
  }

  // The union of every source that knows a version, built BEFORE the registry's failure
  // modes are considered — the local sources can answer without it.
  const known = releasedVersions({ released, registry });
  const versions = [...known.keys()];
  const next = nextVersion(versions);
  const fileList =
    `     ${shipped.slice(0, 8).join('\n     ')}` +
    (shipped.length > 8 ? `\n     …and ${shipped.length - 8} more` : '');
  const bumpTo =
    `   Bump \`version\` in package.json IN THIS PR` +
    (next ? ` — \`${next}\` is the next free patch` : '') +
    `,\n   then run \`npm install\` so the lockfile's own version field follows.`;

  // 1. DECISIVE, AND FREE: this exact version is already out. Reported before the
  //    registry's own failure modes, so a flaky `npm view` can never soften a violation
  //    the checkout already proves.
  if (known.has(pkg.version)) {
    errors.push(
      `${pkg.name}@${pkg.version} is ALREADY RELEASED (${known.get(pkg.version).join(', ')}), and this branch\n` +
        `   changes bytes that ship:\n${fileList}\n` +
        `   A released version is immutable — the release job rebuilds \`v${pkg.version}\`, refuses when the\n` +
        `   bytes differ ("Immutability violation…"), and that stops publishing on \`main\` entirely\n` +
        `   until someone bumps.\n${bumpTo}\n` +
        `   Caught here rather than by the release job on \`main\`, which is where this cost\n` +
        `   used to land (R3-327).`,
    );
    return { errors, notes, shipped };
  }

  // 2. Below something already released. Not an immutability violation — the release job
  //    would happily write a fresh `v<N>` dir — but `npm publish` retags `latest` to
  //    whatever it publishes LAST, whether or not that is the highest version, so
  //    consumers on a range would resolve backwards. This is the trap npm's own list
  //    sets: with `0.57.3` frozen but never published, npm suggests `0.57.2` as next free.
  const top = highestVersion(versions);
  if (top && compareVersions(parseVersion(pkg.version) ?? [0, 0, 0], parseVersion(top)) < 0) {
    errors.push(
      `${pkg.name}@${pkg.version} sorts BELOW ${top}, which is already released ` +
        `(${known.get(top).join(', ')}),\n   and this branch changes bytes that ship:\n${fileList}\n` +
        `   Publishing it would move npm's \`latest\` dist-tag backwards — \`npm publish\` retags\n` +
        `   whatever it publishes last, whether or not it is the highest version.\n${bumpTo}`,
    );
    return { errors, notes, shipped };
  }

  // 3. Only now do the registry's own failure modes matter, and only because the local
  //    sources did not settle it. A repo with no `integrity/` (the copies of this script
  //    in other repos) lands here every time — the pre-existing behaviour, unchanged.
  if (!registry.ok) {
    if (registry.kind === 'not-found') {
      notes.push(`${pkg.name} has never been published to npm — nothing to violate there.`);
      if (versions.length) {
        notes.push(`${versions.length} version(s) known locally, and ${pkg.version} is not one of them.`);
      }
      return { errors, notes, shipped };
    }
    // The local sources clearing this version is NOT the registry clearing it: npm can
    // hold a version the trust root never saw (a manual bootstrap publish, or a release
    // predating `integrity/`). Undetermined stays a failure.
    errors.push(
      `Shipped bytes changed and the published version list could NOT be determined ` +
        `(${registry.detail ?? 'registry error'}).\n   This is not a pass. Re-run when the registry is reachable.` +
        (versions.length ? `\n   (The local sources cleared ${pkg.version}; npm is the one that did not answer.)` : ''),
    );
    return { errors, notes, shipped };
  }

  notes.push(`${pkg.name}@${pkg.version} is unreleased on every source consulted — the bump is present.`);
  return { errors, notes, shipped };
}

// ── I/O ──────────────────────────────────────────────────────────────────────

/** The files this branch changes vs its merge base, or `null` if undecidable. */
function changedFilesVsBase() {
  // `--base <ref>` exists so a historical PR can be REPLAYED through this exact code
  // path rather than only through the pure checker — the difference between "the logic
  // is right" and "the plumbing that feeds it is right", which is where a check of this
  // shape usually breaks.
  const flag = process.argv.indexOf('--base');
  const base =
    flag >= 0 && process.argv[flag + 1]
      ? process.argv[flag + 1]
      : process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : 'origin/main';
  const run = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    // `A...B` is the three-dot diff: what B changed since the branches diverged, which
    // is the PR's own contribution and not everything that landed on main meanwhile.
    const out = run(['diff', '--name-only', `${base}...HEAD`]);
    return out.split('\n').filter(Boolean);
  } catch {
    try {
      run(['fetch', '--no-tags', '--depth=50', 'origin', process.env.GITHUB_BASE_REF || 'main']);
      const out = run(['diff', '--name-only', `${base}...HEAD`]);
      return out.split('\n').filter(Boolean);
    } catch {
      return null;
    }
  }
}

/**
 * The versions this CHECKOUT already knows are released — the same question the release
 * job's immutability gate asks, asked at PR time.
 *
 * `integrity/v<V>/integrity.json` is authoritative: `sync-repo-integrity.mjs` reads
 * exactly these paths, so a version with a manifest here is frozen whatever npm says.
 * Tags are additive and best-effort — `actions/checkout` only has them when it fetched
 * them, so an empty list means "not asked", never "nothing tagged", and this must never
 * conclude ABSENCE from it (undetermined is not absent).
 */
export function readReleased(repoRoot = '.') {
  const trustRoot = [];
  const dir = `${repoRoot}/integrity`;
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('v') && existsSync(`${dir}/${entry}/integrity.json`)) trustRoot.push(entry.slice(1));
    }
  }
  let tags = [];
  try {
    tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n')
      .filter(Boolean)
      .map((t) => t.slice(1));
  } catch {
    /* no git, or no tags fetched — additive only, so an empty list costs nothing */
  }
  return { trustRoot, tags };
}

function fetchVersions(name) {
  try {
    const out = execFileSync('npm', ['view', name, 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    const parsed = JSON.parse(out);
    return { ok: true, versions: Array.isArray(parsed) ? parsed : [parsed] };
  } catch (err) {
    const text = `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`;
    if (/E404|is not in this registry|404 Not Found/i.test(text)) return { ok: false, kind: 'not-found' };
    return { ok: false, kind: 'undetermined', detail: text.trim().split('\n')[0]?.slice(0, 160) };
  }
}

// ── self-test: prove the gate can actually fail ──────────────────────────────
if (process.argv.includes('--self-test')) {
  let failures = 0;
  const PKG = { name: '@immediately-run/sdk', version: '0.45.3', files: ['dist'] };
  const PUBLISHED = { ok: true, versions: ['0.45.0', '0.45.1', '0.45.2', '0.45.3'] };
  const fails = (label, got, matcher) => {
    const joined = got.errors.join('\n');
    if (!matcher.test(joined)) {
      console.error(`SELF-TEST FAIL: ${label}\n  got: ${joined || '(no errors)'}`);
      failures++;
    } else console.log(`  ok  ${label}`);
  };
  const passes = (label, got) => {
    if (got.errors.length) {
      console.error(`SELF-TEST FAIL: ${label}\n  got: ${got.errors.join('\n')}`);
      failures++;
    } else console.log(`  ok  ${label}`);
  };

  // 1. THE sdk #111 REPLAY — its exact file list, and the version it actually carried.
  const r111 = checkPublishVersion({
    pkg: PKG,
    changedFiles: ['src/linkSpace.test.ts', 'src/linkSpace.ts'],
    registry: PUBLISHED,
  });
  fails("sdk #111's diff fails check 2", r111, /ALREADY RELEASED/);
  fails('…and names the version to bump to', r111, /`0\.45\.4` is the next free patch/);
  fails('…and names the offending file, not just the fact', r111, /src\/linkSpace\.ts/);

  // 2. exit criterion 3 — tests / docs / CI alone demand NO bump. This is the case that
  //    decides whether the check is livable; asserted, not inspected.
  passes(
    'a tests-only PR passes',
    checkPublishVersion({ pkg: PKG, changedFiles: ['src/linkSpace.test.ts'], registry: PUBLISHED }),
  );
  passes(
    'a docs/CI/tooling-only PR passes',
    checkPublishVersion({
      pkg: PKG,
      changedFiles: ['README.md', '.github/workflows/ci.yml', 'scripts/check-circular.mjs', 'docs/index.html'],
      registry: PUBLISHED,
    }),
  );
  passes(
    'the [skip ci] trust-root commit shape passes — it touches integrity/, not the tarball',
    checkPublishVersion({
      pkg: PKG,
      changedFiles: ['integrity/v0.45.3/integrity.json'],
      registry: PUBLISHED,
    }),
  );

  // 3. the bump present → pass (this is sdk #112, which changed src AND bumped)
  passes(
    'shipped bytes WITH a bump passes',
    checkPublishVersion({
      pkg: { ...PKG, version: '0.46.0' },
      changedFiles: ['src/hostAttention.ts'],
      registry: PUBLISHED,
    }),
  );

  // 4. undetermined answers FAIL — neither is "fine"
  fails(
    'an unreachable registry fails rather than passing',
    checkPublishVersion({
      pkg: PKG,
      changedFiles: ['src/linkSpace.ts'],
      registry: { ok: false, kind: 'undetermined', detail: 'ETIMEDOUT' },
    }),
    /could NOT be determined/,
  );
  fails(
    'an unresolvable base ref fails rather than passing',
    checkPublishVersion({ pkg: PKG, changedFiles: null, registry: PUBLISHED }),
    /no base ref/,
  );

  // 5. a never-published package is not a violation
  passes(
    'a package that has never been published passes',
    checkPublishVersion({
      pkg: { ...PKG, name: '@immediately-run/brand-new' },
      changedFiles: ['src/a.ts'],
      registry: { ok: false, kind: 'not-found' },
    }),
  );

  // 6. the scope follows `files:`, not a hard-coded list — a repo packing `lib/`
  //    must be covered without editing this script.
  fails(
    "the shipped scope follows the package's own `files:` globs",
    checkPublishVersion({
      pkg: { ...PKG, files: ['lib'] },
      changedFiles: ['lib/index.js'],
      registry: PUBLISHED,
    }),
    /ALREADY RELEASED/,
  );

  // 7. THE 0.57.3 REPLAY — the failure that made this section necessary. Run 33259081097
  //    wrote `integrity/v0.57.3/` and tagged, then died in `prepublishOnly`, so npm's
  //    list stops at 0.57.1. An npm-only check calls 0.57.3 free; the release gate calls
  //    it frozen. #146, #147 and #148 all merged through the gap.
  const NPM_0571 = { ok: true, versions: ['0.57.0', '0.57.1'] };
  const r0573 = checkPublishVersion({
    pkg: { ...PKG, version: '0.57.3' },
    changedFiles: ['src/recents.ts', 'src/index.ts'],
    registry: NPM_0571,
    released: { trustRoot: ['0.57.0', '0.57.1', '0.57.3'], tags: ['0.57.0', '0.57.1', '0.57.3'] },
  });
  fails('a version npm has never seen but the trust root pins is a violation', r0573, /ALREADY RELEASED/);
  fails('…and names the trust root as the source, not npm', r0573, /the integrity trust root/);
  fails('…and suggests 0.57.4 — never 0.57.2, which npm alone would have offered', r0573, /`0\.57\.4`/);
  fails(
    'a git tag alone freezes a version (tags are additive; absence proves nothing)',
    checkPublishVersion({
      pkg: { ...PKG, version: '0.57.3' },
      changedFiles: ['src/recents.ts'],
      registry: NPM_0571,
      released: { trustRoot: [], tags: ['0.57.3'] },
    }),
    /ALREADY RELEASED \(a git tag\)/,
  );

  // 8. picking npm's "next free" while a higher version is frozen — legal for the
  //    immutability gate, but it retags `latest` backwards.
  fails(
    'a version BELOW the highest released one fails, even though nothing would be mutated',
    checkPublishVersion({
      pkg: { ...PKG, version: '0.57.2' },
      changedFiles: ['src/recents.ts'],
      registry: NPM_0571,
      released: { trustRoot: ['0.57.3'], tags: [] },
    }),
    /sorts BELOW 0\.57\.3/,
  );

  // 9. the local sources are decisive, so neither registry failure mode may soften them.
  fails(
    'an unreachable registry does not soften a trust-root violation',
    checkPublishVersion({
      pkg: { ...PKG, version: '0.57.3' },
      changedFiles: ['src/recents.ts'],
      registry: { ok: false, kind: 'undetermined', detail: 'ETIMEDOUT' },
      released: { trustRoot: ['0.57.3'], tags: [] },
    }),
    /ALREADY RELEASED/,
  );
  fails(
    'a package npm has never heard of still fails when the trust root pins the version',
    checkPublishVersion({
      pkg: { ...PKG, name: '@immediately-run/brand-new', version: '0.57.3' },
      changedFiles: ['src/recents.ts'],
      registry: { ok: false, kind: 'not-found' },
      released: { trustRoot: ['0.57.3'], tags: [] },
    }),
    /ALREADY RELEASED/,
  );

  // 10. and the npm-only behaviour is unchanged where there is no local evidence — every
  //     case above this point passes no `released` at all, which asserts it; this one
  //     says so explicitly for a repo that has an `integrity/` dir but nothing in it.
  passes(
    'an empty local set leaves the npm-only answer intact',
    checkPublishVersion({
      pkg: { ...PKG, version: '0.46.0' },
      changedFiles: ['src/hostAttention.ts'],
      registry: PUBLISHED,
      released: { trustRoot: [], tags: [] },
    }),
  );

  if (failures) {
    console.error(`\n${failures} self-test case(s) failed.`);
    process.exit(1);
  }
  console.log('19/19 self-test cases.');
  process.exit(0);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const changedFiles = changedFilesVsBase();
// Only ask the registry when something shipped actually changed — a docs-only PR should
// not spend a network round trip, and the ~10s budget is per PR, not per check. The
// local sources are free, so they are always read.
const needsRegistry = changedFiles !== null && changedFiles.some((f) => isShipped(f, shippedScope(pkg)));
const registry = needsRegistry ? fetchVersions(pkg.name) : { ok: true, versions: [] };
const released = readReleased();

const { errors, notes, shipped } = checkPublishVersion({ pkg, changedFiles, registry, released });
for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  console.error('\npublish-version check FAILED:\n');
  for (const e of errors) console.error(` - ${e}\n`);
  process.exit(1);
}
console.log(
  shipped.length === 0
    ? `OK: no shipped bytes changed — ${pkg.name}@${pkg.version} needs no bump.`
    : `OK: ${shipped.length} shipped file(s) changed and ${pkg.name}@${pkg.version} is unreleased ` +
        `(${released.trustRoot.length} trust-root, ${released.tags.length} tag, ` +
        `${registry.ok ? registry.versions.length : 0} npm version(s) consulted) — the bump is present.`,
);
