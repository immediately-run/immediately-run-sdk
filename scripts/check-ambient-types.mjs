#!/usr/bin/env node
/*
 * The ambient `fs` / `module` declarations must type-check REAL app shapes, and
 * only those shapes — R3-276b.
 *
 * The declarations moved to `src/ambient.d.ts` + `src/ambient-fs.d.ts` are the
 * platform's promise about the sandbox's ambient surface. A type declaration
 * has two silent failure modes this guards against:
 *
 *   1. WIDENING — a second `declare module 'fs'` (the thing dev-fs 0.3.0 was)
 *      MERGES rather than errors, so a drifted copy quietly widens the surface
 *      apps type-check against (the `*Sync` constraint is where that regresses).
 *   2. VACUITY — the fixture resolves `fs` from `@types/node` leaking in from an
 *      ancestor node_modules, so the probe passes while testing nothing.
 *
 * Both are handled structurally: fixtures are built in a fresh tmp dir OUTSIDE
 * the repo (no ancestor node_modules), with `types: []` (no auto-@types), and
 * the probes assert TYPEDNESS (`readFile(p,'utf8')` is `Promise<string>`, not
 * `any`) and ABSENCE (`// @ts-expect-error` on every `*Sync` spelling — an
 * unused expect-error is a compile error, so a reintroduced sync method fails
 * the build, not a reviewer's memory).
 *
 * Fixtures:
 *   A. sdk-only — `/// <reference types="@immediately-run/sdk/ambient" />`, no
 *      @types/node, no dev-fs. The one-line activation contract.
 *   B. transition — additionally installs a dev-fs whose `./fs` entry
 *      re-references the SDK (the exact shape dev-fs ≥0.4.0 ships; that
 *      package's own repo runs this same probe against its real file). Both
 *      references must resolve to ONE declaration.
 *
 * Plus a bundle-graph purity check: `dist/ambient*` must ship NO runtime files —
 * a `.d.ts` cannot pull anything into an app's bundle graph, and the only way
 * to break that is to add a `.js`/`.cjs` next to it.
 *
 * Usage:
 *   node scripts/check-ambient-types.mjs            (after `npm run build`)
 *   node scripts/check-ambient-types.mjs --self-test
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSC = join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js');

const PROBE = `import fs from 'fs';
import { Include } from '@immediately-run/sdk';

// ── fs.promises: typed, not widened ──────────────────────────────────────────
const text: Promise<string> = fs.promises.readFile('/app/content/a.mdx', 'utf8');
const bytes: Promise<Uint8Array> = fs.promises.readFile('/app/content/a.mdx');

// @ts-expect-error — readFile(p,'utf8') is Promise<string>; if this assigns, the
// surface has widened to \`any\` (the double-declaration failure mode).
const widened: Promise<Uint8Array> = fs.promises.readFile('/app/content/a.mdx', 'utf8');

// ── async-only: no *Sync spelling is reachable ───────────────────────────────
// @ts-expect-error — no fs.promises.readFileSync on the sandbox surface
fs.promises.readFileSync('/app/a');
// @ts-expect-error — no top-level fs.readFileSync either
fs.readFileSync('/app/a');
// @ts-expect-error — no top-level fs.readdirSync either
fs.readdirSync('/app');

// ── the ambient \`module\` global satisfies Include's baseModule prop ─────────
export const Included = () => <Include filename="b.mdx" baseModule={module} />;

export { text, bytes, widened };
`;

const TSCONFIG = `{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "types": []
  },
  "include": ["src", "globals.d.ts"]
}
`;

/** dev-fs ≥0.4.0: `./fs` is a re-reference of the SDK's declaration, not a copy. */
const DEV_FS_REREFERENCE = `/// <reference types="@immediately-run/sdk/ambient" />
export {};
`;

/** The dev-fs 0.3.0 shape (own copy) — with a drifted sync method added, to prove
 *  the probe catches a silently-merged widening instead of blessing it. */
