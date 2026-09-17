#!/usr/bin/env node
/*
 * Generate `docs/api-descriptors.json` + `docs/llms-descriptors.txt` from the
 * capability descriptor set (R3-166, SDK_SIMPLIFICATION_SPEC §3.3) — the doc
 * projections of the SAME single source the generated typed wrappers are emitted
 * from, so they cannot drift from the wrappers or the catalog.
 *
 *   scripts/codegen-prototype/descriptors.<family>.mjs   (THE single source)
 *        │  this script
 *        ▼
 *   docs/api-descriptors.json   (machine-readable: methods, params/result
 *                                schemas, error-code unions, aliases, catalog
 *                                manifest — the agent-facing twin of api.json)
 *   docs/llms-descriptors.txt   (the family tables gen-llms.mjs appends to
 *                                docs/llms.txt)
 *
 * Runs inside `npm run docs` BEFORE gen-llms.mjs (which consumes the fragment).
 * `docs/` is gitignored (built by CI and published to gh-pages), so there is no
 * committed artifact to drift-gate; the serialization is deterministic and the
 * source descriptors ARE byte-gated by verify:codegen-parity.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protoDir = join(root, 'scripts', 'codegen-prototype');
const outDir = join(root, 'docs');

const families = [];
for (const f of readdirSync(protoDir)
  .filter((f) => /^descriptors\..+\.mjs$/.test(f))
  .sort()) {
  const { family } = await import(pathToFileURL(join(protoDir, f)).href);
  if (!family?.scheme) {
    console.error(`error: ${f} exports no \`family.scheme\` — cannot project it.`);
    process.exit(1);
  }
  families.push(family);
}
if (!families.length) {
  console.error('error: no descriptor families found — the doc projection is vacuous, which is a failure.');
  process.exit(1);
}

// The machine-readable projection: everything an embedded agent (or a curious
// authoring agent) needs to drive `invoke(name, params)` and interpret errors.
const descriptorSet = {
  schemaVersion: 1,
  families: families.map((family) => ({
    scheme: family.scheme,
    doc: family.doc,
    types: family.types,
    methods: family.methods.map((m) => ({
      name: m.name,
      capability: m.capability,
      kind: m.kind,
      params: m.params,
      result: m.result,
      event: m.event,
      errors: m.errors,
      doc: m.doc,
      alias: m.alias,
    })),
  })),
};

// The llms.txt fragment: one table per family (the same emission shape the
// prototype's generated/<family>.llms.txt uses, unified here).
const fragment = [];
for (const family of families) {
  fragment.push(`### ${family.scheme} — ${family.doc}`);
  fragment.push('');
  fragment.push('| function | catalog name | capability | kind | params | yields → returns |');
  fragment.push('|---|---|---|---|---|---|');
  for (const m of family.methods) {
    const params = m.params.properties ? Object.keys(m.params.properties).join(', ') || '—' : '—';
    const ret =
      m.kind === 'stream'
        ? `${m.event?.$ref ?? 'event'} → ${m.result?.$ref ?? 'the result schema'}`
        : m.result?.$ref ?? 'the result schema';
    fragment.push(`| \`${m.alias.fn}\` | \`${m.name}\` | \`${m.capability}\` | ${m.kind} | ${params} | ${ret} |`);
  }
  if (family.methods.some((m) => m.kind !== 'stream')) {
    fragment.push('');
    fragment.push(
      'Every request-kind wrapper above also exposes `.try(...)` → `Promise<{ ok: true; value } | { ok: false; code }>` — the same call without the throw.',
    );
  }
  fragment.push('');
}

mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, 'api-descriptors.json');
const txtPath = join(outDir, 'llms-descriptors.txt');
writeFileSync(jsonPath, JSON.stringify(descriptorSet, null, 2) + '\n');
writeFileSync(txtPath, fragment.join('\n') + '\n');

const methodCount = families.reduce((n, f) => n + f.methods.length, 0);
console.log(`✓ Wrote docs/api-descriptors.json (${families.length} families, ${methodCount} methods).`);
console.log('✓ Wrote docs/llms-descriptors.txt (appended to llms.txt by gen-llms.mjs).');
