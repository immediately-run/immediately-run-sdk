#!/usr/bin/env node
/*
 * Every bare specifier the self-hosted payload ships must be resolvable IN THE
 * SANDBOX — R3-288.
 *
 * The sandbox fetches `@immediately-run/sdk` from our own origin
 * (`SELF_HOST_BASES`, `<base>/v/<version>/`) as a flat set of files. It does NOT
 * install the SDK's own dependencies: nothing walks a node_modules tree for it.
 * So a bare `import` inside a shipped file resolves only if the APP happens to
 * provide that package — true for the React peers every app declares, false for
 * anything else. Anything else is a module-not-found at boot, and the app renders
 * a blank frame.
 *
 * That is not hypothetical. 0.45.0 and 0.45.1 both shipped
 *
 *   // dist/urlUtils.js
 *   import { APP_ROOT, underAppRoot } from "@immediately-run/platform-constants";
 *
 * against a 78-file payload containing no such module, so EVERY app pinning either
 * version died with
 *
 *   Cannot find module '@immediately-run/platform-constants'
 *   from '/node_modules/@immediately-run/sdk/urlUtils.js'
 *
 * `api:check`, the integrity manifest and `npm run verify` were all green: they
 * check the SHAPE of the surface and the INTEGRITY of the bytes, and neither asks
 * whether the bytes can load. This does.
 *
 * `tsup` runs with `bundle: false` (per-file transpile, to preserve subpath
 * imports), so its `external` list is a statement of intent, not a mechanism —
 * every bare specifier in source survives verbatim into dist. The rule is
 * therefore about SOURCE discipline, and this is where it is enforced.
 *
 * Usage:
 *   node scripts/check-selfhost-resolvable.mjs [--dir <payload>] [--self-test]
 *   node scripts/check-selfhost-resolvable.mjs --version 0.45.1   (audit a PUBLISHED
 *                                                                  payload over the wire)
 *
 * `--dir` takes either a payload root (`<out>/v/<version>/`) or the version dir.
 * Point it at a PAYLOAD, never at `dist/`: dist legitimately carries the bare
 * specifiers the npm channel resolves through node_modules — the constraint is a
 * property of the self-hosted channel, and `build-selfhost` is what satisfies it.
 * Exit 0 clean, 1 on any unresolvable specifier.
 */
import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://immediately-run.github.io/immediately-run-sdk';

/**
 * The ONLY bare specifiers a self-hosted file may carry: packages the consuming
 * APP declares, so the sandbox has them in `/node_modules` already. Kept in sync
 * with `tsup.config.ts`'s `external` — those are the peers, and a peer is exactly
 * "the app provides this". A subpath of an allowed root (`react-dom/client`) is
 * allowed too.
 */
export const APP_PROVIDED = ['react', 'react-dom', 'react-error-boundary'];

const isRelative = (spec) => spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
const isAppProvided = (spec) => APP_PROVIDED.some((p) => spec === p || spec.startsWith(`${p}/`));

/** Every bare (non-relative) specifier in one emitted file. */
export const bareSpecifiers = (source) => {
  const out = new Set();
  const patterns = [
    // `import x from "y"` / `export … from "y"` — the `from` form
    /(?:^|[\s;}])(?:import|export)\b[^;'"]*?\sfrom\s*["']([^"']+)["']/g,
    // bare side-effect import: `import "y"`
    /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
    // dynamic import + require
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      const spec = m[1];
      if (!isRelative(spec)) out.add(spec);
    }
  }
  return [...out];
};

/** Walk a payload dir for the files the sandbox actually loads (ESM `.js`). */
const jsFiles = (dir, rel = '') => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...jsFiles(join(dir, entry.name), childRel));
    else if (entry.name.endsWith('.js')) out.push(childRel);
  }
  return out;
};

// --- named imports must actually BE exported (R3-288, second pass) -----------
//
// Resolvability is not correctness. 0.45.2 fixed the bare specifiers by inlining
// the two workspace packages with `export * from '<cjs pkg>'` — which esbuild
// cannot statically enumerate, so the emitted module carried the namespace object
// and NO export statement. Every importer then read `undefined`, and the crash
// moved from the resolver ("Cannot find module") to first use ("Cannot read
// properties of undefined"), which is strictly harder to trace. This check asks
// the question the first pass did not: does the file being imported from export
// the names being imported?

/** The names a file exports. `null` means "cannot tell" — a `export * from './x'`
 *  chain, where a static answer would be a guess; those targets are skipped rather
 *  than failed, so this never invents a finding. */
export const exportedNames = (source) => {
  if (/(?:^|[\s;}])export\s*\*\s*from\s*["']/m.test(source)) return null;
  const names = new Set();
  for (const m of source.matchAll(/(?:^|[\s;}])export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const as = piece.split(/\s+as\s+/);
      names.add((as[1] ?? as[0]).trim());
    }
  }
  for (const m of source.matchAll(
    /(?:^|[\s;}])export\s+(?:declare\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g,
  ))
    names.add(m[1]);
  if (/(?:^|[\s;}])export\s+default\b/.test(source)) names.add('default');
  return names;
};

