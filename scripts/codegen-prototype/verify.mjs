// ⚠ NOT IN THE VERIFY CHAIN ANY MORE — and that is deliberate (R3-166 migration).
//
// This gate compared the generated output against an INDEPENDENTLY hand-written
// `src/mounts.ts`. That independence is what made it evidence, and the migration
// consumed it: `mounts.ts` now re-exports `src/generated/spaces.ts`, so for the
// `spaces:*` family this compares generated code to itself. It still passes. It no
// longer asserts anything, and a green check that cannot fail is precisely the bug
// this whole line of work removed — so it is out of `verify:codegen-parity`, and
// `verify-drift.mjs` guards the migrated family instead.
//
// The file is kept because it is the acceptance-test TEMPLATE for the next family:
// point it at an unmigrated one, run it BEFORE swapping, and it does real work
// again. Its `--self-test` also documents the drift classes that matter.
//
// The §7 acceptance test for the gate-table → SDK codegen: does generating from
// the descriptor set produce the SHIPPED surface?
//
// WHAT THIS REPLACED, AND WHY IT MATTERED (R3-166, 2026-08-08). The previous
// version compared the generated path against a HAND-TYPED COPY of `src/mounts.ts`
// living in this file. Both sides therefore derived from the same transcription,
// so a green run only ever proved "the generator agrees with what someone believed
// `mounts.ts` did on the day they wrote this" — it could not see the real module
// move underneath it. And it had: the descriptors declared `spaces:share` →
// `shareSpace(...)`, which the SDK does not export at all (the real method is
// `inviteToSpace`, wire `spaces:invite`, under the §6.4 pull-based invite model).
// A drift-prevention tool that is blind to drift is worse than none, because it
// reports success.
//
// So this drives the REAL artifacts on both sides:
//   - the shipped wrappers, imported from the BUILT `dist/mounts.js`;
//   - the generated path's `invoke()`, imported from the BUILT `dist/catalog.js` —
//     the actual primitive generated code calls, not a copy of it;
//   - the pinned public surface, read from `api-snapshot.json` (what `api:check`
//     itself compares against).
// The only logic left in this file is the positional→object marshalling that
// `alias.positional` declares, and the sample values, which are DERIVED from each
// method's param schema rather than hardcoded — so a param added to a descriptor
// but absent from the real wrapper shows up as a wire mismatch instead of being
// quietly not-exercised.
//
// Run: node scripts/codegen-prototype/verify.mjs        (requires `npm run build`)

import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { family } from './descriptors.spaces.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');

if (!existsSync(resolve(dist, 'mounts.js'))) {
  console.error('error: dist/ not built — run `npm run build` first.');
  process.exit(1);
}

// tsup emits EXTENSIONLESS relative specifiers (`./sandboxUtils`), which the
// sandbox resolver understands and node's ESM resolver does not. This hook adds
// the extension so the real build is importable here. It is the actual reason the
// old harness re-implemented the modules — not, as its comment said, load-time
// side effects: `transport()` resolves lazily and `tasks` is a type-only import.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?js$/.test(spec)) {
      try {
        const p = fileURLToPath(new URL(spec, ctx.parentURL)) + '.js';
        if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true };
      } catch {
        /* fall through to the default resolver */
      }
    }
    return next(spec, ctx);
  },
});

// ── the single host primitive both paths bottom out at (spied, never real) ──────
const calls = [];
let nextReply = { ok: true, data: undefined };
globalThis.__immediatelyRun__ = {
  transport: {
    sendMessage: () => {},
    onMessage: () => ({ dispose() {} }),
    protocolRequest: async (scheme, method, params) => {
      calls.push({ scheme, method, params });
      return nextReply;
    },
  },
};

const real = await import(pathToFileURL(resolve(dist, 'mounts.js')).href);
const { invoke } = await import(pathToFileURL(resolve(dist, 'catalog.js')).href);
const snapshot = JSON.parse(readFileSync(resolve(root, 'api-snapshot.json'), 'utf8'));
const pinned = new Set(snapshot.mounts ?? []);

