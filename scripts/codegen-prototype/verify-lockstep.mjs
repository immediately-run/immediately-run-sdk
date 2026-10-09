// The SDK-side half of the R3-166 descriptor lockstep (SDK_SIMPLIFICATION_SPEC §8,
// O1): this repo's capability descriptors — the single source the generated
// wrappers are emitted from — must AGREE with the host's committed descriptor-set
// mirror (`immediately-run-site-main/src/generated/api-descriptors.json`, generated
// from the §8.4 gate table + the closed error-code registry).
//
// The host repo runs the same comparison from its side in its own CI (site-main
// #552). Either repo goes red on a disagreement, whichever changed — that is the
// joint no-drift guarantee R-SDKS-1's honest limitation named as missing.
//
// What is compared, per descriptor:
//   - the method EXISTS in the host mirror (the SDK must not describe a method the
//     gate table does not declare);
//   - same CAPABILITY;
//   - same KIND (request vs stream);
//   - where the host declares a paramsSchema (few rows do), the SDK's params are
//     not NARROWER (one-directional; SDK-wider is unflagged — host validators
//     tolerate unknown keys);
//   - every per-method ERROR code is a member of the host's closed registry.
//     Honest limitation, not a full guarantee: this leg checks the codes the SDK
//     claims against the GLOBAL registry only — the mirror carries no per-method
//     error lists — so the residual unguarded class is "the host throws a code
//     the SDK's per-method union lacks" (an addition-created disagreement;
//     `quota-exceeded` on spaces:invite was exactly that, invisible to both
//     repos' gates until this item fixed it by hand). Closing it needs
//     per-method error declarations in the host mirror, which rides the host
//     side of a future increment. What IS guaranteed here: the SDK never claims
//     a code the registry does not know, and the host's own additive-only gate
//     forbids registry REMOVALS.
//   - where the host declares a resultSchema (R3-1089), the SDK's `result` is not
//     WIDER: every property the SDK type requires is one the host schema requires
//     (or, when the host closes the object, merely declares), and every const/enum
//     member the SDK accepts is one the host may produce. One-directional, the
//     mirror image of the params leg: the SDK may IGNORE fields the host sends,
//     never REQUIRE fields it does not. A host schema that constrains nothing
//     (no properties/required/const/enum/items) is UNCOMPARABLE, not a pass —
//     the summary counts compared vs unconstrained separately. `$ref`s resolve
//     against the descriptor file's own `types` table.
//
// The site-main checkout is the sibling `../immediately-run-site-main` (the
// workspace layout) by default; CI passes the path of its checkout. A missing
// mirror or checkout is a loud failure, never a skip.
//
// Run: node scripts/codegen-prototype/verify-lockstep.mjs [--site-main <path>] [--self-test]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const defaultSiteMain = join(here, '..', '..', '..', 'immediately-run-site-main');

/** Resolve a `$ref` against the descriptor file's own `types` table — whose entries
 *  are `{ description, schema }` envelopes (the shape generate.mjs reads). A ref that
 *  resolves to nothing returns null and the caller FAILS LOUD — an SDK type that
 *  cannot be read is not 'unconstrained on the host side' (review round 1). */
const deref = (node, types, name) => {
  let cur = node;
  const seen = new Set();
  while (cur && typeof cur === 'object' && typeof cur.$ref === 'string') {
    if (seen.has(cur.$ref)) return null; // a ref cycle is uncomparable, not a crash
    seen.add(cur.$ref);
    const entry = types?.[cur.$ref];
    cur = entry?.schema ?? entry;
    if (!cur) {
      throw new Error(
        `RESULT ${name}: SDK \$ref '${[...seen].pop()}' does not resolve against the descriptor file's types table`,
      );
    }
  }
  return cur ?? null;
};

/** The const/enum members a schema node accepts (its OWN declaration only). */
const acceptedValues = (node) => {
  if (!node || typeof node !== 'object') return null;
  if ('const' in node) return [node.const];
  if (Array.isArray(node.enum)) return node.enum;
  return null;
};

/** True when the host schema constrains the shape at all (a bare {type: 'object'}
 *  or {} promises nothing, so no SDK width can be proven against it). */
const hostConstrains = (host) =>
  !!host &&
  typeof host === 'object' &&
  ('const' in host || 'enum' in host || 'properties' in host || 'required' in host || 'items' in host);

/** Pure: every way the SDK's `result` is WIDER than the host's resultSchema.
 *  Returns { violations, compared } — compared=false when the host constrains
 *  nothing and no width claim can be proven either way. */
