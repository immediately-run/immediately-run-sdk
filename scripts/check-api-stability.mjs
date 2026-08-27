#!/usr/bin/env node
/*
 * Guard the SDK's public API against accidental breaking changes
 * (SDK_PACKAGING_SPEC §9). A pinned/forked app rides a specific SDK version
 * forever (UI_AS_APPS §0/§7 forkability, core value #4); if a later release
 * silently shrinks the API, every fork that used the missing piece breaks.
 *
 * The check extracts the public surface from the built `.d.ts` files and compares
 * it to a committed snapshot (`api-snapshot.json`).
 *
 *   - Something present in the snapshot but gone now → BREAKING → fail, unless it
 *     is a DOCUMENTED removal in `api-removals.json` (see "escape hatch" below).
 *   - Anything new → additive → fail with "run `npm run api:update`" so the
 *     snapshot stays authoritative and every API change is reviewed in the diff.
 *
 * ── R3-261: the surface is a SHAPE, not a list of names ───────────────────────
 * This gate used to compare exported NAMES scraped with a regex. An interface
 * keeps its name while losing a field; a function keeps its name while losing a
 * parameter; a union alias keeps its name while losing a member. Each of those
 * breaks a pinned consumer at compile time exactly as a removed export does, and
 * every one of them kept this gate green. The surface is now extracted
 * structurally with the TypeScript compiler API (`scripts/lib/dts-shape.mjs`,
 * generalised from the R3-166 prototype at
 * `scripts/codegen-prototype/verify.types.mjs`) and each export is recorded as a
 * one-line SHAPE — see that module for the vocabulary and its deliberate limits.
 *
 * ── The escape hatch (`api-removals.json`) ────────────────────────────────────
 * A gate with no legitimate way to retire something gets deleted the first time
 * someone genuinely needs to retire something. So a removal is allowed when it is
 * written down: an entry naming the module, the export, the specific thing lost,
 * and a REASON. That makes a deliberate break land in two reviewed diffs — the
 * ledger entry and the snapshot — instead of being invisible in either.
 * `--update` refuses to write a snapshot that drops something undocumented, so
 * "just re-run api:update" is not a way past the gate.
 *
 * Usage: node scripts/check-api-stability.mjs [--update] [--self-test]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeContext, surfaceOf } from './lib/dts-shape.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const snapshotPath = join(root, 'api-snapshot.json');
const removalsPath = join(root, 'api-removals.json');
const update = process.argv.includes('--update');

const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

// ── Extract the current surface ───────────────────────────────────────────────

/** Every module's exported shapes, keyed by the module path a consumer imports. */
const extractSurface = (dir) => {
  const files = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      // .d.cts is the CJS duplicate of the .d.ts beside it — same surface.
      else if (entry.name.endsWith('.d.ts')) files.push(p);
    }
  };
  walk(dir);
  const ctx = makeContext({ root, onError: fail });
  const out = {};
  for (const file of files) {
    const key = relative(dir, file).replace(/\.d\.ts$/, '');
    const surface = surfaceOf(file, ctx);
    if (surface.size) out[key] = Object.fromEntries([...surface].sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return out;
};

// ── Compare two surfaces ──────────────────────────────────────────────────────

/** Split a shape body on `sep` at bracket depth 0 (`{a, b}` stays one item). */
const splitTop = (body, sep) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

/** `interface(a, b?)` → `{ kind:'interface', items:['a','b?'] }`; free-text
 *  shapes (`alias(...)`, `const(...)`) carry `items:null` and are compared whole. */
const parseShape = (shape) => {
  const m = /^(\w+)\((.*)\)$/s.exec(shape ?? '');
  if (!m) return { kind: shape ?? 'unknown', items: null, body: '' };
  const [, kind, body] = m;
  if (kind === 'interface' || kind === 'object' || kind === 'class' || kind === 'enum') {
    return { kind, items: splitTop(body, ','), body };
  }
  if (kind === 'union') return { kind, items: splitTop(body, '|'), body };
  // A const whose TYPE is an unambiguous member list — `const({A, B, C})`, which is
  // what a `Record`-shaped frozen table (`WIRE_NAMES`) prints as — is comparable
  // member-by-member like an object, so GROWING it is additive. Without this it fell
  // into the free-text arm below and every added member read as a removal: the first
  // wire name added after R3-261 reported the whole 60-name table as BREAKING, and the
  // only way past would have been an api-removals.json entry recording a removal that
  // never happened — permanent history, deliberately falsified, to describe an addition.
  // A gate people have to lie to is a gate that gets deleted. Any other const type
  // stays free-text and conservative.
  if (kind === 'const' && /^\{[^{}]*\}$/.test(body.trim())) {
    return { kind, items: splitTop(body.trim().slice(1, -1), ','), body };
  }
  return { kind, items: null, body };
};

/**
 * Classify one export's shape change.
 * Returns `{ breaking: string[], additive: string[] }` — `breaking` lists the
 * specific things a pinned consumer loses.
 */
const diffShape = (was, now) => {
  if (was === now) return { breaking: [], additive: [] };
  const a = parseShape(was);
  const b = parseShape(now);
  if (a.kind !== b.kind) return { breaking: [`${a.kind} → ${b.kind}`], additive: [] };

  if (a.kind === 'fn') {
    // `r..t`: MORE required parameters, or FEWER accepted, narrows the callable
    // surface. Fewer required / more optional widens it and breaks nobody.
    const [ar, at] = a.body.split('..').map(Number);
    const [br, bt] = b.body.split('..').map(Number);
    const breaking = [];
    if (br > ar) breaking.push(`now requires ${br} parameters (was ${ar})`);
    if (bt < at) breaking.push(`now accepts ${bt} parameters (was ${at})`);
    return breaking.length ? { breaking, additive: [] } : { breaking: [], additive: [`arity ${a.body} → ${b.body}`] };
  }

  if (a.items === null || b.items === null) {
    // A free-text type (`alias(Record<string, X>)`, `const(string)`) changed. We
    // cannot tell widening from narrowing without a type checker, so this is
    // treated as breaking — deliberately conservative: the cost of being wrong is
    // one documented ledger entry, and the cost the other way is a shipped break.
    return { breaking: [`${a.kind} type changed: ${a.body || was} → ${b.body || now}`], additive: [] };
  }

  const now_ = new Set(b.items);
  const was_ = new Set(a.items);
  const lost = a.items.filter((i) => !now_.has(i));
  const gained = b.items.filter((i) => !was_.has(i));
  // A flipped optionality shows up as BOTH a loss and a gain (`b?` → `b`), which
  // is the right answer: either direction breaks somebody (a reader loses a
  // guarantee; an object literal loses a permitted omission).
  return { breaking: lost.map((i) => `${a.kind === 'union' ? 'union member' : 'member'} \`${i}\``), additive: gained };
};

/**
 * Exports whose const TYPE is expected to change on an ordinary release, so a change
 * to it is not a surface break to report.
 *
 * `SDK_VERSION` is generated FROM `package.json` by `gen-version.mjs`, so its literal
 * type differs on every single version bump — `const("0.52.0")` → `const("0.53.0")`.
 * Left in the general (conservative) arm it made every release fail the gate as
 * "the public surface SHRANK", with the only route past being three
 * `api-removals.json` entries per release describing removals that never happened.
 * That ledger is permanent history of DELIBERATE removals with a reason; filling it
 * with release bookkeeping empties it of meaning, and a gate people must lie to is a
 * gate that gets deleted.
 *
 * The narrow claim being made: nobody can pin against this value structurally in a
 * way worth protecting — reading it is the whole point, and it changing is the whole
 * point. Its EXISTENCE and kind are still guarded; only the literal is exempt.
 */
const VALUE_CHANGES_EVERY_RELEASE = new Set(['SDK_VERSION']);

/** Full diff: `{ breaking: Finding[], additive: string[] }`. */
const diffSurfaces = (snapshot, current) => {
  const breaking = [];
  const additive = [];
  for (const [mod, exports] of Object.entries(snapshot)) {
    const now = current[mod];
    for (const [name, shape] of Object.entries(exports)) {
      if (!now || !(name in now)) {
        breaking.push({ module: mod, export: name, detail: 'the export itself' });
        continue;
      }
      const d = diffShape(shape, now[name]);
      const releaseNoise =
        VALUE_CHANGES_EVERY_RELEASE.has(name) &&
        parseShape(shape).kind === 'const' &&
        parseShape(now[name]).kind === 'const';
      if (!releaseNoise) for (const detail of d.breaking) breaking.push({ module: mod, export: name, detail });
      for (const a of d.additive) additive.push(`${mod}: ${name} — ${a}`);
    }
  }
  for (const [mod, exports] of Object.entries(current)) {
    const was = snapshot[mod] ?? {};
    for (const name of Object.keys(exports)) if (!(name in was)) additive.push(`${mod}: ${name} (new export)`);
  }
  return { breaking, additive };
};

// ── The documented-removal ledger ─────────────────────────────────────────────

const loadRemovals = () => {
  if (!existsSync(removalsPath)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(removalsPath, 'utf8'));
  } catch (e) {
    fail(`api-removals.json is not valid JSON: ${e.message}`);
  }
  const entries = Array.isArray(parsed) ? parsed : parsed.removals;
  if (!Array.isArray(entries)) fail('api-removals.json must be `{ "removals": [ … ] }`.');
  entries.forEach((e, i) => {
    for (const k of ['module', 'export', 'detail', 'reason']) {
      if (typeof e?.[k] !== 'string' || !e[k].trim()) {
        fail(
          `api-removals.json[${i}] is missing a non-empty "${k}". A removal without a stated reason is not a documented removal.`,
        );
      }
    }
  });
  return entries;
};

