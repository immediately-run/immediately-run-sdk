#!/usr/bin/env node
/*
 * Fail CI on a circular import between SDK source modules. The immediately.run
 * sandbox bundler evaluates a module by synchronously running its code (which
 * require()s its deps), so a require cycle recurses into "Maximum call stack size
 * exceeded" at app boot — exactly what shipped in SDK 0.2.7 (sandboxUtils ↔
 * runtime) and broke the first live self-host run. The sandbox now detects this
 * at runtime (CircularImportError); this guard catches it earlier, at publish.
 *
 * Self-contained (no madge/dpdm dependency): walk src/, parse relative
 * `import`/`export ... from` + `import()` specifiers, resolve them to files, and
 * DFS for a back-edge. Exits non-zero on the first cycle, printing the loop.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');

// Collect source files (skip tests + ambient .d.ts).
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.d\.ts$/.test(entry.name)) files.push(p);
  }
};
walk(srcDir);

const fileSet = new Set(files);

// Resolve a relative specifier from `fromFile` to an actual source file, or null
// (external/unresolved). Tries extensions and index files, the same shapes the
// bundler/TS resolver accept.
const resolveSpecifier = (fromFile, spec) => {
  if (!spec.startsWith('.')) return null; // bare/external import — not our graph
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
    if (existsSync(c) && statSync(c).isFile() && fileSet.has(c)) return c;
  }
  return null;
};

// Build the import graph. Matches `from '...'` (import + re-export) and `import('...')`.
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.[^"']+)["']/g;
const graph = new Map();
for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const deps = new Set();
  for (const m of code.matchAll(SPEC_RE)) {
    const target = resolveSpecifier(file, m[1]);
    if (target && target !== file) deps.add(target);
  }
  graph.set(file, deps);
}

// DFS for a back-edge; report the first cycle found.
const rel = (f) => relative(root, f);
const WHITE = 0,
  GRAY = 1,
  BLACK = 2;
const color = new Map(files.map((f) => [f, WHITE]));
const stack = [];
let cycle = null;

const dfs = (node) => {
  color.set(node, GRAY);
  stack.push(node);
  for (const dep of graph.get(node)) {
    if (cycle) return;
    const c = color.get(dep);
    if (c === GRAY) {
      // Back-edge — the cycle is from dep's position on the stack to the top.
      cycle = stack.slice(stack.indexOf(dep));
      return;
    }
    if (c === WHITE) dfs(dep);
  }
  stack.pop();
  color.set(node, BLACK);
};

for (const file of files) {
  if (color.get(file) === WHITE) dfs(file);
  if (cycle) break;
}

if (cycle) {
  const names = cycle.map(rel);
  console.error('✗ Circular import detected between SDK modules:\n');
  console.error(`  ${names[0]}`);
  for (let i = 1; i < names.length; i++) console.error(`    → ${names[i]}`);
  console.error(`    → ${names[0]}  (cycle closes here)\n`);
  console.error(
    'The sandbox bundler evaluates modules by running their code synchronously, so a\n' +
      'require cycle recurses into "Maximum call stack size exceeded" at app boot. Break\n' +
      'the cycle: move the shared binding into a leaf module that imports nothing from\n' +
      'this group (see hostRuntime.ts, added to fix the 0.2.7 sandboxUtils↔runtime cycle).',
  );
  process.exit(1);
}

console.log(`✓ No circular imports among ${files.length} SDK source modules.`);
