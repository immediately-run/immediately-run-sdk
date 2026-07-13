#!/usr/bin/env node
/*
 * Bundle the safe renderer's ESM-only parser deps (`src/safeContent/mdastDeps.ts`) into a
 * SINGLE self-contained artifact — the R3-213 on-host packaging fix (see `mdastDeps.ts`).
 *
 * The main SDK build (`tsup`, `bundle:false`) transpiles each source file 1:1 to preserve
 * subpath imports — which for `mdastDeps.ts` would emit a file that still `import`s the bare
 * `mdast-util-*` / `micromark-*` specifiers, exactly the conditional-exports tree the
 * immediately.run sandbox's in-browser resolver cannot walk. So `mdastDeps.ts` is EXCLUDED
 * from the tsup entry (`tsup.config.ts`) and this step — run AFTER tsup — is its SOLE
 * emitter: esbuild inlines the whole tree into `dist/safeContent/mdastDeps.{js,cjs}`, so
 * `parseSafeMdast`'s `import('./mdastDeps')` fetches one already-inlined file with zero
 * remaining bare specifiers. Mirrors how the transpiler bundles `@mdx-js/mdx`
 * (`transpiler/tsup.config.ts` `noExternal`) and how the Babel worker is built with esbuild.
 * Emitting only the bundled `.js`/`.cjs` (no `.d.ts`) also keeps this internal artifact out
 * of the public API snapshot — it's reached only by a relative import, never a public subpath.
 *
 * DOM-free (`worker` condition, ahead of the implicit `browser`) picks the variant of
 * `decode-named-character-reference` that does NOT call `document.createElement` — the same
 * choice the Babel worker makes — so the bundle carries no document dependency and is
 * context-portable (the sandbox iframe HAS a document, but not depending on it is strictly
 * safer). `import`/`default` keep the ESM-only deps resolving.
 *
 * Nothing is left external: this tree pulls in no `react` and (crucially) no `acorn` — acorn
 * is not a runtime edge of the micromark-mdx-jsx tree, only a JSDoc type ref + one inert
 * `ruleId: 'acorn'` string. The self-check below asserts zero surviving bare specifiers so a
 * future dep that the resolver couldn't inline fails the build loud instead of on-host.
 */
import { build } from 'esbuild';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src/safeContent/mdastDeps.ts');
const OUT_DIR = join(ROOT, 'dist/safeContent');

const common = {
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  // DOM-free variants first, then the ESM-only conditions (gotcha: `worker` before the
  // implicit `browser` avoids `document.createElement` in `decode-named-character-reference`).
  conditions: ['worker', 'import', 'default'],
  legalComments: 'none',
  logLevel: 'warning',
};

// ESM output — the shape the sandbox (and every ESM consumer) loads via `import('./mdastDeps')`.
await build({ ...common, outfile: join(OUT_DIR, 'mdastDeps.js'), format: 'esm' });
// CJS output — keeps the dist self-contained for a CJS/bundler consumer of the subpath.
await build({ ...common, outfile: join(OUT_DIR, 'mdastDeps.cjs'), format: 'cjs' });

// The tsup-emitted sourcemaps point at the pre-overwrite (bare-import) files; drop them so
// they don't dangle. esbuild wrote the new bundles without a sourceMappingURL comment.
for (const stale of ['mdastDeps.js.map', 'mdastDeps.cjs.map']) {
  const p = join(OUT_DIR, stale);
  if (existsSync(p)) rmSync(p);
}

// Self-check: the whole point is a single file with NO bare specifier the sandbox resolver
// would have to walk. Fail the build if any survived (a new transitive dep esbuild couldn't
// inline, or an accidental `external`).
const esm = readFileSync(join(OUT_DIR, 'mdastDeps.js'), 'utf8');
const bareImport = esm.match(/(?:^|\n)\s*import[^;\n]*from\s*["'][^.\/][^"']*["']/g) || [];
const bareDynamic = esm.match(/import\(\s*["'][^.\/][^"']*["']\s*\)/g) || [];
const bareRequire = esm.match(/require\(\s*["'][^.\/][^"']*["']\s*\)/g) || [];
const survivors = [...bareImport, ...bareDynamic, ...bareRequire];
if (survivors.length) {
  console.error('build-safecontent-deps: bare specifiers survived the bundle:', survivors);
  process.exit(1);
}
// The bundle must carry no acorn evaluator edge and no compiled-MDX path.
if (/from\s*["']acorn["']/.test(esm) || /(?:import|require)\(\s*["']acorn["']\s*\)/.test(esm)) {
  console.error('build-safecontent-deps: acorn was imported into the safe-content bundle');
  process.exit(1);
}
if (/@mdx-js\/mdx/.test(esm)) {
  console.error('build-safecontent-deps: @mdx-js/mdx leaked into the safe-content bundle');
  process.exit(1);
}

console.log(`Built dist/safeContent/mdastDeps.{js,cjs} (${(esm.length / 1024).toFixed(0)} KB, self-contained)`);
