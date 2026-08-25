#!/usr/bin/env node
/*
 * Build the self-hosted, versioned SDK artifact the sandbox bundler fetches when
 * an app opts `@immediately-run/sdk` into `immediately.run`.`resolveFromRegistry`
 * (SDK_PACKAGING_SPEC §5/§11, Option A). Produces, under
 * `<out>/v/<version>/`, the SAME layout the sandbox's copy-sdk.sh vendors — ESM
 * `.js` (+ `.js.map`, `.d.ts`) preserving directory structure, a minimal
 * package.json, and a manifest.json the bundler reads at boot — so a
 * self-hosted module is byte-for-byte the vendored one, just versioned and
 * served from our gh-pages origin (lag-free, immune to npm→CDN replication).
 *
 * Usage: node scripts/build-selfhost.mjs <outDir>   (default: ./selfhost)
 *
 * Idempotent: a version dir is immutable, so re-running for an already-published
 * version reproduces identical bytes. Publishing uses keep_files so prior
 * versions accumulate.
 *
 * R3-288 — WORKSPACE PACKAGES ARE INLINED HERE, and only here. The sandbox loads
 * this payload as a FLAT set of files with no dependency tree: a bare specifier
 * resolves only if the consuming APP already provides that package (react,
 * react-dom, react-error-boundary — the sandbox's own dep set). `tsup` runs
 * `bundle: false` to preserve subpath imports, so every bare specifier in source
 * survives verbatim into `dist/` — which is CORRECT for the npm channel, where
 * `@immediately-run/platform-constants` and `@immediately-run/sandbox-protocol`
 * are ordinary dependencies a bundler resolves. It is fatal for THIS channel: 0.45.0
 * and 0.45.1 shipped four files importing those two packages, and every app pinning
 * either version died at boot with `Cannot find module …`, blank-framed.
 *
 * So the payload — not `dist/` — is where they are inlined: each package is bundled
 * once into `_workspace/`, and the bare specifier in every copied file is rewritten
 * to a relative path. npm consumers keep normal module identity; the sandbox gets a
 * self-contained tree. `scripts/check-selfhost-resolvable.mjs` runs over the RESULT
 * and fails the build if anything unresolvable survives.
 */
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(root, 'package.json'), 'utf8')));
const version = pkg.version;
const outBase = process.argv[2] ?? join(root, 'selfhost');
const dest = join(outBase, 'v', version);

if (!existsSync(dist)) {
  console.error(`error: ${dist} not found — run 'npm run build' first.`);
  process.exit(1);
}

// Walk dist/, copying the runtime files (matches copy-sdk.sh's set).
const KEEP = /\.(js|js\.map|d\.ts)$/;
const jsFiles = [];
const walk = (dir, rel = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(join(dir, entry.name), childRel);
    } else if (KEEP.test(entry.name)) {
      const target = join(dest, childRel);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(dir, entry.name), target);
      if (entry.name.endsWith('.js')) jsFiles.push(childRel);
    }
  }
};
walk(dist);

// --- R3-288: inline the workspace packages (see the header) ------------------
//
// Bundled ONE FILE PER PACKAGE (not per importer): bundling the importers instead
// would inline their relative imports too, duplicating the SDK graph and breaking
// the per-file subpath identity `bundle: false` exists to preserve.
const INLINE_WORKSPACE = [
  { spec: '@immediately-run/platform-constants', file: 'platform-constants.js' },
  { spec: '@immediately-run/sandbox-protocol/sdk', file: 'sandbox-protocol-sdk.js' },
];
// What the sandbox itself provides; anything else must end up inlined.
const APP_PROVIDED = ['react', 'react-dom', 'react-error-boundary'];