const isDocumented = (finding, removals) =>
  removals.some((r) => r.module === finding.module && r.export === finding.export && r.detail === finding.detail);

const ledgerEntryFor = (f) =>
  JSON.stringify({
    module: f.module,
    export: f.export,
    detail: f.detail,
    reason: '<why this is deliberate>',
    date: '<YYYY-MM-DD>',
  });

const reportBreaking = (undocumented) => {
  console.error('✗ BREAKING: the public surface SHRANK since the snapshot:\n');
  for (const f of undocumented) console.error(`  - ${f.module}: ${f.export} — lost ${f.detail}`);
  console.error(
    '\nThe SDK public API is additive-only (SDK_PACKAGING_SPEC §9) so pinned forks keep\n' +
      'working: removing an export, a field, a union member, or a parameter all break a\n' +
      'pinned consumer at compile time. Deprecate instead of removing.\n' +
      '\nIf a removal IS deliberate, document it in api-removals.json — one entry each,\n' +
      'with a reason — then run `npm run api:update`:\n',
  );
  for (const f of undocumented) console.error(`  ${ledgerEntryFor(f)},`);
};

// ── Modes ─────────────────────────────────────────────────────────────────────

const loadSnapshot = () => {
  if (!existsSync(snapshotPath)) fail('api-snapshot.json missing — run `npm run api:update` and commit it.');
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const legacy = Object.values(snapshot).find((v) => Array.isArray(v));
  if (legacy) {
    fail(
      'api-snapshot.json is in the pre-R3-261 names-only format (module → string[]).\n' +
        "       The snapshot now records each export's SHAPE (module → {name: shape}).\n" +
        '       Run `npm run api:update` and review the regenerated file.',
    );
  }
  return snapshot;
};

