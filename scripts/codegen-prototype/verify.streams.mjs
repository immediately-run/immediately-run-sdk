// The §7 acceptance test for the STREAM family (`contribute:run`, `llm:chat`):
// does generating from the descriptor set produce the SHIPPED surface?
//
// Same fix as `verify.mjs`, and this one was further gone. The previous version
// re-implemented BOTH wrappers *and* `consumeStream` itself — ~20 lines of
// hand-copied generator/queue/msgId logic — so a green run proved only that two
// transcriptions in one file agreed. It could not observe the real stream
// machinery at all, and it is the machinery that carries the interesting
// behaviour: msgId tagging, frame filtering, the terminal done/error mapping, and
// the `finally` that unsubscribes and sends the host a cancel frame.
//
// It now drives the real artifacts:
//   - the shipped wrappers, from the built `dist/contribute.js` + `dist/llm.js`;
//   - the generated path's `invokeStream()`, from the built `dist/catalog.js`;
//   - the real `consumeStream` underneath both, exercised over a scripted transport
//     installed at the §4 discovery global (`globalThis.__immediatelyRun__`) — the
//     same seam the SDK uses in production, not a stand-in for it.
//
// Run: node scripts/codegen-prototype/verify.streams.mjs [--self-test]
//      (requires `npm run build`)

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { family } from './descriptors.streams.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');

if (!existsSync(resolve(dist, 'contribute.js'))) {
  console.error('error: dist/ not built — run `npm run build` first.');
  process.exit(1);
}

// NO RESOLVE HOOK HERE, deliberately — see the note in verify.mjs. R3-495 makes
// the built dist importable by node's own resolver, so this harness reads it the
// way a consumer does. Do not reintroduce the hook.

// ── the scripted host, installed where the SDK really looks for it ─────────────
//
// `sendMessage`/`addListener` (sandboxUtils) resolve `transport()` lazily, so
// installing the §4 global is enough — no module patching. Frames are delivered
// on a microtask, tagged with the msgId the SDK chose, exactly as the host's
// `pumpGenerator` does.
const sent = [];
let script = [];
const listeners = new Set();
globalThis.__immediatelyRun__ = {
  transport: {
    protocolRequest: async () => ({ ok: true, data: undefined }),
    onMessage(handler) {
      listeners.add(handler);
      return { dispose: () => listeners.delete(handler) };
    },
    sendMessage(type, data) {
      sent.push({ type, method: data?.method, params: data?.params, cancel: data?.cancel === true });
      if (data?.cancel) return; // a cancel frame ends the exchange; nothing to reply
      queueMicrotask(() => {
        for (const frame of script) {
          for (const h of [...listeners]) h({ type, msgId: data?.msgId, stream: frame });
        }
      });
    },
  },
};

const real = {
  contribute: (await import(pathToFileURL(resolve(dist, 'contribute.js')).href)).contribute,
  chat: (await import(pathToFileURL(resolve(dist, 'llm.js')).href)).chat,
};
const { invokeStream } = await import(pathToFileURL(resolve(dist, 'catalog.js')).href);

// ── frames + sample requests ───────────────────────────────────────────────────
const HAPPY = {
  contribute: [
    { kind: 'event', value: { stage: 'diff-compute' } },
    { kind: 'event', value: { stage: 'create-pr' } },
    { kind: 'done', value: { commitSha: 'abc', treeSha: 't', branchName: 'b', mode: 'new-branch-pr', prUrl: 'u' } },
  ],
  chat: [
    { kind: 'event', value: { type: 'text-delta', text: 'he' } },
    { kind: 'event', value: { type: 'text-delta', text: 'llo' } },
    { kind: 'done', value: { stopReason: 'end' } },
  ],
};
const SAD = [{ kind: 'error', code: 'auth-required', message: 'no provider' }];
const SAMPLE = {
  contribute: { commitMessage: 'Edit post', mode: 'pr' },
  chat: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
};

// Undefined-aware (see verify.mjs): plain stringify omits undefined-valued keys,
// which would hide a param the real wrapper sends and the generated one drops.
const canon = (v) => JSON.stringify(v, (_k, val) => (val === undefined ? '\u0000undefined' : val));
const eq = (a, b) => canon(a) === canon(b);

/** Run one generator to completion over `frames`; capture wire + events + return + code. */
const drive = async (makeGen, frames) => {
  script = frames;
  sent.length = 0;
  const events = [];
  let ret, code;
  try {
    const gen = makeGen();
    while (true) {
      const r = await gen.next();
      if (r.done) {
        ret = r.value;
        break;
      }
      events.push(r.value);
    }
  } catch (e) {
    code = e.code;
  }
  // The request frame is the first send; a trailing cancel (early break) would follow.
  return { wire: sent[0], events, ret, code, sends: sent.length };
};