/** The named imports a file takes from RELATIVE specifiers: [{ spec, names }]. */
export const relativeNamedImports = (source) => {
  const out = [];
  for (const m of source.matchAll(/(?:^|[\s;}])import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']*)["']/g)) {
    const names = m[1]
      .split(',')
      .map((p) =>
        p
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter(Boolean);
    out.push({ spec: m[2], names });
  }
  return out;
};

/** Findings for a payload: [{ file, spec, name }] for every named import of a
 *  symbol the target file does not export. */
export const scanNamedImports = (readFile, files) => {
  const present = new Set(files);
  const exportsOf = new Map();
  const nameSet = (rel) => {
    if (!exportsOf.has(rel)) exportsOf.set(rel, exportedNames(readFile(rel)));
    return exportsOf.get(rel);
  };
  const findings = [];
  for (const file of files) {
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
    for (const { spec, names } of relativeNamedImports(readFile(file))) {
      // Resolve the relative specifier against the payload's flat file list.
      const parts = (dir ? `${dir}/${spec}` : spec).split('/');
      const stack = [];
      for (const seg of parts) {
        if (!seg || seg === '.') continue;
        if (seg === '..') stack.pop();
        else stack.push(seg);
      }
      let target = stack.join('/');
      if (!present.has(target)) target = `${target}.js`;
      if (!present.has(target)) continue; // extension-less/ambiguous — not this check's job
      const exported = nameSet(target);
      if (exported === null) continue; // `export *` chain: unknowable statically
      for (const name of names) if (!exported.has(name)) findings.push({ file, spec: target, name });
    }
  }
  return findings;
};

/** Findings for a payload: [{ file, spec }] for every unresolvable specifier. */
export const scanPayload = (readFile, files) => {
  const findings = [];
  for (const file of files) {
    for (const spec of bareSpecifiers(readFile(file))) {
      if (!isAppProvided(spec)) findings.push({ file, spec });
    }
  }
  return findings;
};

const report = (label, findings, fileCount) => {
  if (findings.length === 0) {
    console.log(
      `OK: ${label} — ${fileCount} emitted file(s), every bare specifier is app-provided ` +
        `(${APP_PROVIDED.join(', ')}).`,
    );
    return true;
  }
  console.error(`::error::${label}: ${findings.length} unresolvable bare specifier(s).`);
  console.error(
    'The sandbox loads a self-hosted file with NO dependency tree — only what the app itself\n' +
      'declares resolves. Inline the module (see scripts/build-safecontent-deps.mjs for the\n' +
      'pattern), or take the value from a file the payload already ships.\n',
  );
  const byspec = new Map();
  for (const f of findings) (byspec.get(f.spec) ?? byspec.set(f.spec, []).get(f.spec)).push(f.file);
  for (const [spec, fs] of byspec) console.error(`  ${spec}\n    ${fs.join('\n    ')}`);
  return false;
};

const reportNames = (label, findings) => {
  if (findings.length === 0) {
    console.log(`OK: ${label} — every named import resolves to a real export.`);
    return true;
  }
  console.error(`::error::${label}: ${findings.length} named import(s) of a symbol the target does not export.`);
  console.error(
    'The importer reads `undefined` and fails at FIRST USE, not at load — which is how\n' +
      '0.45.2 turned a module-not-found into `Cannot read properties of undefined`.\n',
  );
  for (const f of findings) console.error(`  ${f.file} imports { ${f.name} } from ${f.spec}`);
  return false;
};

// --- audit a published payload over the wire --------------------------------
const auditPublished = async (version) => {
  const base = `${ORIGIN}/v/${version}`;
  const manifest = await (await fetch(`${base}/manifest.json`)).json();
  const files = manifest.files.filter((f) => f.endsWith('.js'));
  const cache = new Map();
  for (const f of files) cache.set(f, await (await fetch(`${base}/${f}`)).text());
  const read = (f) => cache.get(f);
  const ok = report(`published v${version}`, scanPayload(read, files), files.length);
  const okNames = reportNames(`published v${version}`, scanNamedImports(read, files));
  return ok && okNames;
};

