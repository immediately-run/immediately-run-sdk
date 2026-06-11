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
const runNode = (script: string, args: string[]) =>
  execFileSync('node', [join(repo, 'scripts', script), ...args], { encoding: 'utf8' });

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

  it('re-syncs a version whose manifest bytes changed (tamper/repair)', () => {
    writeManifest(pubDir, '0.8.0', { version: '0.8.0', files: { a: 'sha384-AAA' } });
    runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);
    // The published bytes change (e.g. a corrected hash) → the repo follows.
    writeManifest(pubDir, '0.8.0', { version: '0.8.0', files: { a: 'sha384-BBB' } });
    const out = runNode('sync-repo-integrity.mjs', [pubDir, repoRoot]);
    expect(out).toMatch(/CHANGED_VERSIONS=0\.8\.0/);
    const dest = join(repoRoot, 'integrity', 'v0.8.0', 'integrity.json');
    expect(JSON.parse(readFileSync(dest, 'utf8')).files.a).toBe('sha384-BBB');
  });
});

describe('backfill-all version range (SP2-2 floor..current)', () => {
  // Run under native Node ESM (a subprocess) — the script is .mjs and ts-jest's
  // CommonJS transform can't import it directly.
  const evalNode = (expr: string) =>
    execFileSync('node', ['-e', expr], { encoding: 'utf8' }).trim();

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
});
