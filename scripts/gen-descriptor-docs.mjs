#!/usr/bin/env node
/*
 * Generate `docs/api-descriptors.json` + `docs/llms-descriptors.txt` from the
 * capability descriptor set (R3-166, SDK_SIMPLIFICATION_SPEC §3.3) — the doc
 * projections of the SAME single source the generated typed wrappers are emitted
 * from, so they cannot drift from the wrappers or the catalog.
 *
 *   scripts/codegen-prototype/descriptors.<family>.mjs   (THE single source)
 *        │  generate.mjs (the canonical emitter, drift-gated by verify:codegen-parity)
 *        ├──────────────────────────────┐
 *        ▼                              ▼
 *   generated/<family>.llms.txt    src/generated/<family>.ts
 *        │  this script (concatenation only — no second table emitter)
 *        ▼
 *   docs/llms-descriptors.txt   (appended to docs/llms.txt by gen-llms.mjs)
 *
 *   scripts/codegen-prototype/descriptors.<family>.mjs ── this script ──▶
 *   docs/api-descriptors.json   (machine-readable: methods, params/result
 *                                schemas, error-code unions, aliases, catalog
 *                                manifest — the agent-facing twin of api.json;
 *                                a projection with no other emitter)
 *
 * The family tables are READ from the committed generated/<family>.llms.txt
 * fragments — the artifacts verify-drift byte-gates — rather than re-emitted
 * here: a second table emitter drifted from the canonical one on its first day
 * (13 of 16 return types rendered as a placeholder; round-1 review), which is
 * the duplication species this whole item exists to remove.
 *
 * Runs inside `npm run docs` BEFORE gen-llms.mjs (which consumes the fragment).
 * `docs/` is gitignored (built by CI and published to gh-pages), so there is no
 * committed artifact to drift-gate; the serialization is deterministic and the
 * source descriptors ARE byte-gated by verify:codegen-parity.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const protoDir = join(root, 'scripts', 'codegen-prototype');
const outDir = join(root, 'docs');

const descriptorFiles = readdirSync(protoDir)
  .filter((f) => /^descriptors\..+\.mjs$/.test(f))
  .sort();
if (!descriptorFiles.length) {
  console.error('error: no descriptor families found — the doc projection is vacuous, which is a failure.');
  process.exit(1);
}

const families = [];
const fragments = [];
for (const f of descriptorFiles) {
  const { family } = await import(pathToFileURL(join(protoDir, f)).href);
  if (!family?.scheme) {
    console.error(`error: ${f} exports no \`family.scheme\` — cannot project it.`);
    process.exit(1);
  }
  families.push(family);
  // The family table, as the CANONICAL emitter wrote it (drift-gated artifact).
  const fragmentPath = join(protoDir, 'generated', `${family.scheme}.llms.txt`);
  if (!existsSync(fragmentPath)) {
    console.error(
      `error: ${fragmentPath} missing — run the generator first (node scripts/codegen-prototype/generate.mjs ./${f}).`,
    );
    process.exit(1);
  }
  fragments.push(readFileSync(fragmentPath, 'utf8').trimEnd());
}
if (!fragments.length) {
  console.error('error: no committed llms fragments found — the doc projection is vacuous, which is a failure.');
  process.exit(1);
}

// The machine-readable projection: everything an embedded agent (or a curious
// authoring agent) needs to drive `invoke(name, params)` and interpret errors.
// No other emitter produces this shape, so building it here is not duplication.
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

mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, 'api-descriptors.json');
const txtPath = join(outDir, 'llms-descriptors.txt');
writeFileSync(jsonPath, JSON.stringify(descriptorSet, null, 2) + '\n');
writeFileSync(txtPath, fragments.join('\n\n') + '\n');

const methodCount = families.reduce((n, f) => n + f.methods.length, 0);
console.log(`✓ Wrote docs/api-descriptors.json (${families.length} families, ${methodCount} methods).`);
console.log('✓ Wrote docs/llms-descriptors.txt (the canonical fragments, appended to llms.txt by gen-llms.mjs).');