const DEV_FS_DRIFTED_COPY = `declare module 'fs' {
  export const promises: {
    readFile(path: string, encoding: string): Promise<string>
    readFileSync(path: string): string
  }
}
`;

const die = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

/**
 * Build a fixture app in a fresh tmp dir. `sdkRoot` is the package the fixture
 * installs (normally the built repo; a MUTATED copy under self-test).
 * `devFs` selects the transition-state install: 'none' | 'rereference' | 'drifted'.
 */
function makeFixture({ sdkRoot = ROOT, devFs = 'none' }) {
  const dir = mkdtempSync(join(tmpdir(), 'ambient-app-'));
  const nm = join(dir, 'node_modules');
  const scope = join(nm, '@immediately-run');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(scope, { recursive: true });

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'ambient-probe', private: true }));
  writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG);
  writeFileSync(join(dir, 'globals.d.ts'), `/// <reference types="@immediately-run/sdk/ambient" />\n`);
  writeFileSync(join(dir, 'src', 'probe.tsx'), PROBE);

  symlinkSync(sdkRoot, join(scope, 'sdk'), 'dir');
  // React is a peer every app provides; the SDK repo's own devDeps supply the types.
  for (const dep of ['react', '@types/react']) {
    const target = join(ROOT, 'node_modules', dep);
    if (!existsSync(target)) die(`${target} missing — run 'npm ci' first (the fixture symlinks the peer types).`);
    const at = dep.startsWith('@') ? join(nm, '@types') : nm;
    mkdirSync(at, { recursive: true });
    symlinkSync(target, join(at, dep.split('/').pop()), 'dir');
  }

  if (devFs !== 'none') {
    const dfDir = join(scope, 'dev-fs');
    mkdirSync(dfDir);
    writeFileSync(
      join(dfDir, 'package.json'),
      JSON.stringify({
        name: '@immediately-run/dev-fs',
        version: '0.4.0',
        exports: { './fs': { types: './fs.d.ts' } },
      }),
    );
    writeFileSync(join(dfDir, 'fs.d.ts'), devFs === 'rereference' ? DEV_FS_REREFERENCE : DEV_FS_DRIFTED_COPY);
    // The transition state references dev-fs's path TOO — both references at once.
    writeFileSync(
      join(dir, 'globals.d.ts'),
      `/// <reference types="@immediately-run/sdk/ambient" />\n/// <reference types="@immediately-run/dev-fs/fs" />\n`,
    );
  }
  return dir;
}

/** Run tsc over a fixture. Returns { ok, stdout }. */
function compile(dir) {
  const r = spawnSync(process.execPath, [TSC, '-p', dir], { encoding: 'utf8' });
  return { ok: r.status === 0, stdout: r.stdout + r.stderr };
}

/** dist/ambient* must be declarations only — nothing an app bundle could follow. */
function checkBundlePurity(distDir = join(ROOT, 'dist')) {
  const offenders = readdirSync(distDir).filter((f) => /^ambient/.test(f) && !f.endsWith('.d.ts'));
  if (offenders.length) {
    console.error(
      `error: ambient declarations shipped runtime files: ${offenders.join(
        ', ',
      )} — a .d.ts must not grow a .js/.cjs twin.`,
    );
    return false;
  }
  return true;
}

async function run() {
  if (!existsSync(TSC)) die('typescript not installed — run npm ci.');
  const dist = join(ROOT, 'dist', 'ambient.d.ts');
  if (!existsSync(dist)) die(`${dist} missing — run 'npm run build' first.`);
  if (!existsSync(join(ROOT, 'dist', 'ambient-fs.d.ts')))
    die("dist/ambient-fs.d.ts missing — run 'npm run build' first.");

  let ok = true;
  for (const [name, opts] of [
    ['A — sdk-only activation', {}],
    ['B — transition (dev-fs re-reference alongside)', { devFs: 'rereference' }],
  ]) {
    const dir = makeFixture(opts);
    const r = compile(dir);
    console.log(`${r.ok ? '✓' : '✗'} fixture ${name}`);
    if (!r.ok) {
      console.error(r.stdout);
      ok = false;
    }
    rmSync(dir, { recursive: true, force: true });
  }

  ok = checkBundlePurity() && ok;
  if (!ok) process.exit(1);
  console.log('✓ ambient type contract holds (fixtures A+B, bundle purity)');
}

