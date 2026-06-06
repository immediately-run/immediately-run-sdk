#!/usr/bin/env node
/*
 * Guard the SDK's public API against accidental breaking changes
 * (SDK_PACKAGING_SPEC §9). A pinned/forked app rides a specific SDK version
 * forever (UI_AS_APPS §0/§7 forkability, core value #4); if a later release
 * silently removes or renames an exported symbol, every fork that imported it
 * breaks. This check makes that impossible to do by accident: it extracts the
 * current public export surface from the built `.d.ts` files and compares it to
 * a committed snapshot (`api-snapshot.json`).
 *
 *   - A symbol present in the snapshot but missing now → REMOVED/RENAMED → fail
 *     (a breaking change; deprecate instead, or it's a genuine major bump).
 *   - New symbols → additive → fail with "run `npm run api:update`" so the
 *     snapshot stays authoritative and every API change is reviewed in the diff.
 *
 * Usage: node scripts/check-api-stability.mjs [--update]
 * Self-contained (no api-extractor dependency); parses the regular tsup `.d.ts`.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const snapshotPath = join(root, 'api-snapshot.json');
const update = process.argv.includes('--update');

if (!existsSync(distDir)) {
  console.error('error: dist/ not found — run `npm run build` first.');
  process.exit(1);
}

// Collect .d.ts (ESM types), skipping the .d.cts CJS duplicates.
const dtsFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.d.ts')) dtsFiles.push(p);
  }
};
walk(distDir);

// Extract the exported NAMES from one .d.ts. Handles the forms tsup emits:
//   export { A, B as C, type D } from './x.js';   export { A, B };
//   export declare const|function|class|abstract class|enum|namespace NAME
//   export interface NAME    export type NAME    export enum NAME
//   export default ...   →   "default"
// `export * from` is skipped: those names live in the target module's own .d.ts,
// which is scanned too. `X as Y` records the exported name Y; `type ` is stripped.
const extractExports = (code) => {
  const names = new Set();
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (let spec of m[1].split(',')) {
      spec = spec.trim().replace(/^type\s+/, '');
      if (!spec) continue;
      const asMatch = spec.match(/\sas\s+(\w+)$/);
      names.add(asMatch ? asMatch[1] : spec.split(/\s+/)[0]);
    }
  }
  for (const m of code.matchAll(
    /export\s+declare\s+(?:const|let|var|function|class|abstract\s+class|enum|namespace)\s+(\w+)/g,
  )) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(/export\s+(?:interface|type|enum)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  if (/export\s+default\b/.test(code)) names.add('default');
  names.delete('default'); // the SDK ships named exports only; ignore if it appears
  return names;
};

const current = {};
for (const file of dtsFiles) {
  const key = relative(distDir, file).replace(/\.d\.ts$/, '');
  const names = [...extractExports(readFileSync(file, 'utf8'))].sort();
  if (names.length) current[key] = names;
}

if (update) {
  writeFileSync(snapshotPath, JSON.stringify(current, null, 2) + '\n');
  const total = Object.values(current).reduce((n, a) => n + a.length, 0);
  console.log(`✓ Wrote api-snapshot.json (${Object.keys(current).length} modules, ${total} exports).`);
  process.exit(0);
}

if (!existsSync(snapshotPath)) {
  console.error('error: api-snapshot.json missing — run `npm run api:update` and commit it.');
  process.exit(1);
}
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const removed = [];
const added = [];
for (const [mod, names] of Object.entries(snapshot)) {
  const now = new Set(current[mod] ?? []);
  for (const n of names) if (!now.has(n)) removed.push(`${mod}: ${n}`);
}
for (const [mod, names] of Object.entries(current)) {
  const was = new Set(snapshot[mod] ?? []);
  for (const n of names) if (!was.has(n)) added.push(`${mod}: ${n}`);
}

if (removed.length) {
  console.error('✗ BREAKING: public exports removed or renamed since the snapshot:\n');
  for (const r of removed) console.error(`  - ${r}`);
  console.error(
    '\nThe SDK public API is additive-only (SDK_PACKAGING_SPEC §9) so pinned forks\n' +
      'keep working. Deprecate instead of removing, or — if this is a deliberate major\n' +
      'break — bump major and run `npm run api:update`.',
  );
  process.exit(1);
}
if (added.length) {
  console.error('✗ New public exports are not in the snapshot:\n');
  for (const a of added) console.error(`  + ${a}`);
  console.error('\nAdditive changes are fine — run `npm run api:update` and commit the snapshot.');
  process.exit(1);
}

const total = Object.values(current).reduce((n, a) => n + a.length, 0);
console.log(`✓ Public API matches the snapshot (${total} exports across ${Object.keys(current).length} modules).`);