// --- self-test ---------------------------------------------------------------
const selfTest = () => {
  const cases = [
    { name: 'a relative import is fine', src: 'import { a } from "./x";', want: 0 },
    { name: 'an app-provided peer is fine', src: 'import React from "react";', want: 0 },
    { name: 'a peer SUBPATH is fine', src: 'import { createRoot } from "react-dom/client";', want: 0 },
    {
      name: 'THE R3-288 REGRESSION: a workspace package is not',
      src: 'import { APP_ROOT } from "@immediately-run/platform-constants";',
      want: 1,
    },
    { name: 'a bare side-effect import is caught', src: 'import "some-polyfill";', want: 1 },
    { name: 'a dynamic import is caught', src: 'const m = await import("mdast-util-from-markdown");', want: 1 },
    { name: 'a require is caught', src: 'const x = require("lodash");', want: 1 },
    { name: 're-export from a bare specifier is caught', src: 'export { x } from "@scope/pkg";', want: 1 },
    { name: 'a STRING that merely looks like one is not', src: 'const doc = "import x from \\"pkg\\"";', want: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = scanPayload(() => c.src, ['f.js']).length;
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name} (expected ${c.want}, got ${got})`);
  }
  // The 0.45.2 shape: the specifier resolves, the NAME does not exist.
  const namedCases = [
    {
      name: 'THE 0.45.2 REGRESSION: `export *` from a CJS bundle exports nothing',
      target: 'var mod = {};\nvar ns = {};\n__reExport(ns, mod);\n',
      importer: 'import { APP_ROOT } from "./_workspace/pc.js";\n',
      want: 1,
    },
    {
      name: 'a real named export satisfies it',
      target: 'var APP_ROOT = "/app";\nexport { APP_ROOT };\n',
      importer: 'import { APP_ROOT } from "./_workspace/pc.js";\n',
      want: 0,
    },
    {
      name: '`export const` counts',
      target: 'export const APP_ROOT = "/app";\n',
      importer: 'import { APP_ROOT } from "./_workspace/pc.js";\n',
      want: 0,
    },
    {
      name: 'a renamed export counts under its EXTERNAL name',
      target: 'var a = 1;\nexport { a as APP_ROOT };\n',
      importer: 'import { APP_ROOT } from "./_workspace/pc.js";\n',
      want: 0,
    },
    {
      name: 'an `export *` chain is unknowable, so it is skipped rather than failed',
      target: 'export * from "./other.js";\n',
      importer: 'import { APP_ROOT } from "./_workspace/pc.js";\n',
      want: 0,
    },
    {
      name: 'a ../ path from a nested file resolves to the same target',
      target: 'export const APP_ROOT = "/app";\n',
      importer: 'import { APP_ROOT } from "../_workspace/pc.js";\n',
      want: 0,
      importerPath: 'generated/protocol.js',
    },
  ];
  for (const c of namedCases) {
    const files = ['_workspace/pc.js', c.importerPath ?? 'urlUtils.js'];
    const read = (f) => (f === '_workspace/pc.js' ? c.target : c.importer);
    const got = scanNamedImports(read, files).length;
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name} (expected ${c.want}, got ${got})`);
  }

  // Fault injection over a REAL payload shape: a clean tree plus one poisoned file.
  const dir = mkdtempSync(join(tmpdir(), 'sdk-payload-'));
  try {
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'index.js'), 'export { a } from "./sub/a";\nimport "react";\n');
    writeFileSync(join(dir, 'sub/a.js'), 'export const a = 1;\n');
    const clean = scanPayload((f) => readFileSync(join(dir, f), 'utf8'), jsFiles(dir));
    writeFileSync(join(dir, 'sub/a.js'), 'import { APP_ROOT } from "@immediately-run/platform-constants";\n');
    const poisoned = scanPayload((f) => readFileSync(join(dir, f), 'utf8'), jsFiles(dir));
    const ok = clean.length === 0 && poisoned.length === 1 && poisoned[0].file === 'sub/a.js';
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  a poisoned file in a nested payload dir is located by path`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const total = cases.length + namedCases.length + 1;
  console.log(`\n${total - failed}/${total} self-test cases.`);
  return failed === 0;
};

// --- CLI ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes('--self-test')) {
  process.exit(selfTest() ? 0 : 1);
} else if (flag('--version')) {
  process.exit((await auditPublished(flag('--version'))) ? 0 : 1);
} else {
  let dir = flag('--dir') ?? join(ROOT, 'dist');
  if (!existsSync(dir)) {
    console.error(`error: ${dir} not found — run 'npm run build' first.`);
    process.exit(1);
  }
  // Accept a payload ROOT (`<out>/v/<version>/…`, what build-selfhost emits) as
  // well as a version dir, so callers don't have to interpolate the version.
  const versionsDir = join(dir, 'v');
  if (existsSync(versionsDir)) {
    const versions = readdirSync(versionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (versions.length !== 1) {
      console.error(`error: ${versionsDir} holds ${versions.length} versions — pass the version dir.`);
      process.exit(1);
    }
    dir = join(versionsDir, versions[0]);
  }
  const files = jsFiles(dir);
  const read = (f) => readFileSync(join(dir, f), 'utf8');
  const label = relative(ROOT, dir) || dir;
  const ok = report(label, scanPayload(read, files), files.length);
  const okNames = reportNames(label, scanNamedImports(read, files));
  process.exit(ok && okNames ? 0 : 1);
}