// ── sample args derived from the descriptor's own param schema ─────────────────
// `family.types` is a NAME → { description, schema } map, not an array.
const typeOf = (name) => family.types?.[name]?.schema;
const sampleFor = (schema, key) => {
  if (!schema) return `${key}-sample`;
  if (schema.$ref) {
    const t = typeOf(schema.$ref);
    // An enum-shaped shared type (e.g. Role) samples its first member, so the
    // value is always one the host would actually accept.
    if (t?.enum?.length) return t.enum[0];
    return `${key}-sample`;
  }
  switch (schema.type) {
    case 'boolean':
      return true;
    case 'number':
    case 'integer':
      return 1;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return `${key}-sample`;
  }
};

/** Positional args for a method, in `alias.positional` order. `opts` is the
 *  whole-object form (`listSpaces(opts)`) and is built from every property. */
const argsFor = (m) => {
  const props = m.params?.properties ?? {};
  const pos = m.alias.positional ?? [];
  if (pos.length === 1 && pos[0] === 'opts') {
    return [Object.fromEntries(Object.keys(props).map((k) => [k, sampleFor(props[k], k)]))];
  }
  return pos.map((p) => sampleFor(props[p], p));
};

/** The params object the GENERATED wrapper would build from those positionals. */
const paramsFor = (m, args) => {
  const pos = m.alias.positional ?? [];
  if (pos.length === 1 && pos[0] === 'opts') return args[0] ?? {};
  return Object.fromEntries(pos.map((p, i) => [p, args[i]]));
};

// Undefined-AWARE comparison. Plain `JSON.stringify` omits keys whose value is
// `undefined`, so a descriptor that DROPS a positional param compares equal to the
// real call: the real wrapper is then invoked with one fewer argument and sends
// `{…, role: undefined}`, which stringifies identically to `{…}`. The self-test
// case "drops a param the real wrapper does send" fails without this.
const canon = (v) => JSON.stringify(v, (_k, val) => (val === undefined ? '\u0000undefined' : val));
const eq = (a, b) => canon(a) === canon(b);

/** Run every check over one family. Returns `{ pass, failures }`; prints nothing
 *  when `quiet` (the self-test drives it repeatedly with poisoned input). */
const checkFamily = async (fam, { quiet = false } = {}) => {
  const failures = [];
  let pass = 0;

  for (const m of fam.methods) {
    const fn = m.alias.fn;
    const problems = [];

    // A. SURFACE — the descriptor must name an export the SDK actually ships.
    //    This is the check the old harness structurally could not perform.
    const shipped = typeof real[fn] === 'function';
    if (!shipped) problems.push(`no such export in dist/mounts.js`);
    if (!pinned.has(fn)) problems.push(`not in api-snapshot.json's pinned 'mounts' surface`);

    if (shipped) {
      const args = argsFor(m);
      // B. WIRE — real wrapper vs. generated `invoke()`, same inputs.
      nextReply = { ok: true, data: { marker: fn } };
      calls.length = 0;
      await real[fn](...args).catch((e) => problems.push(`real threw on success path: ${e.message}`));
      const wireReal = calls.at(-1);
      calls.length = 0;
      await invoke(m.name, paramsFor(m, args)).catch((e) =>
        problems.push(`generated threw on success path: ${e.message}`),
      );
      const wireGen = calls.at(-1);
      if (!eq(wireReal, wireGen)) {
        problems.push(`wire mismatch\n     real: ${JSON.stringify(wireReal)}\n     gen : ${JSON.stringify(wireGen)}`);
      }

      // C. ERROR — the same refusal must surface as the same `.code`.
      nextReply = { ok: false, code: 'forbidden', message: 'nope' };
      let codeReal, codeGen;
      try {
        await real[fn](...args);
      } catch (e) {
        codeReal = e.code;
      }
      try {
        await invoke(m.name, paramsFor(m, args));
      } catch (e) {
        codeGen = e.code;
      }
      if (codeReal !== codeGen || codeReal !== 'forbidden') {
        problems.push(`error mismatch: real=${codeReal} gen=${codeGen}`);
      }
    }

    if (problems.length === 0) {
      pass++;
      if (!quiet) console.log(`PASS  ${fn.padEnd(16)} ${m.name}`);
    } else {
      failures.push({ fn, name: m.name, problems });
      if (!quiet) {
        console.log(`FAIL  ${fn.padEnd(16)} ${m.name}`);
        for (const p of problems) console.log(`   - ${p}`);
      }
    }
  }
  return { pass, failures };
};