// --- self-test ----------------------------------------------------------------
/** Copy the built package to a tmp root so mutations cannot dirty dist/. */
function mutatedSdkRoot(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'ambient-sdk-'));
  const pkg = join(dir, 'package.json');
  const srcPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  // Minimal package surface: only what `@immediately-run/sdk` + `/ambient` need to resolve.
  writeFileSync(pkg, JSON.stringify({ ...srcPkg, files: undefined }));
  mkdirSync(join(dir, 'dist'));
  for (const f of readdirSync(join(ROOT, 'dist'))) {
    if (f.endsWith('.d.ts') || f === '.eslintrc.json') {
      writeFileSync(join(dir, 'dist', f), readFileSync(join(ROOT, 'dist', f)));
    }
  }
  mutate(dir);
  return dir;
}

const selfTest = async () => {
  if (!existsSync(join(ROOT, 'dist', 'ambient.d.ts'))) die('self-test needs a build first (npm run build).');
  const cases = [];

  // 1. A reintroduced sync method (the widening failure mode) must FAIL the probe.
  cases.push([
    'widened fs surface is caught',
    async () => {
      const root = mutatedSdkRoot((dir) => {
        const f = join(dir, 'dist', 'ambient-fs.d.ts');
        writeFileSync(
          f,
          readFileSync(f, 'utf8').replace(
            'readFile(path: PathLike, options?: { encoding?: null })',
            'readFileSync(path: PathLike): string;\n    readFile(path: PathLike, options?: { encoding?: null })',
          ),
        );
      });
      const dir = makeFixture({ sdkRoot: root });
      const r = compile(dir);
      rmSync(dir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
      return !r.ok;
    },
  ]);

  // 2. A drifted dev-fs copy that re-adds a sync method must FAIL even though
  //    `declare module` merges rather than errors.
  cases.push([
    'drifted dev-fs copy is caught (merge, not error)',
    async () => {
      const dir = makeFixture({ devFs: 'drifted' });
      const r = compile(dir);
      rmSync(dir, { recursive: true, force: true });
      return !r.ok;
    },
  ]);

  // 3. Dropping the ambient declaration entirely must FAIL (probe not vacuous:
  //    `fs` and `module` resolve through the declaration, not through @types/node).
  cases.push([
    'missing declaration fails loudly',
    async () => {
      const root = mutatedSdkRoot((dir) => {
        writeFileSync(join(dir, 'dist', 'ambient-fs.d.ts'), 'export {};\n');
      });
      const dir = makeFixture({ sdkRoot: root });
      const r = compile(dir);
      rmSync(dir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
      return !r.ok;
    },
  ]);

  // 4. A runtime file next to the declarations must fail the purity check.
  cases.push([
    'ambient .js twin fails bundle purity',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ambient-dist-'));
      writeFileSync(join(dir, 'ambient.d.ts'), 'export {};\n');
      writeFileSync(join(dir, 'ambient.js'), 'export {};\n');
      const ok = checkBundlePurity(dir);
      rmSync(dir, { recursive: true, force: true });
      return !ok;
    },
  ]);

  // 5. The checker must not pass a fixture whose probe was gutted (vacuity):
  //    a probe with no expect-errors compiles against the real surface, so the
  //    GUARANTEES must come from mutations above — assert they actually flip.
  let failed = 0;
  let total = 0;
  for (const [name, fn] of cases) {
    total++;
    const pass = await fn();
    console.log(`${pass ? '✓' : '✗'} ${name}`);
    if (!pass) failed++;
  }
  console.log(`\n${total - failed}/${total} self-test cases.`);
  return failed === 0;
};

const argv = process.argv.slice(2);
if (argv.includes('--self-test')) {
  process.exit((await selfTest()) ? 0 : 1);
} else {
  await run();
}