export function resultViolations(name, sdkResult, hostSchema, types) {
  const out = [];
  let compared = false;
  const walk = (sdkNode, hostNode, path) => {
    const sdk = deref(sdkNode, types, name);
    // A HOST-side $ref is uncomparable, never resolved against the SDK's types
    // (a name collision would compare the SDK against itself and pass a real
    // violation silently — review round 1). The mirror today has no types table.
    const host = hostNode && typeof hostNode === 'object' && typeof hostNode.$ref === 'string' ? null : hostNode;
    if (!sdk || !host || typeof sdk !== 'object' || typeof host !== 'object') return;
    if (!hostConstrains(host)) return;
    // An SDK `void` result IGNORES the reply — the narrowest possible reading, legal
    // by the item's one-directional rule (the SDK may ignore fields the host sends).
    if (sdk.type === 'void') return;
    // A kind flip (SDK string vs host object, say) is a width violation of its own —
    // the item's two bullets do not cover it (review round 1, item-silent).
    if (sdk.type && host.type && sdk.type !== host.type) {
      compared = true;
      out.push(`RESULT ${name}: SDK declares ${path} as ${sdk.type}; the host sends ${host.type}`);
      return;
    }
    const hostValues = acceptedValues(host);
    const sdkValues = acceptedValues(sdk);
    if (hostValues && sdkValues) {
      compared = true;
      const extra = sdkValues.filter((v) => !hostValues.includes(v));
      if (extra.length) {
        out.push(
          `RESULT ${name}: SDK accepts ${path} value(s) ${extra.map(String).join(', ')} the host never produces`,
        );
      }
    }
    if (sdk.type === 'array' && host.type === 'array' && sdk.items) {
      walk(sdk.items, host.items, `${path}[]`);
      return;
    }
    if ((sdk.type === 'object' || sdk.properties) && (host.type === 'object' || host.properties)) {
      const hostProps = Object.keys(host.properties ?? {});
      const hostReq = new Set(host.required ?? []);
      for (const prop of sdk.required ?? []) {
        compared = true;
        if (!hostProps.includes(prop)) {
          if (host.additionalProperties === false) {
            out.push(`RESULT ${name}: SDK requires ${path}.${prop}, which the host's closed object never sends`);
          }
          // An open host object may send anything — unprovable either way.
        } else if (!hostReq.has(prop)) {
          out.push(`RESULT ${name}: SDK requires ${path}.${prop}, which the host declares but does not require`);
        }
      }
      for (const [prop, sub] of Object.entries(sdk.properties ?? {})) {
        if (hostProps.includes(prop)) walk(sub, host.properties[prop], `${path}.${prop}`);
      }
    }
  };
  walk(sdkResult, hostSchema, 'result');
  return { violations: out, compared };
}

/** Pure: every way an SDK descriptor can disagree with the host mirror.
 *  @param {{ errorCodes: string[], methods: object[] }} mirror
 *  @param {object[]} sdk — descriptors, each carrying its file's `types` table as `_types` */
export function lockstepViolations(mirror, sdk) {
  const byName = new Map(mirror.methods.map((m) => [m.name, m]));
  const codes = new Set(mirror.errorCodes);
  const out = [];
  let resultCompared = 0;
  let resultUnconstrained = 0;
  for (const d of sdk) {
    const m = byName.get(d.name);
    if (!m) {
      out.push(`UNKNOWN-METHOD ${d.name} — the host gate table does not declare it`);
      continue;
    }
    if (m.capability !== d.capability) out.push(`CAPABILITY ${d.name}: SDK ${d.capability}, host ${m.capability}`);
    if ((m.stream === true) !== (d.kind === 'stream')) {
      out.push(`KIND ${d.name}: SDK ${d.kind}, host ${m.stream ? 'stream' : 'request'}`);
    }
    if (m.resultSchema && d.result) {
      // A stream descriptor compares its `result` (the generator's return) only —
      // the stream's events are the stream-schema leg's, not this one's.
      const r = resultViolations(d.name, d.result, m.resultSchema, d._types);
      out.push(...r.violations);
      if (r.compared) resultCompared++;
      else resultUnconstrained++;
    }
    if (m.paramsSchema) {
      const hostReq = m.paramsSchema.required ?? [];
      const hostProps = Object.keys(m.paramsSchema.properties ?? {});
      // The SDK's delivered set = declared params ∪ wrapper-injected constants
      // (constParams, e.g. the lifecycle verbs' confirm:true): an injected key
      // is satisfied on every call, not dropped.
      const sdkReq = [...(d.params?.required ?? []), ...Object.keys(d.constParams ?? {})];
      const sdkProps = [...Object.keys(d.params?.properties ?? {}), ...Object.keys(d.constParams ?? {})];
      const droppedReq = hostReq.filter((k) => !sdkReq.includes(k));
      const droppedProps = hostProps.filter((k) => !sdkProps.includes(k));
      if (droppedReq.length) out.push(`PARAMS ${d.name}: SDK drops host-required key(s) ${droppedReq.join(', ')}`);
      if (droppedProps.length)
        out.push(`PARAMS ${d.name}: SDK drops host-declared property(s) ${droppedProps.join(', ')}`);
    }
    for (const code of d.errors) {
      if (!codes.has(code)) {
        out.push(`ERROR-CODE ${d.name}: '${code}' is not in the host's closed error-code registry`);
      }
    }
  }
  // The summary reads the counts off the return — attach them without changing
  // the array shape callers destructure.
  return Object.assign(out, { resultCompared, resultUnconstrained });
}

