// PROTOTYPE streaming equivalence harness — proves the GENERATED stream wrapper
// path and the HAND-WRITTEN path drive consumeStream with an identical request
// envelope, yield identical events, return identical values, and throw identical
// `.code` — i.e. the §3.2 stream projection is a no-op swap for consumers.
//
//   HAND-WRITTEN contribute (src/contribute.ts):
//     contribute(opts) → protocolStream('protocol-contribute','run',[opts])
//                       → consumeStream(transport,'protocol-contribute','run',[opts])
//   GENERATED contribute (via src/catalog.ts invokeStream):
//     contribute(opts) → invokeStream('contribute:run', opts)
//                       → split ':' → consumeStream(transport,'protocol-contribute','run',[opts])
//
//   chat is identical on both sides — src/llm.ts already calls invokeStream('llm:chat', req).
//
// Run: node scripts/codegen-prototype/verify.streams.mjs

import { family } from './descriptors.streams.mjs';

// ── faithful consumeStream (src/protocolStream.ts), over a scriptable transport ─
let lastSend = null;
function makeTransport(frames) {
  // frames: array of {kind:'event',value} | {kind:'done',value} | {kind:'error',code,message}
  let handler = null;
  return {
    send: (msg) => {
      lastSend = { type: msg.type, method: msg.method, params: msg.params };
      // deliver scripted frames on next tick, tagged with the same msgId
      queueMicrotask(() => { for (const f of frames) handler?.({ msgId: msg.msgId, stream: f }); });
    },
    subscribe: (_type, h) => { handler = h; return () => { handler = null; }; },
  };
}
class StreamError extends Error { constructor(code, message) { super(message); this.name = 'StreamError'; this.code = code; } }
let counter = 0;
async function* consumeStream(transport, type, method, params) {
  const msgId = ++counter;
  const queue = [];
  let wake = null;
  const unsub = transport.subscribe(type, (msg) => {
    if (msg.msgId !== msgId || !msg.stream) return;
    queue.push(msg.stream); const w = wake; wake = null; w?.();
  });
  try {
    transport.send({ type, method, params, msgId, stream: true });
    while (true) {
      if (queue.length === 0) { await new Promise((r) => { wake = r; }); continue; }
      const f = queue.shift();
      if (f.kind === 'event') yield f.value;
      else if (f.kind === 'done') return f.value;
      else throw new StreamError(f.code, f.message);
    }
  } finally { unsub(); }
}

// ── the two paths ─────────────────────────────────────────────────────────────
const protocolStream = (protocolName, method, params, t) => consumeStream(t, protocolName, method, params);
const split = (name) => { const i = name.indexOf(':'); return [name.slice(0, i), name.slice(i + 1)]; };
const invokeStream = (name, params, t) => { const [s, m] = split(name); return consumeStream(t, `protocol-${s}`, m, [params]); };

// hand-written wrappers (verbatim shape from src/contribute.ts / src/llm.ts)
const handWritten = {
  contribute: (opts, t) => protocolStream('protocol-contribute', 'run', [opts], t),
  chat: (req, t) => invokeStream('llm:chat', req, t), // llm.ts already uses invokeStream
};
// generated wrappers straight from descriptors (what generate.mjs emits)
const generated = {};
for (const m of family.methods) generated[m.alias.fn] = (req, t) => invokeStream(m.name, req, t);

async function drain(gen) {
  const events = [];
  let ret, code;
  try { while (true) { const r = await gen.next(); if (r.done) { ret = r.value; break; } events.push(r.value); } }
  catch (e) { code = e.code; }
  return { events, ret, code };
}

const sample = {
  contribute: { commitMessage: 'Edit post', mode: 'pr' },
  chat: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
};
const happy = {
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
const sad = [{ kind: 'error', code: 'auth-required', message: 'no provider' }];

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pass = 0, fail = 0;

for (const m of family.methods) {
  const fn = m.alias.fn;
  const req = sample[fn];

  // success path
  const h = await drain(handWritten[fn](req, makeTransport(happy[fn])));
  const sendHand = lastSend;
  const g = await drain(generated[fn](req, makeTransport(happy[fn])));
  const sendGen = lastSend;

  const wireOk = eq(sendHand, sendGen);
  const eventsOk = eq(h.events, g.events);
  const retOk = eq(h.ret, g.ret);

  // error path
  const he = await drain(handWritten[fn](req, makeTransport(sad)));
  const ge = await drain(generated[fn](req, makeTransport(sad)));
  const errOk = he.code === ge.code && ge.code === 'auth-required';

  // wire must equal what the catalog name encodes
  const [scheme, method] = m.name.split(':');
  const nameOk = sendGen.type === `protocol-${scheme}` && sendGen.method === method;

  const ok = wireOk && eventsOk && retOk && errOk && nameOk;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${fn.padEnd(12)} send=${JSON.stringify(sendGen)}  events=${g.events.length}  ret=${retOk ? 'ok' : 'DIFF'}  err=${ge.code}`,
  );
  if (!ok) { console.log('   hand:', JSON.stringify(sendHand), h); console.log('   gen :', JSON.stringify(sendGen), g); }
}

console.log(`\n${pass}/${pass + fail} stream methods: generated path ≡ hand-written path (envelope + events + return + error).`);
process.exit(fail ? 1 : 0);
