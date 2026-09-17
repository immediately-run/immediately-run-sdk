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
//   - every per-method ERROR code is a member of the host's closed registry. The
//     error axis is enforced here rather than symmetrically because the host's own
//     additive-only gate already forbids registry REMOVALS (the only host-side
//     change that could create an error disagreement) — additions cannot.
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

/** Pure: every way an SDK descriptor can disagree with the host mirror.
 *  @param {{ errorCodes: string[], methods: object[] }} mirror
 *  @param {object[]} sdk */
export function lockstepViolations(mirror, sdk) {
  const byName = new Map(mirror.methods.map((m) => [m.name, m]));
  const codes = new Set(mirror.errorCodes);
  const out = [];
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
    if (m.paramsSchema) {
      const hostReq = m.paramsSchema.required ?? [];
      const hostProps = Object.keys(m.paramsSchema.properties ?? {});
      const sdkReq = d.params?.required ?? [];
      const sdkProps = Object.keys(d.params?.properties ?? {});
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
  return out;
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
    out.push(...methods);
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
  console.log(
    `PASS  lockstep: ${sdk.length} SDK descriptors agree with the host mirror ` +
      `(${mirror.methods.length} methods, ${mirror.errorCodes.length} error codes; ` +
      `params-schema compared on ${paramsCompared} of ${sdk.length}).`,
  );
};

// ── --self-test: prove each drift class fails ──────────────────────────────────
const selfTest = () => {
  const mirror = {
    errorCodes: ['forbidden', 'auth-required', 'quota-exceeded', 'unknown'],
    methods: [
      { name: 'spaces:invite', capability: 'spaces:admin' },
      { name: 'llm:chat', capability: 'llm:chat', stream: true },
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
  ];
  let ok = 0;
  for (const [label, mutated, expect] of cases) {
    const got = lockstepViolations(mirror, mutated);
    const caught = expect.every((e) => got.some((g) => g.includes(e)));
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
