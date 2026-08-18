#!/usr/bin/env node
// R3-274e1 step 4 — an app pinned to a PREVIOUSLY PUBLISHED SDK still receives the
// channels R3-274e touched, when the new frame is the one sending them.
//
// Why this needs to exist at all. R3-274e resolved three wire names whose two sides had
// been declaring different shapes (`fs-change`, `editor-context`, `sdk-handshake`). Every
// change was a DECLARATION change — no side sends a different byte than before — which is
// exactly the kind of claim that is easy to assert and easy to be wrong about. Apps pin
// their own SDK version (SDK_PACKAGING_SPEC §9: backwards-compatible forever), so the
// population that matters is not this working copy: it is every published version already
// out there. This drives those artifacts.
//
// Why it drives the BUILT tarball rather than this repo's `src/`. A check that
// re-implements both sides only proves its two transcriptions agree — the SDK's codegen
// verifier was green for four weeks describing a `shareSpace()` that never existed. So the
// old SDK here is the real npm tarball, unpacked, its `dist/` imported and called. The only
// thing this file supplies is the transport, and the messages — and the messages come from
// the shared fixture in `@immediately-run/sandbox-protocol/fixtures`, the same object the
// frame's and this SDK's own tests drive, so a "compatible" verdict is measured against the
// contract rather than against a sample this script made up.
//
// Two mechanical blockers, both cheap, per the `drive-the-built-sdk-in-node` memory:
//   1. tsup emits EXTENSIONLESS relative specifiers (`from "./pushChannel"`). Node's ESM
//      resolver rejects them; the sandbox's accepts them. Bridged with `registerHooks`.
//   2. The transport is NOT a load-time problem — `sandboxUtils.transport()` resolves
//      lazily inside each call, so importing is safe and only *calling* needs a transport.
//      Set the §4 discovery global.
//
// Usage:
//   node scripts/check-previous-sdk-compat.mjs                  # the default version set
//   node scripts/check-previous-sdk-compat.mjs --versions 0.44.0,0.42.0
//   node scripts/check-previous-sdk-compat.mjs --self-test      # prove it can FAIL
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WIRE_FIXTURES } from '@immediately-run/sandbox-protocol/fixtures';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/**
 * The versions an app in the wild might be pinned to.
 *
 * Both ends on purpose: the newest published version is the realistic one, and an older
 * one is the honest test of "backwards-compatible FOREVER". A single-version check would
 * pass the day compatibility broke for everything but the newest pin.
 */
const DEFAULT_VERSIONS = ['0.44.0', '0.42.0'];

/** The channels R3-274e touched. `sdk-handshake` is produced, not consumed — see below. */
const CONSUMED = ['fs-change', 'editor-context'];

// ---------------------------------------------------------------------------
// 1. The resolver bridge
// ---------------------------------------------------------------------------

let hooksRegistered = false;
const registerExtensionlessBridge = () => {
  if (hooksRegistered) return;
  hooksRegistered = true;
  registerHooks({
    resolve(spec, ctx, next) {
      if (spec.startsWith('.') && !/\.[cm]?js$/.test(spec)) {
        const p = fileURLToPath(new URL(spec, ctx.parentURL)) + '.js';
        if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true };
      }
      return next(spec, ctx);
    },
  });
};

// ---------------------------------------------------------------------------
// 2. The transport spy
// ---------------------------------------------------------------------------

/**
 * A stand-in for the sandbox runtime's transport, recording what the SDK sends and
 * letting the caller deliver what the frame would push.
 */
const makeTransport = () => {
  const handlers = new Set();
  const sent = [];
  return {
    sent,
    /** Deliver a host→app message exactly as the frame's message bus would. */
    push(type, payload) {
      for (const h of [...handlers]) h({ type, ...payload });
    },
    transport: {
      sendMessage(type, data) {
        sent.push({ type, data });
      },
      protocolRequest: async () => {
        throw new Error('no protocol requests expected in this check');
      },
      onMessage(handler) {
        handlers.add(handler);
        return { dispose: () => handlers.delete(handler) };
      },
    },
  };
};

// ---------------------------------------------------------------------------
// 3. Fetching a published SDK
// ---------------------------------------------------------------------------

