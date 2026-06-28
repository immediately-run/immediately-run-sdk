// PROTOTYPE equivalence harness — proves the GENERATED wrapper path and the
// HAND-WRITTEN wrapper path produce byte-identical host calls + identical error
// propagation, for every method in the spaces family. This is the §7 acceptance
// test ("a swap is a no-op to consumers") in runnable form.
//
// It models the two real code paths faithfully (they bottom out at the same
// primitive) WITHOUT importing the TS modules, whose load-time side effects
// (sandboxUtils transport globals, tasks.ts host listener) don't exist in node:
//
//   HAND-WRITTEN (src/mounts.ts `request`):
//     shareSpace(spaceId, login, role)
//       → request('share', { spaceId, login, role })
//       → protocolRequest('spaces', 'share', [{ spaceId, login, role }])
//       → unwrap {ok,data}; on !ok throw (Error & { code })
//
//   GENERATED (src/catalog.ts `invoke`):
//     shareSpace(spaceId, login, role)
//       → invoke('spaces:share', { spaceId, login, role })
//       → split on ':' → protocolRequest('spaces', 'share', [{ spaceId, login, role }])
//       → unwrap {ok,data}; on !ok throw (Error & { code })
//
// Run: node scripts/codegen-prototype/verify.mjs

import { family } from './descriptors.spaces.mjs';

// ── shared spy: the single host primitive both paths reach (src/sandboxUtils) ──
let lastCall = null;
let nextReply = { ok: true, data: undefined };
const protocolRequest = async (scheme, method, params) => {
  lastCall = { scheme, method, params };
  return nextReply;
};

// ── HAND-WRITTEN path: faithful copy of src/mounts.ts `request` ───────────────
const handRequest = async (method, query = {}) => {
  const res = await protocolRequest('spaces', method, [query]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'space request failed');
    err.code = res?.code ?? 'unknown';
    throw err;
  }
  return res.data;
};
// The hand-written wrappers (src/mounts.ts), verbatim in shape.
const handWritten = {
  listSpaces: (opts = {}) => handRequest('list', opts),
  listAllSpaces: () => handRequest('listAll', {}),
  getSpaceMembers: (spaceId) => handRequest('members', { spaceId }),
  shareSpace: (spaceId, login, role) => handRequest('share', { spaceId, login, role }),
  unshareSpace: (spaceId, uid) => handRequest('unshare', { spaceId, uid }),
  setSpaceRole: (spaceId, uid, role) => handRequest('setRole', { spaceId, uid, role }),
  lookupUser: (login) => handRequest('lookupUser', { login }),
  listGrants: () => handRequest('grants', {}),
  revokeGrant: (appKey, spaceId) => handRequest('revokeGrant', { appKey, spaceId }),
};

// ── GENERATED path: faithful copy of src/catalog.ts `invoke` ──────────────────
const split = (name) => {
  const i = name.indexOf(':');
  return [name.slice(0, i), name.slice(i + 1)];
};
const invoke = async (name, params = {}) => {
  const [scheme, method] = split(name);
  const res = await protocolRequest(scheme, method, [params]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `${name} failed`);
    err.code = res?.code ?? 'unknown';
    throw err;
  }
  return res.data;
};
// Build the generated wrappers straight from the descriptors (what generate.mjs emits).
const generated = {};
for (const m of family.methods) {
  const fn = m.alias.fn;
  const pos = m.alias.positional ?? [];
  if (pos.length && pos[0] !== 'opts') {
    generated[fn] = (...args) => {
      const params = Object.fromEntries(pos.map((p, i) => [p, args[i]]));
      return invoke(m.name, params);
    };
  } else if (pos[0] === 'opts') {
    generated[fn] = (opts = {}) => invoke(m.name, opts);
  } else {
    generated[fn] = () => invoke(m.name, {});
  }
}

// ── drive both with the same inputs; assert identical wire + identical throw ───
const sample = {
  listSpaces: [{ app: true }],
  listAllSpaces: [],
  getSpaceMembers: ['space:ACME'],
  shareSpace: ['space:ACME', 'octocat', 'writer'],
  unshareSpace: ['space:ACME', 'user:42'],
  setSpaceRole: ['space:ACME', 'user:42', 'reader'],
  lookupUser: ['octocat'],
  listGrants: [],
  revokeGrant: ['github__acme__app', 'space:ACME'],
};

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pass = 0;
let fail = 0;

for (const m of family.methods) {
  const fn = m.alias.fn;
  const args = sample[fn];

  // 1) success path — identical wire call?
  nextReply = { ok: true, data: { marker: fn } };
  await handWritten[fn](...args);
  const wireHand = lastCall;
  await generated[fn](...args);
  const wireGen = lastCall;
  const wireOk = eq(wireHand, wireGen);

  // 2) error path — identical thrown code?
  nextReply = { ok: false, code: 'forbidden', message: 'nope' };
  let codeHand, codeGen;
  try { await handWritten[fn](...args); } catch (e) { codeHand = e.code; }
  try { await generated[fn](...args); } catch (e) { codeGen = e.code; }
  const errOk = codeHand === codeGen && codeHand === 'forbidden';

  // 3) the wire scheme/method must equal what the catalog name encodes
  const [scheme, method] = m.name.split(':');
  const nameOk = wireGen.scheme === scheme && wireGen.method === method;

  const ok = wireOk && errOk && nameOk;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${fn.padEnd(16)} wire=${JSON.stringify(wireGen.params[0])}`,
  );
  if (!ok) {
    console.log('   hand:', JSON.stringify(wireHand));
    console.log('   gen :', JSON.stringify(wireGen));
    console.log('   err  hand/gen:', codeHand, codeGen);
  }
}

console.log(`\n${pass}/${pass + fail} methods: generated path ≡ hand-written path (wire + error).`);
process.exit(fail ? 1 : 0);