const counts = (surface) => ({
  modules: Object.keys(surface).length,
  exports: Object.values(surface).reduce((n, o) => n + Object.keys(o).length, 0),
});

const runUpdate = (current) => {
  if (existsSync(snapshotPath)) {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    if (!Object.values(snapshot).some((v) => Array.isArray(v))) {
      const { breaking } = diffSurfaces(snapshot, current);
      const undocumented = breaking.filter((f) => !isDocumented(f, loadRemovals()));
      if (undocumented.length) {
        // Without this, `npm run api:update` would be a one-command bypass of the
        // whole gate — the exact way a check like this gets quietly neutralised.
        console.error('✗ refusing to update: this snapshot would DROP things not documented in api-removals.json:\n');
        for (const f of undocumented) console.error(`  - ${f.module}: ${f.export} — ${f.detail}`);
        console.error('\nAdd an entry per line above to api-removals.json (with a reason), then re-run:\n');
        for (const f of undocumented) console.error(`  ${ledgerEntryFor(f)},`);
        process.exit(1);
      }
    }
  }
  writeFileSync(snapshotPath, JSON.stringify(current, null, 2) + '\n');
  const { modules, exports } = counts(current);
  console.log(`✓ Wrote api-snapshot.json (${modules} modules, ${exports} exports with shapes).`);
};

const runCheck = (current) => {
  const snapshot = loadSnapshot();
  const removals = loadRemovals();
  const { breaking, additive } = diffSurfaces(snapshot, current);
  const undocumented = breaking.filter((f) => !isDocumented(f, removals));
  const documented = breaking.filter((f) => isDocumented(f, removals));

  if (documented.length) {
    console.log('· documented removals (api-removals.json):');
    for (const f of documented) console.log(`  - ${f.module}: ${f.export} — ${f.detail}`);
  }
  if (undocumented.length) {
    reportBreaking(undocumented);
    process.exit(1);
  }
  if (documented.length || additive.length) {
    if (additive.length) {
      console.error('\n✗ Public surface additions are not in the snapshot:\n');
      for (const a of additive) console.error(`  + ${a}`);
    }
    console.error('\nAdditive changes are fine — run `npm run api:update` and commit the snapshot.');
    process.exit(1);
  }
  const { modules, exports } = counts(current);
  console.log(`✓ Public API matches the snapshot (${exports} exports across ${modules} modules, shape-compared).`);
};