const workspaceDir = join(dest, '_workspace');
mkdirSync(workspaceDir, { recursive: true });
const requireFromRoot = createRequire(join(root, 'package.json'));
for (const { spec, file } of INLINE_WORKSPACE) {
  const out = join(workspaceDir, file);
  // NAMED re-exports, enumerated from the package itself — never `export * from`.
  // Both packages are CommonJS, and esbuild cannot statically enumerate a CJS
  // module's names, so `export *` emits the namespace object and NO export
  // statement at all: every importer then reads `undefined`. That shipped as
  // 0.45.2 and turned the module-not-found into `Cannot read properties of
  // undefined`, which is worse — the resolver is satisfied and the failure moves
  // to first use. Reading the names here keeps the single source of truth (add an
  // export to the package and the next build carries it) and the assertion below
  // makes the emitted file prove it.
  const names = Object.keys(requireFromRoot(spec)).filter((n) => n !== 'default' && n !== '__esModule');
  if (names.length === 0) {
    console.error(`::error::build-selfhost: ${spec} exposes no named exports to inline.`);
    process.exit(1);
  }
  const stub =
    `import * as __ns from ${JSON.stringify(spec)};\n` +
    `const __m = __ns.default ?? __ns;\n` +
    names.map((n) => `export const ${n} = __m[${JSON.stringify(n)}];`).join('\n') +
    '\n';
  await build({
    stdin: {
      contents: stub,
      resolveDir: root,
      sourcefile: `inline-${file}`,
      loader: 'js',
    },
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    external: APP_PROVIDED,
    legalComments: 'none',
    logLevel: 'warning',
  });
  jsFiles.push(`_workspace/${file}`);

  // Prove the emitted module actually EXPORTS those names, by loading it — not by
  // inspecting the source that was meant to produce them. This is the assertion
  // 0.45.2 lacked: the payload was resolvable and every value in it was undefined.
  const loaded = await import(pathToFileURL(out).href);
  const missing = names.filter((n) => !(n in loaded) || loaded[n] === undefined);
  if (missing.length) {
    console.error(
      `::error::build-selfhost: ${file} does not export ${missing.length} name(s) it must ` +
        `(${missing.slice(0, 6).join(', ')}…). An importer would read \`undefined\`.`,
    );
    process.exit(1);
  }

  // Rewrite the bare specifier to a relative path, per importing file (the depth
  // differs: `hooks.js` → `./_workspace/…`, `generated/protocol.js` → `../_workspace/…`).
  for (const rel of jsFiles) {
    if (rel.startsWith('_workspace/')) continue;
    const target = join(dest, rel);
    const source = readFileSync(target, 'utf8');
    if (!source.includes(spec)) continue;
    let relPath = relative(dirname(rel) === '.' ? '' : dirname(rel), `_workspace/${file}`)
      .split(sep)
      .join('/');
    if (!relPath.startsWith('.')) relPath = `./${relPath}`;
    writeFileSync(target, source.replaceAll(`"${spec}"`, `"${relPath}"`).replaceAll(`'${spec}'`, `'${relPath}'`));
  }
}

// Minimal package.json so the in-sandbox resolver maps the bare specifier to
// the flattened ESM entrypoint (identical to copy-sdk.sh).
writeFileSync(
  join(dest, 'package.json'),
  JSON.stringify(
    { name: '@immediately-run/sdk', main: './index.js', module: './index.js', types: './index.d.ts' },
    null,
    2,
  ) + '\n',
);

// Manifest of fetchable files (.js + package.json), sorted — the same shape the
// bundler's addLocalModules reads. Sourcemaps/.d.ts are copied for debuggability
// but intentionally not listed (the bundler only fetches manifest entries).
const fetchable = [...jsFiles, 'package.json'].sort();
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ files: fetchable }, null, 2) + '\n');

// Integrity manifest (SDK_PACKAGING_SPEC §5.2): SHA-384 per fetchable file
// (manifest entries + manifest.json itself), so a verifier can check the bytes
// it fetches against hashes pinned outside this origin. "Pinned versions are
// immutable" becomes an enforced property, not an assumption about gh-pages.
// integrity.json deliberately does NOT hash itself; its own digest is what the
// deployment record / site-main's sdk-integrity.json pins.
const sha384 = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;
const integrityFiles = {};
for (const rel of [...fetchable, 'manifest.json']) {
  integrityFiles[rel] = sha384(readFileSync(join(dest, rel)));
}
writeFileSync(
  join(dest, 'integrity.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      name: pkg.name,
      version,
      algorithm: 'sha384',
      files: integrityFiles,
    },
    null,
    2,
  ) + '\n',
);

console.log(
  `Built self-hosted SDK ${version} -> ${dest} (${jsFiles.length} js files, integrity.json over ${
    Object.keys(integrityFiles).length
  } files)`,
);
