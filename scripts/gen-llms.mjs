#!/usr/bin/env node
/*
 * Generate `docs/llms.txt` — a single-fetch, plain-Markdown map of the SDK's
 * public API for coding agents and humans, following the llmstxt.org convention.
 *
 * TypeDoc's HTML is multi-page and JS-driven (poor for agents); this distills the
 * SAME typed API into one file an agent can read in one request: every export,
 * grouped by module, with its kind, import path, and JSDoc one-liner. It reads
 * TypeDoc's JSON (emitted by `npm run docs`) so it stays in sync with the code and
 * rewards JSDoc coverage. The full structured API ships next to it as `api.json`.
 *
 * Usage: node scripts/gen-llms.mjs   (after `typedoc --json docs/api.json`)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiJsonPath = resolve(root, 'docs/api.json');
const outPath = resolve(root, 'docs/llms.txt');
const SITE = 'https://immediately-run.github.io/immediately-run-sdk';

if (!existsSync(apiJsonPath)) {
  console.error('error: docs/api.json not found — run `typedoc --json docs/api.json` first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const api = JSON.parse(readFileSync(apiJsonPath, 'utf8'));

// TypeDoc ReflectionKind → readable label.
const KIND = {
  64: 'function',
  32: 'const',
  256: 'interface',
  2097152: 'type',
  128: 'class',
  8: 'enum',
  4: 'namespace',
};

// First sentence of an export's JSDoc summary (comment lives on the declaration
// or, for functions, on the first call signature).
const summary = (c) => {
  const parts = c.comment?.summary ?? c.signatures?.find((s) => s.comment)?.comment?.summary;
  if (!parts) return '';
  const text = parts.map((p) => p.text ?? '').join('');
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s/)[0]
    .trim();
};

// Module = repo-relative source path without extension (e.g. `auth`, `components/Routes`).
const moduleOf = (c) => (c.sources?.[0]?.fileName ?? '').replace(/^src\//, '').replace(/\.tsx?$/, '');

// Common modules first (the ones an app reaches for), the rest alphabetical.
const PRIORITY = [
  'boot',
  'hooks',
  'routing',
  'components/Routes',
  'components/Include',
  'components/MDXComponents',
  'MDXProvider',
  'auth',
  'mounts',
  'tasks',
  'catalog',
  'theme',
  'region',
  'formFactor',
  'editor',
  'secrets',
  'llm',
  'netFetch',
  'contribute',
  'dnd',
  'onFsChange',
  'diagnostics',
  'ready',
];
const moduleRank = (m) => {
  const i = PRIORITY.indexOf(m);
  return i === -1 ? PRIORITY.length : i;
};

const groups = new Map();
for (const c of api.children ?? []) {
  if (!KIND[c.kind]) continue;
  const m = moduleOf(c) || '(root)';
  if (!groups.has(m)) groups.set(m, []);
  groups.get(m).push(c);
}

const modules = [...groups.keys()].sort((a, b) => moduleRank(a) - moduleRank(b) || a.localeCompare(b));

const lines = [];
lines.push(`# ${pkg.name}`);
lines.push('');
lines.push(`> ${pkg.description} (v${pkg.version})`);
lines.push('');
lines.push(
  'Runtime SDK imported by code running inside an immediately.run sandboxed iframe. ' +
    'Every export below is importable from the package root `@immediately-run/sdk` ' +
    'or from its per-module subpath shown in the heading (e.g. ' +
    '`@immediately-run/sdk/auth`). `react`/`react-dom` (v19+) are peer dependencies ' +
    'the host provides. All platform interaction goes through this SDK.',
);
lines.push('');
lines.push('## Resources');
lines.push('');
lines.push(`- [README & guide](${SITE}/): narrative docs and the design rules.`);
lines.push(
  `- [Full typed API (machine-readable JSON)](${SITE}/api.json): every symbol with exact signatures, parameters, and types — parse this when you need more than the one-liners below.`,
);
lines.push(`- [API reference (HTML)](${SITE}/modules.html): the human-browsable TypeDoc.`);
lines.push(
  `- npm: \`npm install ${pkg.name}\` — the installed package ships \`.d.ts\` with the same JSDoc, readable inline by your tools.`,
);
lines.push('');

for (const m of modules) {
  const exports = groups.get(m).sort((a, b) => a.name.localeCompare(b.name));
  lines.push(`## ${m === '(root)' ? 'index' : m}`);
  lines.push('');
  lines.push(`Import: \`@immediately-run/sdk${m === '(root)' ? '' : '/' + m}\``);
  lines.push('');
  for (const c of exports) {
    const s = summary(c);
    lines.push(`- \`${c.name}\` (${KIND[c.kind]})${s ? ' — ' + s : ''}`);
  }
  lines.push('');
}

lines.push('---');
lines.push('_Generated from the typed API by `scripts/gen-llms.mjs`._');

writeFileSync(outPath, lines.join('\n') + '\n');
const count = [...groups.values()].reduce((n, g) => n + g.length, 0);
console.log(`✓ Wrote docs/llms.txt (${count} exports across ${modules.length} modules).`);