/**
 * Unpack a published SDK **inside the repo**, so its bare imports (`react`) resolve up
 * into this repo's `node_modules` the way they would in a real app. Unpacking to the OS
 * temp dir instead leaves them unresolvable, which reads as a compat failure and is not.
 */
const fetchSdk = (version) => {
  const dest = join(REPO, '.compat-sdk', version);
  const distEntry = join(dest, 'package', 'dist', 'index.js');
  if (existsSync(distEntry)) return join(dest, 'package');

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  execFileSync('npm', ['pack', `@immediately-run/sdk@${version}`, '--prefer-online'], {
    cwd: dest,
    stdio: 'pipe',
  });
  const tgz = readdirSync(dest).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error(`npm pack produced no tarball for ${version}`);
  execFileSync('tar', ['xzf', tgz], { cwd: dest, stdio: 'pipe' });
  return join(dest, 'package');
};

// ---------------------------------------------------------------------------
// 4. The drive
// ---------------------------------------------------------------------------

/**
 * Import an old SDK's built modules and drive the touched channels through them.
 * Returns `{ observed, sent }` — what its consumers saw, and what it announced.
 *
 * Each version gets a fresh module registry via a cache-busting query, so version N's
 * channel singletons cannot answer for version N+1 (they are module-level `let`s; sharing
 * them would make every version after the first vacuously "compatible").
 */
const drive = async (pkgDir, version, fixtures) => {
  registerExtensionlessBridge();
  const spy = makeTransport();
  globalThis.__immediatelyRun__ = { transport: spy.transport };

  const load = (m) => import(`${pathToFileURL(join(pkgDir, 'dist', m)).href}?v=${version}`);
  const [fsMod, ctxMod, runtimeMod] = await Promise.all([
    load('onFsChange.js'),
    load('editorContext.js'),
    load('runtime.js'),
  ]);

  const observed = {};

  // Subscribe FIRST, then push — the order a real app boots in. `onChange` also replays
  // the current value immediately, so the last entry is the pushed one.
  const seenFs = [];
  fsMod.onFsChange((c) => seenFs.push(c));
  spy.push('fs-change', fixtures['fs-change']);
  observed['fs-change'] = { last: seenFs.at(-1), get: fsMod.getFsChange() };

  const seenCtx = [];
  ctxMod.onEditorContextChange((c) => seenCtx.push(c));
  spy.push('editor-context', fixtures['editor-context']);
  observed['editor-context'] = { last: seenCtx.at(-1), get: ctxMod.getEditorContext() };

  // `sdk-handshake` runs the other way: the old SDK is the PRODUCER. What matters for
  // compat is that what it announces is still something the resolved union accepts —
  // the resolution made every field optional precisely so two producers could differ.
  observed['sdk-handshake'] = runtimeMod.sdkHandshake();

  delete globalThis.__immediatelyRun__;
  return { observed, sent: spy.sent };
};

// ---------------------------------------------------------------------------
// 5. The assertions
// ---------------------------------------------------------------------------

/** Every problem with one version's behaviour, as human-readable lines (empty = pass). */
const problemsFor = (version, result, fixtures) => {
  const problems = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  for (const name of CONSUMED) {
    const seen = result.observed[name];
    if (!seen || seen.last === undefined) {
      problems.push(`${version} ${name}: no consumer fired — the push was not understood`);
      continue;
    }
    // The old SDK may surface a SUBSET (a field added after it was published is not its
    // fault, and is not a break). What would be a break is a field it DOES know going
    // missing or arriving wrong, so compare key-by-key over the keys it returned.
    for (const key of Object.keys(seen.last)) {
      if (!(key in fixtures[name])) {
        problems.push(`${version} ${name}.${key}: surfaced a key the wire does not carry`);
      } else if (!eq(seen.last[key], fixtures[name][key])) {
        problems.push(
          `${version} ${name}.${key}: got ${JSON.stringify(seen.last[key])}, wire carries ${JSON.stringify(fixtures[name][key])}`,
        );
      }
    }
    if (!eq(seen.get, seen.last)) {
      problems.push(`${version} ${name}: the pollable getter disagrees with the subscription`);
    }
  }

  // The specific R3-274e regression risk, named rather than left implicit: `epoch` is the
  // field the FRAME does not read. If a future frame stopped sending it because "nobody
  // reads it", these old SDKs are who would break.
  const fs = result.observed['fs-change']?.last;
  if (fs && fs.epoch !== fixtures['fs-change'].epoch) {
    problems.push(`${version} fs-change.epoch: an old SDK's consumers read this — it must survive`);
  }

  const hs = result.observed['sdk-handshake'];
  if (!hs || typeof hs !== 'object') {
    problems.push(`${version} sdk-handshake: produced nothing`);
  } else {
    for (const key of Object.keys(hs)) {
      if (hs[key] !== undefined && !(key in fixtures['sdk-handshake'])) {
        problems.push(`${version} sdk-handshake.${key}: announces a field outside the union`);
      }
    }
  }
  return problems;
};