// ── --self-test ───────────────────────────────────────────────────────────────
//
// House convention (verify-no-dev-prf-bypass.js, check-memory-status.mjs, the
// R3-166 gates): a gate proves it can fail. These cases run the REAL pipeline —
// a `.d.ts` on disk through the real extractor and the real diff — because the
// thing that was broken before R3-261 was the extractor, not the comparison.

const BASE_DTS = `
interface Member {
    grantee: string;
    role: 'owner' | 'writer' | 'reader';
    principal?: string;
    invitedAt?: number;
}
type Role = 'owner' | 'writer' | 'reader';
type Handler = (a: string, b?: number) => void;
declare const listMembers: (spaceId: string, opts?: { limit: number }) => Promise<Member[]>;
declare const VERSION: string;
declare const WIRE: { A: string; B: string };
declare const SDK_VERSION: '1.0.0';
export { type Handler, type Member, type Role, SDK_VERSION, VERSION, WIRE, listMembers };
`;

const withTempDts = (code, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'api-shape-'));
  try {
    writeFileSync(join(dir, 'index.d.ts'), code);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const selfTest = () => {
  const base = withTempDts(BASE_DTS, extractSurface);

  const cases = [
    [
      'a REMOVED export',
      BASE_DTS.replace('VERSION, listMembers', 'listMembers').replace('declare const VERSION: string;\n', ''),
    ],
    ['a DROPPED interface field', BASE_DTS.replace('    principal?: string;\n', '')],
    ['an optional field made REQUIRED', BASE_DTS.replace('principal?: string;', 'principal: string;')],
    ['a required field made OPTIONAL', BASE_DTS.replace('grantee: string;', 'grantee?: string;')],
    [
      'a DROPPED union member',
      BASE_DTS.replace("type Role = 'owner' | 'writer' | 'reader';", "type Role = 'owner' | 'writer';"),
    ],
    [
      'a DROPPED function parameter',
      BASE_DTS.replace('(spaceId: string, opts?: { limit: number })', '(spaceId: string)'),
    ],
    ['an optional parameter made REQUIRED', BASE_DTS.replace('opts?: { limit: number }', 'opts: { limit: number }')],
    [
      'a DROPPED parameter on a function-typed alias',
      BASE_DTS.replace('(a: string, b?: number) => void', '(a: string) => void'),
    ],
    ['a changed const type', BASE_DTS.replace('declare const VERSION: string;', 'declare const VERSION: number;')],
    [
      'a const member-table that LOST a member',
      BASE_DTS.replace('declare const WIRE: { A: string; B: string };', 'declare const WIRE: { A: string };'),
    ],
    [
      'a version-exempt export that stops being a const entirely',
      // The exemption is for the VALUE changing, not for the export dissolving.
      BASE_DTS.replace("declare const SDK_VERSION: '1.0.0';", 'declare function SDK_VERSION(): string;'),
    ],
    [
      'a version-exempt export being REMOVED',
      BASE_DTS.replace('SDK_VERSION, VERSION', 'VERSION').replace("declare const SDK_VERSION: '1.0.0';\n", ''),
    ],
  ];

  let ok = 0;
  for (const [label, code] of cases) {
    const { breaking } = diffSurfaces(base, withTempDts(code, extractSurface));
    const caught = breaking.length > 0;
    console.log(`${caught ? 'PASS' : 'FAIL'}  detects: ${label}`);
    if (caught) ok++;
  }

  // The other half of the contract: additive changes are NOT reported as breaking,
  // or the gate becomes noise that gets silenced.
  const additiveCases = [
    ['a NEW export', BASE_DTS.replace('export {', 'declare const extra: () => void;\nexport { extra,')],
    ['a NEW optional field', BASE_DTS.replace('invitedAt?: number;', 'invitedAt?: number;\n    note?: string;')],
    [
      'a NEW union member',
      BASE_DTS.replace(
        "type Role = 'owner' | 'writer' | 'reader';",
        "type Role = 'owner' | 'writer' | 'reader' | 'admin';",
      ),
    ],
    [
      'a NEW optional parameter',
      BASE_DTS.replace('opts?: { limit: number }', 'opts?: { limit: number }, extra?: string'),
    ],
    // R3-191: adding a wire name grows the frozen `WIRE_NAMES` table. That is additive
    // for every pinned consumer — nobody loses an export — and must not read as a
    // removal, or the removals ledger fills up with additions.
    [
      'a const member-table that GAINED a member',
      BASE_DTS.replace(
        'declare const WIRE: { A: string; B: string };',
        'declare const WIRE: { A: string; B: string; C: string };',
      ),
    ],
  ];
  // `SDK_VERSION` is generated from package.json, so its literal type changes on every
  // release. That must be neither breaking NOR reported as an additive change to review.
  {
    const bumped = withTempDts(
      BASE_DTS.replace("declare const SDK_VERSION: '1.0.0';", "declare const SDK_VERSION: '1.1.0';"),
      extractSurface,
    );
    const { breaking, additive } = diffSurfaces(base, bumped);
    const quiet = breaking.length === 0 && additive.length === 0;
    console.log(`${quiet ? 'PASS' : 'FAIL'}  allows (silently): an ordinary SDK_VERSION bump`);
    if (quiet) ok++;
    else console.log(`   - reported: ${breaking.map((f) => f.detail).join('; ')}${additive.join('; ')}`);
  }
  for (const [label, code] of additiveCases) {
    const { breaking, additive } = diffSurfaces(base, withTempDts(code, extractSurface));
    const good = breaking.length === 0 && additive.length > 0;
    console.log(`${good ? 'PASS' : 'FAIL'}  allows (additive, not breaking): ${label}`);
    if (good) ok++;
    else if (breaking.length)
      console.log(`   - wrongly reported breaking: ${breaking.map((f) => f.detail).join('; ')}`);
  }

  // And the escape hatch: a documented removal stops being a hard failure — but
  // only the exact one that was documented.
  const dropped = withTempDts(BASE_DTS.replace('    principal?: string;\n', ''), extractSurface);
  const { breaking } = diffSurfaces(base, dropped);
  const ledger = breaking.map((f) => ({ ...f, reason: 'test', date: '2026-08-27' }));
  const covered = breaking.every((f) => isDocumented(f, ledger));
  const notCovered = breaking.some((f) => isDocumented(f, [{ ...ledger[0], detail: 'something else' }]));
  console.log(
    `${
      covered && !notCovered ? 'PASS' : 'FAIL'
    }  escape hatch: an api-removals.json entry covers exactly its own removal`,
  );
  if (covered && !notCovered) ok++;

  // ── Blind spots, asserted rather than assumed ───────────────────────────────
  // These are the documented limits of the shape vocabulary (see lib/dts-shape.mjs):
  // MEMBER and PARAMETER types are not compared, because recording every printed
  // type is what turns the snapshot into the unreadable wall this format exists to
  // avoid — and a type-widening false positive is how a gate gets silenced. They
  // are asserted so the limit cannot rot into folklore: if one of these starts
  // being caught, the extractor got stronger — delete the case and update the
  // "Deliberate limit" comment in lib/dts-shape.mjs.
  const blindSpots = [
    ['a field whose TYPE changed', BASE_DTS.replace('principal?: string;', 'principal?: number;')],
    ['a field dropped inside a nested object type', BASE_DTS.replace('opts?: { limit: number }', 'opts?: {}')],
  ];
  for (const [label, code] of blindSpots) {
    const { breaking } = diffSurfaces(base, withTempDts(code, extractSurface));
    const stillBlind = breaking.length === 0;
    console.log(`${stillBlind ? 'PASS' : 'FAIL'}  known blind spot, unchanged (by design): ${label}`);
    if (stillBlind) ok++;
    else console.log('   - now DETECTED: strengthen is welcome — update the documented limits and drop this case.');
  }

  // +1 escape hatch, +1 the inline SDK_VERSION-bump case above.
  const total = cases.length + additiveCases.length + blindSpots.length + 2;
  console.log(`\n${ok}/${total} self-test cases.`);
  if (ok !== total) {
    console.error('\nself-test FAILED — the API-stability gate is not detecting breakage it must detect.');
    process.exit(1);
  }
};

// ── Entry ─────────────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  if (!existsSync(distDir)) fail('dist/ not found — run `npm run build` first.');
  const current = extractSurface(distDir);
  if (update) runUpdate(current);
  else runCheck(current);
}