// ── the real run ───────────────────────────────────────────────────────────────
const main = async () => {
  const { pass, failures } = await checkFamily(family);

  // COVERAGE (informational, never a failure). `mounts.ts` legitimately exports far
  // more than the `spaces:*` family — mount/unmount, invites, settings — so an
  // uncovered name is a migration to-do, not drift. Printed so the gap between
  // "what the descriptors describe" and "what the module ships" stays visible.
  const covered = new Set(family.methods.map((m) => m.alias.fn));
  for (const name of Object.keys(family.types ?? {})) covered.add(name);
  const uncovered = [...pinned].filter((n) => !covered.has(n));

  console.log(`\n${pass}/${family.methods.length} methods: descriptor ≡ SHIPPED surface (export + wire + error).`);
  console.log(
    `${covered.size} of ${pinned.size} pinned \`mounts\` names described by descriptors; ` +
      `${uncovered.length} not yet covered (migration scope, not drift).`,
  );

  if (failures.length) {
    console.error(
      `\n${failures.length} descriptor(s) do not match the shipped SDK. The descriptor set is the\n` +
        `proposed single source — if it disagrees with what ships, generating from it would\n` +
        `change the public API. Fix the descriptor (or the wrapper), do not silence this.`,
    );
    process.exit(1);
  }
};

// ── --self-test: prove the gate is not vacuous ─────────────────────────────────
//
// The bug this whole script exists to fix was a check that PASSED while blind. So
// the check itself is checked: each case below is a way a descriptor set can lie,
// and each must be caught. If a future refactor makes a check inert, this fails
// loudly instead of the suite going quietly green forever.
const selfTest = async () => {
  const clone = () => JSON.parse(JSON.stringify({ ...family, methods: family.methods }));
  const cases = [
    [
      'a descriptor naming an export the SDK does not have',
      (f) => {
        f.methods[0].alias.fn = 'noSuchExportAnywhere';
      },
    ],
    [
      'a descriptor with the wrong wire method',
      (f) => {
        f.methods[0].name = 'spaces:listWrong';
      },
    ],
    [
      'a descriptor with an extra param the real wrapper does not send',
      (f) => {
        const m = f.methods.find((x) => x.alias.fn === 'getSpaceMembers');
        m.params.properties.bogus = { type: 'string' };
        m.alias.positional = ['spaceId', 'bogus'];
      },
    ],
    [
      'a descriptor that drops a param the real wrapper does send',
      (f) => {
        const m = f.methods.find((x) => x.alias.fn === 'setSpaceRole');
        m.alias.positional = ['spaceId', 'uid'];
      },
    ],
  ];

  let ok = 0;
  for (const [label, poison] of cases) {
    const f = clone();
    poison(f);
    const { failures } = await checkFamily(f, { quiet: true });
    const caught = failures.length > 0;
    console.log(`${caught ? 'PASS' : 'FAIL'}  detects: ${label}`);
    if (caught) ok++;
  }
  // …and the un-poisoned set must still be clean, or the cases above prove nothing.
  const { failures: baseline } = await checkFamily(clone(), { quiet: true });
  const baselineOk = baseline.length === 0;
  console.log(`${baselineOk ? 'PASS' : 'FAIL'}  the real descriptor set is clean (no false positives)`);

  const total = cases.length + 1;
  const got = ok + (baselineOk ? 1 : 0);
  console.log(`\n${got}/${total} self-test cases.`);
  if (got !== total) {
    console.error('\nself-test FAILED — the parity gate is not detecting drift it must detect.');
    process.exit(1);
  }
};

await (process.argv.includes('--self-test') ? selfTest() : main());