const readMirror = (siteMainRoot) => {
  const p = join(siteMainRoot, 'src', 'generated', 'api-descriptors.json');
  if (!existsSync(p)) {
    console.error(
      `error: ${p} does not exist — pass the site-main checkout with --site-main <path>.\n` +
        '  (CI checks out immediately-run-site-main next to this repo; locally the\n' +
        '  sibling checkout is the default. This check never skips: a lockstep leg\n' +
        '  that cannot run is not a pass.)',
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
};

const loadSdkDescriptors = async () => {
  const out = [];
  for (const f of readdirSync(here)
    .filter((f) => /^descriptors\..+\.mjs$/.test(f))
    .sort()) {
    const mod = await import(pathToFileURL(join(here, f)).href);
    const methods = mod.family?.methods ?? mod.methods;
    if (!methods) {
      console.error(`error: ${f} exports neither \`family.methods\` nor \`methods\` — cannot read its descriptors.`);
      process.exit(1);
    }
    // The file's `types` table rides each descriptor as `_types`, so the results
    // leg resolves `$ref`s against the file that declared them (R3-1089).
    const types = mod.family?.types ?? mod.types;
    for (const d of methods) out.push({ ...d, _types: types });
  }
  if (!out.length) {
    console.error('error: no descriptor families found — the lockstep check is vacuous, which is a failure.');
    process.exit(1);
  }
  return out;
};

const main = async (arg) => {
  const siteMain = resolve(arg ?? defaultSiteMain);
  const violations = lockstepViolations(readMirror(siteMain), await loadSdkDescriptors());
  if (violations.length) {
    console.error(`FAIL  lockstep: the descriptors disagree with the host mirror (${siteMain}):`);
    for (const v of violations) console.error(`  · ${v}`);
    console.error('  Whichever side changed, the other must follow in the same change window — the');
    console.error('  generated wrappers are emitted from these descriptors, so a disagreement ships');
    console.error('  an SDK whose wrappers mis-describe the host gate.');
    process.exit(1);
  }
  const sdk = await loadSdkDescriptors();
  const mirror = readMirror(siteMain);
  const paramsCompared = sdk.filter((d) => mirror.methods.find((m) => m.name === d.name)?.paramsSchema).length;
  const resultEligible = sdk.filter(
    (d) => d.result && mirror.methods.find((m) => m.name === d.name)?.resultSchema,
  ).length;
  console.log(
    `PASS  lockstep: ${sdk.length} SDK descriptors agree with the host mirror ` +
      `(${mirror.methods.length} methods, ${mirror.errorCodes.length} error codes; ` +
      `params-schema compared on ${paramsCompared} of ${sdk.length}; ` +
      `result compared on ${violations.resultCompared} of ${resultEligible} ` +
      `(${violations.resultUnconstrained} unconstrained on the host side)).`,
  );
};

// ── --self-test: prove each drift class fails ──────────────────────────────────
const selfTest = () => {
  const mirror = {
    errorCodes: ['forbidden', 'auth-required', 'quota-exceeded', 'unknown'],
    methods: [
      {
        name: 'spaces:invite',
        capability: 'spaces:admin',
        resultSchema: {
          type: 'object',
          properties: { ok: { const: true }, mode: { enum: ['ro'] } },
          required: ['ok'],
          additionalProperties: false,
        },
      },
      {
        name: 'llm:chat',
        capability: 'llm:chat',
        stream: true,
        resultSchema: {
          type: 'object',
          properties: { done: { const: true } },
          required: ['done'],
          additionalProperties: false,
        },
      },
      {
        name: 'vcs:diff',
        capability: 'vcs:read',
        paramsSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
      },
    ],
  };
  const base = [
    {
      name: 'spaces:invite',
      capability: 'spaces:admin',
      kind: 'request',
      errors: ['forbidden', 'quota-exceeded', 'unknown'],
      params: { required: ['spaceId', 'login', 'role'], properties: {} },
    },
    { name: 'llm:chat', capability: 'llm:chat', kind: 'stream', errors: ['forbidden', 'unknown'] },
  ];
  const cases = [
    [
      'a method the host never declared',
      [...base, { name: 'spaces:share', capability: 'spaces:admin', kind: 'request', errors: [] }],
      ['UNKNOWN-METHOD spaces:share'],
    ],
    ['a capability disagreement', [{ ...base[0], capability: 'spaces:user' }, base[1]], ['CAPABILITY spaces:invite']],
    ['a kind disagreement', [base[0], { ...base[1], kind: 'request' }], ['KIND llm:chat']],
    [
      'an error code outside the host registry',
      [{ ...base[0], errors: [...base[0].errors, 'network'] }, base[1]],
      ["ERROR-CODE spaces:invite: 'network'"],
    ],
    [
      'SDK params narrower than the host schema',
      [
        ...base,
        {
          name: 'vcs:diff',
          capability: 'vcs:read',
          kind: 'request',
          errors: [],
          params: { required: [], properties: {} },
        },
      ],
      ['PARAMS vcs:diff'],
    ],
    // R3-860: a host-required key the wrapper INJECTS (constParams — the
    // lifecycle verbs' confirm:true) is satisfied on every call, not dropped.
    [
      'a constParams-injected host-required key (must NOT flag)',
      [
        ...base,
        {
          name: 'vcs:diff',
          capability: 'vcs:read',
          kind: 'request',
          errors: [],
          params: { required: [], properties: {} },
          constParams: { path: 'x' },
        },
      ],
      [],
    ],
    // R3-1089 — the results leg.
    [
      'a host schema dropping a field the SDK requires',
      [
        ...base.map((d) => ({
          ...d,
          result: { type: 'object', properties: { ok: { const: true } }, required: ['ok', 'id'] },
        })),
      ],
      ['RESULT spaces:invite'],
    ],
    [
      'an SDK $ref type resolved and compared (host requires it) passes',
      [
        {
          ...base[0],
          result: { $ref: 'Reply' },
          _types: { Reply: { type: 'object', properties: { ok: { const: true } }, required: ['ok'] } },
        },
        base[1],
      ],
      [],
    ],
    [
      'a stream descriptor compares its result (the generator return) only',
      [
        base[0],
        {
          ...base[1],
          result: { type: 'object', properties: { done: { const: true } }, required: ['done', 'extra'] },
        },
      ],
      ['RESULT llm:chat'],
    ],
    [
      'an SDK enum member the host never produces',
      [
        {
          ...base[0],
          result: { type: 'object', properties: { mode: { enum: ['ro', 'rw'] } }, required: ['mode'] },
        },
        base[1],
      ],
      ['RESULT spaces:invite'],
    ],
    // R3-1089 review round 1 — the leg's own failure modes, pinned:
    [
      'an SDK $ref into the { description, schema } envelope (the real types-table shape) resolves and passes',
      [
        {
          ...base[0],
          result: { $ref: 'Reply' },
          _types: {
            Reply: {
              description: 'd',
              schema: { type: 'object', properties: { ok: { const: true } }, required: ['ok'] },
            },
          },
        },
        base[1],
      ],
      [],
    ],
    [
      'an SDK $ref that resolves to nothing throws (never buckets as host-unconstrained)',
      [
        {
          ...base[0],
          result: { $ref: 'DoesNotExist' },
          _types: {},
        },
        base[1],
      ],
      ['THROW'],
    ],
    [
      'a kind flip (SDK string vs host object) flags',
      [
        {
          ...base[0],
          result: { type: 'string', enum: ['ok'] },
        },
        base[1],
      ],
      ['RESULT spaces:invite'],
    ],
  ];
  let ok = 0;
  for (const [label, mutated, expect] of cases) {
    if (expect.length === 1 && expect[0] === 'THROW') {
      let threw = false;
      try {
        lockstepViolations(mirror, mutated);
      } catch {
        threw = true;
      }
      console.log(`${threw ? 'PASS' : 'FAIL'}  detects: ${label}`);
      if (threw) ok++;
      continue;
    }
    const got = lockstepViolations(mirror, mutated);
    // An empty expectation must mean "nothing flagged", or a [] case passes
    // without checking anything.
    const caught =
      expect.every((e) => got.some((g) => g.includes(e))) && (expect.length === 0 ? got.length === 0 : true);
    console.log(`${caught ? 'PASS' : 'FAIL'}  detects: ${label}`);
    if (caught) ok++;
  }
  const clean = lockstepViolations(mirror, base).length === 0;
  console.log(`${clean ? 'PASS' : 'FAIL'}  the clean case flags nothing (no false positive)`);
  if (clean) ok++;
  const total = cases.length + 1;
  console.log(`\n${ok}/${total} self-test cases.`);
  if (ok !== total) {
    console.error('\nself-test FAILED — a gate that cannot fail is not a gate.');
    process.exit(1);
  }
};

const args = process.argv.slice(2);
const selfTestIdx = args.indexOf('--self-test');
const siteIdx = args.indexOf('--site-main');
if (selfTestIdx !== -1) selfTest();
else await main(siteIdx !== -1 ? args[siteIdx + 1] : undefined);
