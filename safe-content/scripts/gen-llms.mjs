#!/usr/bin/env node
/*
 * Generate `llms.txt` for @immediately-run/safe-content — the agent-facing API map
 * (the SDK's `scripts/gen-llms.mjs` pattern, ported). Reads TypeDoc's JSON so it
 * stays in sync with the code; `--check` gates `verify` so exports cannot change
 * without the doc following.
 *
 * Usage:
 *   node scripts/gen-llms.mjs            (after typedoc; writes llms.txt)
 *   node scripts/gen-llms.mjs --check
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiJsonPath = resolve(root, 'docs/api.json');
const outPath = resolve(root, 'llms.txt');

if (!existsSync(apiJsonPath)) {
  console.error('error: docs/api.json not found — run `npm run docs` first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const api = JSON.parse(readFileSync(apiJsonPath, 'utf8'));

const KIND = {
  64: 'function',
  32: 'const',
  256: 'interface',
  2097152: 'type',
  128: 'class',
  8: 'enum',
  4: 'namespace',
};

const summary = (c) => {
  const parts = c.comment?.summary ?? c.signatures?.find((s) => s.comment)?.comment?.summary;
  if (!parts) return '';
  const text = parts.map((p) => p.text ?? '').join('');
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0].trim();
};

const lines = [];
lines.push(`# ${pkg.name}`);
lines.push('');
lines.push(`> ${pkg.description} (v${pkg.version})`);
lines.push('');
lines.push('The non-executable MDX renderer: untrusted Markdown/MDX-syntax content rendered');
lines.push('as DATA, with no evaluator anywhere in the pipeline (TRUST_MODES_SPEC §5.1). Every');
lines.push('security property in one sentence: JSX tags resolve ONLY through a component');
lines.push('registry by name with literal string props only — unknown tags render their');
lines.push('children inert; expression attributes are dropped; URLs pass an allowlist;');
lines.push('wiki-links resolve through the shared link-space resolver.');
lines.push('');
lines.push('Consumed directly, or re-exported byte-compatibly through `@immediately-run/sdk`');
lines.push('(`@immediately-run/sdk/safeContent/*`) — no import path changes needed either way.');
lines.push('');
lines.push('## Exports');
lines.push('');
for (const c of api.children ?? []) {
  if (!KIND[c.kind]) continue;
  const s = summary(c);
  lines.push(`- \`${c.name}\` (${KIND[c.kind]})${s ? ' — ' + s : ''}`);
}
lines.push('');
lines.push('## Non-negotiables when embedding');
lines.push('');
lines.push('- A **T2 tool, not a platform gate**: it stops content executing as code; it');
lines.push('  certifies nothing to the host — data-fencing is still required for readers.');
lines.push('- `@immediately-run/mdx-plugins` is a deliberate runtime dep (the anti-drift');
lines.push('  coupling): the compiled and interpreted paths share ONE grammar.');
lines.push('- `react` is a peer the host provides.');
lines.push('');
lines.push('---');
lines.push('_Generated from the typed API by `scripts/gen-llms.mjs`; regenerate on export changes (verify checks freshness)._');

const content = lines.join('\n') + '\n';

if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(outPath, 'utf8');
  } catch {
    console.error('error: llms.txt missing — run `npm run docs` and commit it.');
    process.exit(1);
  }
  if (committed !== content) {
    console.error('error: llms.txt is stale — run `npm run docs` and commit the result.');
    process.exit(1);
  }
  console.log('OK llms.txt is current.');
} else {
  writeFileSync(outPath, content);
  console.log(`✓ Wrote ${outPath}.`);
}
