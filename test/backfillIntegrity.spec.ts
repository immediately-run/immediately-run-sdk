/*
 * R3-286 — `backfill-integrity.mjs` resolves an already-published version's
 * integrity manifest. These drive the REAL script CLI (as the release workflow
 * does) against a REAL local HTTP origin, so the fetch path, the status handling
 * and the retry are all exercised rather than modelled.
 *
 * The bug: `if (existing.ok)` treated every non-2xx alike, so a transient 429/503
 * from GitHub Pages was read as "this version has no manifest" and silently took
 * the TOFU re-derive path — which stamps `backfilledAt: <now>`, so the bytes can
 * never match what was committed. `sync-repo-integrity`'s immutability guard then
 * failed the release, advising a version bump that had nothing to do with the
 * fault. One blip on v0.10.0 blocked SDK 0.45.1 entirely.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const repo = join(__dirname, '..');

/**
 * Deliberately ASYNC (`execFile`, not `execFileSync`): the stub origin below runs
 * in THIS process, so a synchronous spawn would block the event loop, the server
 * could never answer, and the child would wait forever on a fetch that cannot be
 * served. The sibling `repoIntegritySync.spec.ts` can use the sync form only
 * because nothing it drives makes a network call.
 *
 * Same stdio discipline as that file: the failure paths write `::error::`, and a
 * re-emitted Actions workflow command turns a green run red — so capture, never echo.
 */
const execFileAsync = promisify(execFile);
const runBackfill = (args: string[]) =>
  execFileAsync('node', [join(repo, 'scripts', 'backfill-integrity.mjs'), ...args], {
    encoding: 'utf8',
  });

type Routes = Record<string, { status: number; body?: string }>;

/** A stub origin. `routes` is keyed by pathname; anything unrouted is a 404. */
const startOrigin = async (routes: Routes): Promise<{ url: string; server: Server; hits: string[] }> => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? '');
    const route = routes[req.url ?? ''];
    if (!route) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(route.status).end(route.body ?? '');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, server, hits };
};

const sha384 = (s: string) => `sha384-${createHash('sha384').update(Buffer.from(s)).digest('base64')}`;

describe('backfill-integrity — an undetermined probe is not an absent manifest (R3-286)', () => {
  let outDir: string;
  let repoRoot: string;
  let server: Server | undefined;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'ir-out-'));
    repoRoot = mkdtempSync(join(tmpdir(), 'ir-trust-'));
  });
  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
    rmSync(outDir, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  });

  const pinTrustRoot = (version: string, body: string) => {
    const f = join(repoRoot, 'integrity', `v${version}`, 'integrity.json');
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, body);
    return f;
  };
  const written = (version: string) => join(outDir, 'v', version, 'integrity.json');

  it('THROWS on a 503 instead of re-deriving the manifest — the R3-286 regression', async () => {
    const origin = await startOrigin({ '/v/0.10.0/integrity.json': { status: 503 } });
    server = origin.server;

    let err: { status?: number; stderr?: string } | undefined;
    try {
      await runBackfill(['0.10.0', outDir, '--origin', origin.url, '--repo-root', repoRoot, '--attempts', '2']);
    } catch (e) {
      err = e as { status?: number; stderr?: string };
    }

    expect(err).toBeDefined();
    expect(String(err!.stderr)).toMatch(/could not determine whether v0\.10\.0/);
    expect(String(err!.stderr)).toMatch(/HTTP 503/);
    // The point of the whole item: nothing was written. A re-derived manifest here
    // is what trips the immutability guard three steps later.
    expect(existsSync(written('0.10.0'))).toBe(false);
    // …and it RETRIED rather than believing the first non-answer.
    expect(origin.hits.filter((h) => h === '/v/0.10.0/integrity.json').length).toBe(2);
  });

  it('a definitive 404 still takes the TOFU path — the floor case must keep working', async () => {
    const manifest = JSON.stringify({ files: ['index.js'] });
    const origin = await startOrigin({
      // no integrity.json route ⇒ 404
      '/v/0.2.8/manifest.json': { status: 200, body: manifest },
      '/v/0.2.8/index.js': { status: 200, body: 'export const a = 1;\n' },
    });
    server = origin.server;

    await runBackfill(['0.2.8', outDir, '--origin', origin.url, '--repo-root', repoRoot]);

    const doc = JSON.parse(readFileSync(written('0.2.8'), 'utf8'));
    expect(doc.version).toBe('0.2.8');
    expect(doc.files['index.js']).toBe(sha384('export const a = 1;\n'));
    expect(doc.files['manifest.json']).toBe(sha384(manifest));
    expect(doc.backfilledAt).toBeDefined(); // TOFU provenance marker
    // A 404 is definitive, so it must NOT have burned retries on it.
    expect(origin.hits.filter((h) => h === '/v/0.2.8/integrity.json').length).toBe(1);
  });

  it('carries a published manifest verbatim on a 200', async () => {
    const published = JSON.stringify({ version: '0.44.0', files: { 'index.js': 'sha384-AAA' } }) + '\n';
    const origin = await startOrigin({ '/v/0.44.0/integrity.json': { status: 200, body: published } });
    server = origin.server;

    await runBackfill(['0.44.0', outDir, '--origin', origin.url, '--repo-root', repoRoot]);

    expect(readFileSync(written('0.44.0'), 'utf8')).toBe(published);
  });

  describe('a version the trust root already pins is answered from the REPO', () => {
    const pinned = JSON.stringify({ version: '0.10.0', files: { 'index.js': 'sha384-TRUSTED' } }) + '\n';

    it('does not let a 503 change or block it — the blip becomes a non-event', async () => {
      pinTrustRoot('0.10.0', pinned);
      const origin = await startOrigin({ '/v/0.10.0/integrity.json': { status: 503 } });
      server = origin.server;

      const { stdout } = await runBackfill([
        '0.10.0',
        outDir,
        '--origin',
        origin.url,
        '--repo-root',
        repoRoot,
        '--attempts',
        '2',
      ]);

      expect(stdout).toMatch(/from the repo trust root/);
      expect(readFileSync(written('0.10.0'), 'utf8')).toBe(pinned);
    });

    it('reports ORIGIN DIVERGENCE — not an immutability violation — when a 200 disagrees', async () => {
      pinTrustRoot('0.10.0', pinned);
      const origin = await startOrigin({
        '/v/0.10.0/integrity.json': {
          status: 200,
          body: JSON.stringify({ version: '0.10.0', files: { 'index.js': 'sha384-TAMPERED' } }) + '\n',
        },
      });
      server = origin.server;

      let err: { stderr?: string } | undefined;
      try {
        await runBackfill(['0.10.0', outDir, '--origin', origin.url, '--repo-root', repoRoot]);
      } catch (e) {
        err = e as { stderr?: string };
      }
      expect(String(err?.stderr)).toMatch(/Origin divergence/);
      expect(String(err?.stderr)).toMatch(/trust root is authoritative/);
      // The remedy for THIS is not "bump the version" — the two faults must not
      // share a message, which is how the 0.45.1 failure misdirected.
      expect(String(err?.stderr)).not.toMatch(/Bump the package version/);
    });

    it('the origin cannot rewrite a pinned version even when it serves 200 with equal bytes', async () => {
      pinTrustRoot('0.10.0', pinned);
      const origin = await startOrigin({
        '/v/0.10.0/integrity.json': { status: 200, body: pinned },
      });
      server = origin.server;

      await runBackfill(['0.10.0', outDir, '--origin', origin.url, '--repo-root', repoRoot]);
      expect(readFileSync(written('0.10.0'), 'utf8')).toBe(pinned);
    });
  });
});
