/*
 * R3-14 — the SDK repo trust root (SDK_PACKAGING_SPEC §5.2.1 / SP2-2). The
 * release scripts assemble per-version `integrity.json` manifests into the REPO
 * (independent of the gh-pages serving origin), so site-main can ingest pins from
 * git-at-tag. These exercise the script CLIs (the same way the workflow does) over
 * a temp repo root, asserting the trust-root layout + idempotency, plus the pure
 * version-range helpers.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const repo = join(__dirname, '..');
// `stdio` is explicit because `execFileSync` ECHOES the child's stderr to the parent
// by default while also capturing it. The immutability guard below deliberately writes
// `::error::…` — a GitHub Actions workflow command — on its rejection path, so the echo
// put that string into jest's output, and Actions scraped it into a run-level FAILURE
// annotation on a fully green run (seen on the 0.45.0 release). A passing negative-path
// test must not be able to make CI look red: capture stderr (these tests assert on it),
// never re-emit it.
const runNode = (script: string, args: string[]) =>
  execFileSync('node', [join(repo, 'scripts', script), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const writeManifest = (pubDir: string, version: string, body: object) => {
  const f = join(pubDir, 'v', version, 'integrity.json');
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(body) + '\n');
};

describe('sync-repo-integrity (SDK repo trust root, SP2-2)', () => {
  let pubDir: string;
  let repoRoot: string;

  beforeEach(() => {
    pubDir = mkdtempSync(join(tmpdir(), 'ir-pub-'));
    repoRoot = mkdtempSync(join(tmpdir(), 'ir-repo-'));
  });
  afterEach(() => {
    rmSync(pubDir, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('copies each version manifest into integrity/v<version>/integrity.json', () => {
    writeManifest(pubDir, '0.8.0', { version: '0.8.0', algorithm: 'sha384', files: {} });
    writeManifest(pubDir, '0.2.8', { version: '0.2.8', algorithm: 'sha384', files: {} });

    const out = runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);

    for (const v of ['0.8.0', '0.2.8']) {
      const dest = join(repoRoot, 'integrity', `v${v}`, 'integrity.json');
      expect(existsSync(dest)).toBe(true);
      expect(JSON.parse(readFileSync(dest, 'utf8')).version).toBe(v);
    }
    expect(out).toMatch(/CHANGED_VERSIONS=0\.2\.8,0\.8\.0/);
  });

  it('is idempotent — a second run reports no changes (immutable version dirs)', () => {
    writeManifest(pubDir, '0.8.0', { version: '0.8.0', files: {} });
    runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);
    const out = runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);
    expect(out).toMatch(/CHANGED_VERSIONS=\s*$/m);
    expect(out).toMatch(/already up to date/i);
  });

  it('REJECTS a published version whose manifest bytes changed (immutability guard)', () => {
    // A version is committed (= released + tagged). Its artifact is immutable.
    writeManifest(pubDir, '0.8.0', { version: '0.8.0', files: { a: 'sha384-AAA' } });
    runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);

    // Now the published bytes change WITHOUT a version bump — the exact divergence
    // that broke prod (R3-19/R3-21 mutating 0.8.0). The guard must fail, not follow.
    writeManifest(pubDir, '0.8.0', { version: '0.8.0', files: { a: 'sha384-BBB' } });
    let err: { status?: number; stderr?: string } | undefined;
    try {
      runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);
    } catch (e) {
      err = e as { status?: number; stderr?: string };
    }
    expect(err).toBeDefined();
    expect(err!.status).toBe(1);
    expect(String(err!.stderr)).toMatch(/Immutability violation.*0\.8\.0/);
    expect(String(err!.stderr)).toMatch(/Bump the package version/);

    // The committed trust root is left UNTOUCHED — no partial mutation.
    const dest = join(repoRoot, 'integrity', 'v0.8.0', 'integrity.json');
    expect(JSON.parse(readFileSync(dest, 'utf8')).files.a).toBe('sha384-AAA');
  });

  it('still writes a NEW (never-published) version freely alongside an unchanged one', () => {
    writeManifest(pubDir, '0.8.0', { version: '0.8.0', files: { a: 'sha384-AAA' } });
    runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);
    // Bump: 0.8.1 is new; 0.8.0 is present+identical (no-op, not a violation).
    writeManifest(pubDir, '0.8.1', { version: '0.8.1', files: { a: 'sha384-BBB' } });
    const out = runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);
    expect(out).toMatch(/CHANGED_VERSIONS=0\.8\.1/);
    expect(existsSync(join(repoRoot, 'integrity', 'v0.8.1', 'integrity.json'))).toBe(true);
  });
});

describe('backfill-all version range (SP2-2 floor..current)', () => {
  // Run under native Node ESM (a subprocess) — the script is .mjs and ts-jest's
  // CommonJS transform can't import it directly.
  const evalNode = (expr: string) => execFileSync('node', ['-e', expr], { encoding: 'utf8' }).trim();

  it('keeps only versions >= floor, sorted, numeric-aware', () => {
    const script = join(repo, 'scripts', 'backfill-all-integrity.mjs').replace(/\\/g, '/');
    const out = evalNode(
      `import('${script}').then((m) => {` +
        `console.log(JSON.stringify(m.versionsAtOrAbove(['0.2.7','0.2.8','0.3.0','0.10.0','0.8.0'],'0.2.8')));` +
        `console.log(m.compareSemver('0.10.0','0.8.0') > 0);` +
        `})`,
    );
    const [range, cmp] = out.split('\n');
    expect(JSON.parse(range)).toEqual(['0.2.8', '0.3.0', '0.8.0', '0.10.0']);
    expect(cmp).toBe('true');
  });

  // Regression: a non-string/malformed element must never reach compareSemver
  // (`a.split is not a function` crashed a publish). versionsAtOrAbove filters
  // to string, semver-shaped entries first.
  it('drops non-string / non-semver entries defensively', () => {
    const script = join(repo, 'scripts', 'backfill-all-integrity.mjs').replace(/\\/g, '/');
    const out = evalNode(
      `import('${script}').then((m) => {` +
        `console.log(JSON.stringify(m.versionsAtOrAbove(['0.2.8', 42, null, {x:1}, 'latest', '0.3.0'], '0.2.8')));` +
        `})`,
    );
    expect(JSON.parse(out.trim())).toEqual(['0.2.8', '0.3.0']);
  });

  // Regression: `npm view versions --json` has three shapes across npm versions;
  // the OBJECT-keyed-by-package shape crashed the 0.29.0 publish (it was wrapped
  // into `[{…}]`). normalizeNpmVersions must flatten all three to string[].
  it('normalizes every npm `versions --json` output shape', () => {
    const script = join(repo, 'scripts', 'backfill-all-integrity.mjs').replace(/\\/g, '/');
    const out = evalNode(
      `import('${script}').then((m) => {` +
        `console.log(JSON.stringify(m.normalizeNpmVersions(['0.1.0','0.2.0'])));` + // plain array
        `console.log(JSON.stringify(m.normalizeNpmVersions('0.1.0')));` + // single string
        `console.log(JSON.stringify(m.normalizeNpmVersions({'@immediately-run/sdk':['0.1.0','0.29.0']})));` + // object-keyed
        `})`,
    );
    const [arr, str, obj] = out.split('\n');
    expect(JSON.parse(arr)).toEqual(['0.1.0', '0.2.0']);
    expect(JSON.parse(str)).toEqual(['0.1.0']);
    expect(JSON.parse(obj)).toEqual(['0.1.0', '0.29.0']);
  });
});