const checkFamily = async (fam, { quiet = false } = {}) => {
  const failures = [];
  let pass = 0;

  for (const m of fam.methods) {
    const fn = m.alias.fn;
    const problems = [];
    const req = SAMPLE[fn];

    // A. SURFACE — the descriptor must name a wrapper the SDK actually ships.
    if (typeof real[fn] !== 'function') {
      problems.push(`no such export in the built SDK (dist/${fn === 'chat' ? 'llm' : fn}.js)`);
    } else {
      // B. ENVELOPE + EVENTS + RETURN, real wrapper vs. generated invokeStream.
      const r = await drive(() => real[fn](req), HAPPY[fn]);
      const g = await drive(() => invokeStream(m.name, req), HAPPY[fn]);
      if (!eq(r.wire, g.wire)) {
        problems.push(`envelope mismatch\n     real: ${JSON.stringify(r.wire)}\n     gen : ${JSON.stringify(g.wire)}`);
      }
      if (!eq(r.events, g.events)) problems.push(`events mismatch`);
      if (!eq(r.ret, g.ret)) problems.push(`return mismatch`);

      // C. ERROR — an error frame must surface as the same `.code` on both.
      const re = await drive(() => real[fn](req), SAD);
      const ge = await drive(() => invokeStream(m.name, req), SAD);
      if (re.code !== ge.code || re.code !== 'auth-required') {
        problems.push(`error mismatch: real=${re.code} gen=${ge.code}`);
      }

      // D. The envelope must be what the catalog NAME encodes — this is the
      //    descriptor's claim about the wire, checked against the real send.
      const [scheme, method] = m.name.split(':');
      if (r.wire?.type !== `protocol-${scheme}` || r.wire?.method !== method) {
        problems.push(
          `descriptor name '${m.name}' implies ${`protocol-${scheme}`}/${method}, ` +
            `real sends ${r.wire?.type}/${r.wire?.method}`,
        );
      }
    }

    if (problems.length === 0) {
      pass++;
      if (!quiet) console.log(`PASS  ${fn.padEnd(12)} ${m.name}`);
    } else {
      failures.push({ fn, problems });
      if (!quiet) {
        console.log(`FAIL  ${fn.padEnd(12)} ${m.name}`);
        for (const p of problems) console.log(`   - ${p}`);
      }
    }
  }
  return { pass, failures };
};

/**
 * A shipped behaviour the descriptors do not model, pinned here because the
 * migration must replicate it: `chat({ …, signal })` PEELS `signal` off before the
 * request becomes wire params (`src/llm.ts`) — an `AbortSignal` cannot cross
 * postMessage as data; it drives the SDK-side cancel frame instead.
 *
 * A wrapper generated naively as `invokeStream(name, req)` would put it on the
 * wire. So this is a constraint on the §3.2 stream projection, not a curiosity:
 * either the descriptor grows a notion of client-only params, or the projection
 * hard-codes the peel. Failing here is the reminder.
 */
const checkSignalIsNotWireData = async () => {
  const ac = new AbortController();
  const r = await drive(() => real.chat({ ...SAMPLE.chat, signal: ac.signal }), HAPPY.chat);
  const wireParams = r.wire?.params?.[0] ?? {};
  const leaked = Object.prototype.hasOwnProperty.call(wireParams, 'signal');
  console.log(
    `${leaked ? 'FAIL' : 'PASS'}  chat() keeps \`signal\` OFF the wire ` +
      `(the generated projection must replicate this peel)`,
  );
  return !leaked;
};

// ── the real run ───────────────────────────────────────────────────────────────
const main = async () => {
  const { pass, failures } = await checkFamily(family);
  const signalOk = await checkSignalIsNotWireData();
  console.log(
    `\n${pass}/${family.methods.length} stream methods: descriptor ≡ SHIPPED surface ` +
      `(envelope + events + return + error), through the REAL consumeStream.`,
  );
  if (failures.length || !signalOk) {
    console.error(
      `\n${failures.length} stream descriptor(s) do not match the shipped SDK. Generating from\n` +
        `them would change the public API — fix the descriptor (or the wrapper).`,
    );
    process.exit(1);
  }
};

// ── --self-test: prove the gate is not vacuous ─────────────────────────────────
const selfTest = async () => {
  const clone = () => JSON.parse(JSON.stringify(family));
  const cases = [
    [
      'a descriptor naming a wrapper the SDK does not export',
      (f) => {
        f.methods[0].alias.fn = 'noSuchStreamExport';
      },
    ],
    [
      'a descriptor with the wrong wire scheme',
      (f) => {
        f.methods[0].name = f.methods[0].name.replace(/^[^:]+/, 'wrongscheme');
      },
    ],
    [
      'a descriptor with the wrong wire method',
      (f) => {
        f.methods[0].name = f.methods[0].name.replace(/:[^:]+$/, ':wrongMethod');
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
  const { failures: baseline } = await checkFamily(clone(), { quiet: true });
  const baselineOk = baseline.length === 0;
  console.log(`${baselineOk ? 'PASS' : 'FAIL'}  the real descriptor set is clean (no false positives)`);

  // The signal-peel constraint is only worth asserting if the NAIVE generated
  // form actually violates it. Prove the hazard is real rather than theoretical:
  // `invokeStream(name, req)` with a signal in `req` must put it on the wire.
  const ac = new AbortController();
  const naive = await drive(() => invokeStream('llm:chat', { ...SAMPLE.chat, signal: ac.signal }), HAPPY.chat);
  const naiveLeaks = Object.prototype.hasOwnProperty.call(naive.wire?.params?.[0] ?? {}, 'signal');
  console.log(
    `${naiveLeaks ? 'PASS' : 'FAIL'}  the naive generated form DOES leak \`signal\` ` +
      `(so pinning the peel is meaningful)`,
  );

  const total = cases.length + 2;
  const got = ok + (baselineOk ? 1 : 0) + (naiveLeaks ? 1 : 0);
  console.log(`\n${got}/${total} self-test cases.`);
  if (got !== total) {
    console.error('\nself-test FAILED — the stream parity gate is not detecting drift it must detect.');
    process.exit(1);
  }
};

await (process.argv.includes('--self-test') ? selfTest() : main());