// ---------------------------------------------------------------------------
// 6. Self-test — feed it poison, assert each class is caught
// ---------------------------------------------------------------------------

const SELF_TEST_CASES = [
  {
    name: 'a frame that stopped sending `epoch` (the field only old SDKs read)',
    mutate: (f) => {
      const fs = { ...f['fs-change'] };
      delete fs.epoch;
      return { ...f, 'fs-change': fs };
    },
  },
  {
    name: 'a frame that renamed a field the old SDK reads',
    mutate: (f) => ({
      ...f,
      'fs-change': { epoch: f['fs-change'].epoch, changedPaths: f['fs-change'].paths },
    }),
  },
  {
    name: 'a frame sending the wrong TYPE for a field the old SDK reads',
    mutate: (f) => ({ ...f, 'editor-context': { ...f['editor-context'], dirtyPaths: 'a.ts' } }),
  },
];

const runSelfTest = async () => {
  const version = DEFAULT_VERSIONS[0];
  const pkgDir = fetchSdk(version);
  let failures = 0;

  // The real fixture must stay clean, or every "detected" below is meaningless.
  const clean = await drive(pkgDir, `${version}-clean`, WIRE_FIXTURES);
  const cleanProblems = problemsFor(version, clean, WIRE_FIXTURES);
  if (cleanProblems.length) {
    console.log(`FAIL  the real fixture should be clean, got:\n    ${cleanProblems.join('\n    ')}`);
    failures += 1;
  } else {
    console.log('PASS  the real fixture is clean (no false positive)');
  }

  for (const [i, c] of SELF_TEST_CASES.entries()) {
    const poisoned = c.mutate(WIRE_FIXTURES);
    const res = await drive(pkgDir, `${version}-poison-${i}`, poisoned);
    const problems = problemsFor(version, res, poisoned);
    if (problems.length) {
      console.log(`PASS  detects: ${c.name}`);
    } else {
      console.log(`FAIL  MISSED: ${c.name}`);
      failures += 1;
    }
  }

  console.log(`\n${SELF_TEST_CASES.length + 1 - failures}/${SELF_TEST_CASES.length + 1} self-test cases.`);
  return failures === 0;
};

// ---------------------------------------------------------------------------
// 7. Main
// ---------------------------------------------------------------------------

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const main = async () => {
  if (process.argv.includes('--self-test')) {
    process.exit((await runSelfTest()) ? 0 : 1);
  }

  const versions = (arg('--versions') ?? DEFAULT_VERSIONS.join(',')).split(',').filter(Boolean);
  let failures = 0;

  for (const version of versions) {
    const pkgDir = fetchSdk(version);
    const result = await drive(pkgDir, version, WIRE_FIXTURES);
    const problems = problemsFor(version, result, WIRE_FIXTURES);
    if (problems.length) {
      console.log(`FAIL  @immediately-run/sdk@${version}\n    ${problems.join('\n    ')}`);
      failures += 1;
      continue;
    }
    const fs = result.observed['fs-change'].last;
    const ctx = result.observed['editor-context'].last;
    console.log(
      `PASS  @immediately-run/sdk@${version} — fs-change {${Object.keys(fs).join(', ')}}, ` +
        `editor-context {${Object.keys(ctx).join(', ')}}, ` +
        `sdk-handshake announces ${Object.keys(result.observed['sdk-handshake']).join(', ')}`,
    );
  }

  if (failures) {
    console.log(`\n${failures}/${versions.length} previously-published SDK(s) BROKEN by the current wire.`);
    process.exit(1);
  }
  console.log(
    `\n${versions.length} previously-published SDK(s) still consume the R3-274e channels, driven as real dist artifacts.`,
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
