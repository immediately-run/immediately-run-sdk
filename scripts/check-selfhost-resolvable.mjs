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
const isAppProvided = (spec) =>
  APP_PROVIDED.some((p) => spec === p || spec.startsWith(`${p}/`));

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

// --- audit a published payload over the wire --------------------------------
const auditPublished = async (version) => {
  const base = `${ORIGIN}/v/${version}`;
  const manifest = await (await fetch(`${base}/manifest.json`)).json();
  const files = manifest.files.filter((f) => f.endsWith('.js'));
  const cache = new Map();
  for (const f of files) cache.set(f, await (await fetch(`${base}/${f}`)).text());
  return report(`published v${version}`, scanPayload((f) => cache.get(f), files), files.length);
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
  console.log(`\n${cases.length + 1 - failed}/${cases.length + 1} self-test cases.`);
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
  const findings = scanPayload((f) => readFileSync(join(dir, f), 'utf8'), files);
  process.exit(report(relative(ROOT, dir) || dir, findings, files.length) ? 0 : 1);
}
