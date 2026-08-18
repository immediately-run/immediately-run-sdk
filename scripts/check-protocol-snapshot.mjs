#!/usr/bin/env node
/*
 * Freeze the sandbox↔SDK WIRE VOCABULARY (PLATFORM_LAYERING_SPEC §2 / S1, Phase 1,
 * roadmap R3-274). Sibling of `check-api-stability.mjs`: that one guards the *module*
 * export surface, this one guards the *wire* surface — every message name the SDK
 * speaks to the sandbox frame, and the PAYLOAD SHAPE it speaks under that name.
 *
 * WHY SHAPE AND NOT JUST NAME. The known live drift is `fs-change`: one wire name
 * carrying two different payload shapes (sandbox side vs. the SDK's `paths`/`epoch`
 * shape). A name-only snapshot would have blessed it green. So every entry records
 * fields + types + optionality, and a change to any of them fails.
 *
 *   - A name in the snapshot but not in the source  → REMOVED/RENAMED → fail.
 *   - A name whose recorded shape no longer matches → RESHAPED       → fail.
 *   - A name in the source but not in the snapshot  → ADDITIVE       → fail with
 *     "run `npm run protocol:update`", so every wire change is reviewed in a diff.
 *
 * Usage: node scripts/check-protocol-snapshot.mjs [--self-test]
 *
 * ── Where the snapshot comes from (R3-274b1) ──────────────────────────────────
 * `@immediately-run/sandbox-protocol/snapshots/sdk` — the PUBLISHED contract,
 * generated from the descriptor set that owns the wire. There is no `--update` any
 * more, and that is the point: this repo can no longer bless its own wire change by
 * rewriting a local file. A change goes descriptors → publish → bump the pin here.
 *
 * Iterating on an unpublished change: link a local checkout of the package
 * (`npm link @immediately-run/sandbox-protocol`) and this reads whatever it resolves
 * to. No env-var bypass exists, deliberately — a bypass would be reachable in CI.
 *
 * ── SNAPSHOT FORMAT (protocol-snapshot.json, formatVersion 1) ──────────────────
 * The sandbox repo lands the same file in the same format (roadmap R3-274a), and
 * Phase 3 (R3-274b) regenerates BOTH from one descriptor set — so this shape is a
 * cross-repo contract, not a local detail. Keys are sorted; two snapshots are
 * compared field-by-field by the R3-274a divergence audit.
 *
 * {
 *   "formatVersion": 1,
 *   "repo": "<npm package name of the side this snapshot describes>",
 *   "channels": {                       // keyed by the WIRE NAME, as it appears in `msg.type`
 *     "<wire-name>": {
 *       "kind":      "message"          // one-way `sendMessage` / `addListener`
 *                  | "push"             // host→app state push (SDK `createPushChannel`)
 *                  | "poll"             // the `request-*` twin of a push channel
 *                  | "request"          // `protocol-<scheme>` request/reply
 *                  | "stream",          // `protocol-<scheme>` streamed reply
 *       "direction": "app->host" | "host->app",
 *       "payload": {                    // the shape carried under this name (see below)
 *         "fields":  [ { "name": …, "optional": bool, "type": "<TS type text>" } ],
 *         "type":    "<TS type text>",  // when the payload is not an object literal
 *         "reads":   [ "<field>" ]      // fields the SDK actually reads off the message
 *       },
 *       "poll":    "<wire-name>",       // push channels only: their `request-*` twin
 *       "value":   { … },               // push channels only: the VALUE the channel carries
 *       "methods": { "<method>": { "payload": … } },  // request/stream only: ONE payload
 *                                       // per method — same wire name, different params
 *       "sites":   [ "src/…" ],         // where the name is minted (informational, sorted)
 *       "divergent": true               // set BY HAND when the two repos' snapshots
 *                                       // disagree on this name's shape. Phase 1 records
 *                                       // the disagreement; R3-274e resolves it and
 *                                       // clears the marker. `sdkShape`/`sandboxShape`
 *                                       // notes live alongside it.
 *     }
 *   },
 *   "envelopes": {                      // the framing EVERY `protocol-*` stream rides:
 *     "send": …, "cancel": …, "frame": [ … ]   // request / early-cancel / reply frames
 *   },
 *   "dynamicFamilies": {                // names minted from a template at runtime — the
 *     "<template>": {                   // scheme LIST is snapshotted, never a wildcard
 *       "schemes": [ "<scheme>" ], "sites": [ "src/…" ]
 *     }
 *   }
 * }
 *
 * `payload.fields` is the structural fingerprint: property name, optionality, and the
 * TypeScript type text, whitespace-normalized, sorted by name. It is a JSON-schema
 * fragment in spirit (fields/types/optionality) expressed in TS type text, because both
 * sides of this wire are TypeScript and the generator in Phase 3 emits TS types — a JSON
 * Schema dialect here would need a lossy TS↔schema mapping on both ends to stay
 * byte-identical.
 *
 * ── EXTRACTION ────────────────────────────────────────────────────────────────
 * Extraction is from SOURCE via the TypeScript compiler API (a real type checker, not
 * regex — the same choice `codegen-prototype/verify.types.mjs` made, for the same
 * reason: a regex cannot see that a field became optional). Recognized call sites:
 *
 *   sendMessage('name', <payload>)            → app->host  message
 *   addListener('name', (m: T) => …)          → host->app  message  (payload = T + reads)
 *   createPushChannel<V>({ pushType, requestType, parse })
 *                                             → host->app  push (+ its app->host poll)
 *   protocolRequest('scheme', 'method', …)    → app->host  request `protocol-scheme`
 *   protocolStream('protocol-x', 'method', …) → app->host  stream
 *   consumeStream(t, 'protocol-x', 'method',) → app->host  stream
 *   consumeStream(t, `protocol-${x}`, …)      → dynamic family (template + scheme list)
 *
 * A wire-name argument may be a string literal OR a `const` that resolves to one —
 * since R3-274c the call sites spell the names as the constants published by
 * `@immediately-run/sandbox-protocol`, and the resolution is the type checker's, not a
 * regex's (see `literal()` inside `extract`).
 *
 * Test files are excluded: they exercise the vocabulary, they do not define it. That is
 * also why the tests keep spelling the names as raw literals: a test asserting
 * `type === TASK_COMPLETE` could not tell you the constant still says `task-complete`.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
// The published contract, resolved through node so a linked local checkout works
// for iteration without a bypass this gate would then have to trust.
const snapshotPath = require.resolve('@immediately-run/sandbox-protocol/snapshots/sdk');
const contractVersion = JSON.parse(
  readFileSync(require.resolve('@immediately-run/sandbox-protocol/package.json'), 'utf8'),
).version;
const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

// ── source enumeration ────────────────────────────────────────────────────────
const isTest = (name) => /\.(test|spec)\.tsx?$/.test(name);
const listSources = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSources(p));
    else if (/\.tsx?$/.test(entry.name) && !isTest(entry.name)) out.push(p);
  }
  return out.sort();
};

// ── type description ──────────────────────────────────────────────────────────
const normalize = (s) => s.replace(/\s+/g, ' ').trim();

const MAX_DEPTH = 2;

/**
 * Structural fingerprint of a type.
 *
 * Object types expand field by field; unions expand member by member; arrays and
 * tuples expand through their elements. Everything else is its type text.
 *
 * WHY EXPAND INSTEAD OF PRINTING THE TYPE NAME. A field typed `HostTheme` prints
 * as `"HostTheme"`, and then *adding a third theme* — a genuinely new value on the
 * wire — changes nothing in the snapshot. The alias has to be resolved for the gate
 * to mean "the shape", not "the spelling". Depth is capped at MAX_DEPTH so a field
 * whose type reaches half the codebase does not drag it into the snapshot.
 */
const describeType = (checker, type, node, depth = 0) => {
  if (!type) return { type: 'unknown' };
  const text = (t = type) =>
    normalize(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation));
  if (depth > MAX_DEPTH) return { type: text() };
  if (checker.isArrayType?.(type)) {
    const [el] = checker.getTypeArguments(type);
    return { array: describeType(checker, el, node, depth + 1) };
  }
  if (checker.isTupleType?.(type)) {
    return {
      tuple: checker.getTypeArguments(type).map((t) => describeType(checker, t, node, depth + 1)),
    };
  }
  // `boolean` is internally `true | false`; keep it spelled as itself.
  if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (type.isUnion?.()) {
    const members = type.types
      .map((t) => describeType(checker, t, node, depth + 1))
      .map((d) => JSON.stringify(d));
    return { union: [...new Set(members)].sort().map((j) => JSON.parse(j)) };
  }
  const isObject = Boolean(type.flags & ts.TypeFlags.Object);
  const callable = checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0;
  if (isObject && !callable) {
    const props = checker.getPropertiesOfType(type).filter((p) => !p.name.startsWith('__@'));
    if (props.length) {
      const fields = props
        .map((p) => {
          const decl = p.valueDeclaration ?? p.declarations?.[0] ?? node;
          return {
            name: p.name,
            optional: Boolean(p.flags & ts.SymbolFlags.Optional),
            ...describeType(checker, checker.getTypeOfSymbolAtLocation(p, decl), decl, depth + 1),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return { fields };
    }
  }
  return { type: text() };
};

/**
 * The payload of a `protocolRequest`/`protocolStream` params argument. Those are
 * always written `[oneObject]` at the call sites, while the catalog front door
 * (`invoke('scheme:method', params)`) passes the object directly — unwrap the
 * single-element array so both spellings fingerprint identically, and so this side's
 * snapshot lines up with the sandbox's (R3-274a's audit diffs them field by field).
 */
/**
 * Look through `x as unknown as Record<string, unknown>` casts. Several call sites
 * launder a typed payload through `Record<string, unknown>` to satisfy
 * `sendMessage`'s signature; fingerprinting the CAST records `{}` and hides the
 * real payload (`sdk-handshake` sends `{sdkVersion, protocolVersion}` this way).
 */
const uncast = (node) => {
  let n = node;
  while (n && (ts.isAsExpression(n) || ts.isTypeAssertionExpression?.(n) || ts.isParenthesizedExpression(n))) {
    n = n.expression;
  }
  return n ?? node;
};

const describeParams = (checker, node) => {
  if (!node) return { type: 'unknown' };
  node = uncast(node);
  if (ts.isArrayLiteralExpression(node) && node.elements.length === 1) {
    return describeType(checker, checker.getTypeAtLocation(node.elements[0]), node.elements[0]);
  }
  return describeType(checker, checker.getTypeAtLocation(node), node);
};

/** Field names read off `paramName` inside `body` — what the SDK actually consumes. */
const readsOf = (body, paramName) => {
  const reads = new Set();
  if (!body || !paramName) return [];
  const walk = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === paramName
    ) {
      reads.add(node.name.text);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === paramName &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      reads.add(node.argumentExpression.text);
    }
    ts.forEachChild(node, walk);
  };
  walk(body);
  return [...reads].sort();
};

/** The single destructured/named parameter of a callback, if it has one. */
const paramNameOf = (fn) => {
  const p = fn?.parameters?.[0];
  return p && ts.isIdentifier(p.name) ? p.name.text : undefined;
};


const objectProp = (obj, name) => {
  if (!obj || !ts.isObjectLiteralExpression(obj)) return undefined;
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer;
    }
  }
  return undefined;
};

// ── extraction ────────────────────────────────────────────────────────────────
/**
 * Build the current wire vocabulary from source.
 * @param {{patch?: Map<string,string>, files?: string[]}} opts
 *   `patch` overrides file contents (used by --self-test to poison the tree
 *   without touching disk); `files` overrides the root file set.
 */
export const extract = (opts = {}) => {
  const patch = opts.patch ?? new Map();
  const files = opts.files ?? listSources(srcDir);
  const options = {
    ...JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')).compilerOptions,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile.bind(host);
  host.readFile = (fileName) => patch.get(resolve(fileName)) ?? readFile(fileName);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const patched = patch.get(resolve(fileName));
    if (patched !== undefined) {
      return ts.createSourceFile(fileName, patched, languageVersion, true);
    }
    return getSourceFile(fileName, languageVersion, onError, shouldCreate);
  };

  const program = ts.createProgram({ rootNames: files, options, host });
  const checker = program.getTypeChecker();

  /**
   * The string a wire-name argument evaluates to — a literal, or a `const` that
   * resolves to one.
   *
   * Since R3-274c the call sites spell the names as the constants published by
   * `@immediately-run/sandbox-protocol` (`sendMessage(TASK_COMPLETE, …)`), so a
   * literal-only reader would extract nothing and this gate would report the whole
   * vocabulary as REMOVED. The type checker is already here, and a `const` declared
   * `= 'task-complete'` has the string-literal TYPE `"task-complete"` — so ask it,
   * rather than re-implementing constant folding. Scheme constants derived from a
   * wire name (`SCHEME_TASK`, a template-literal conditional over `PROTOCOL_TASK`)
   * resolve the same way, which is what makes deriving them safe.
   */
  const literal = (node) => {
    if (!node) return undefined;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const t = checker.getTypeAtLocation(node);
      if (t.isStringLiteral?.()) return t.value;
    }
    return undefined;
  };

  const channels = {};
  const dynamicFamilies = {};

  const site = (node) => relative(root, node.getSourceFile().fileName).split('\\').join('/');

  const record = (name, entry, at) => {
    const prev = channels[name];
    if (!prev) {
      channels[name] = { ...entry, sites: [site(at)] };
      return;
    }
    // Same name minted twice — a request scheme that also streams, or a name the SDK
    // both sends and listens for (`urlchange`). Merge, keeping BOTH facts visible:
    // the kind becomes `request+stream`, the direction `both`. A genuine
    // two-shapes-one-name case is what the `divergent` marker is for — it is
    // recorded by hand, never silently unified away.
    prev.sites = [...new Set([...prev.sites, site(at)])].sort();
    if (entry.kind !== prev.kind) {
      prev.kind = [...new Set([...prev.kind.split('+'), ...entry.kind.split('+')])].sort().join('+');
    }
    if (entry.direction !== prev.direction) prev.direction = 'both';
    if (entry.methods) {
      prev.methods ??= {};
      for (const [m, spec] of Object.entries(entry.methods)) {
        const at = prev.methods[m];
        prev.methods[m] = at
          ? { payload: at.payload?.fields ? at.payload : spec.payload }
          : spec;
      }
    }
    if (!prev.payload?.fields && entry.payload?.fields) prev.payload = entry.payload;
    if (entry.poll) prev.poll = entry.poll;
    if (entry.value) prev.value = entry.value;
  };

  /** `invoke('scheme:method')` / `invokeStream('scheme:method')` — the catalog front
   *  door. The wire name is `protocol-<scheme>`; the catalog name carries the method. */
  const recordCatalogCall = (catalogName, kind, paramsNode, node) => {
    const i = catalogName.indexOf(':');
    if (i <= 0) return;
    const scheme = catalogName.slice(0, i);
    const method = catalogName.slice(i + 1);
    const payload = paramsNode ? describeParams(checker, paramsNode) : { fields: [] };
    record(
      `protocol-${scheme}`,
      { kind, direction: 'app->host', methods: { [method]: { payload } } },
      node,
    );
  };

  for (const file of files) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = ts.isIdentifier(node.expression)
          ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : undefined;
        const args = node.arguments;

        if (callee === 'sendMessage' && literal(args[0])) {
          const payload = args[1]
            ? describeType(checker, checker.getTypeAtLocation(uncast(args[1])), uncast(args[1]))
            : { fields: [] };
          record(literal(args[0]), { kind: 'message', direction: 'app->host', payload }, node);
        } else if (callee === 'addListener' && literal(args[0])) {
          const fn = args[1];
          const param = fn && ts.isFunctionLike(fn) ? fn.parameters?.[0] : undefined;
          const payload = param
            ? describeType(checker, checker.getTypeAtLocation(param), param)
            : { type: 'unknown' };
          const reads = fn && ts.isFunctionLike(fn) ? readsOf(fn.body, paramNameOf(fn)) : [];
          if (reads.length) payload.reads = reads;
          record(literal(args[0]), { kind: 'message', direction: 'host->app', payload }, node);
        } else if (callee === 'createPushChannel') {
          const obj = args[0];
          const pushType = literal(objectProp(obj, 'pushType'));
          const requestType = literal(objectProp(obj, 'requestType'));
          if (pushType) {
            const parse = objectProp(obj, 'parse');
            const reads =
              parse && ts.isFunctionLike(parse) ? readsOf(parse.body, paramNameOf(parse)) : [];
            const valueNode = node.typeArguments?.[0];
            const entry = {
              kind: 'push',
              direction: 'host->app',
              payload: reads.length ? { reads } : { type: 'Record<string, unknown>' },
            };
            if (requestType) entry.poll = requestType;
            if (valueNode) {
              entry.value = describeType(
                checker,
                checker.getTypeFromTypeNode(valueNode),
                valueNode,
                1,
              );
              entry.value.type ??= normalize(valueNode.getText());
            }
            record(pushType, entry, node);
          }
          if (requestType) {
            record(
              requestType,
              { kind: 'poll', direction: 'app->host', payload: { fields: [] } },
              node,
            );
          }
        } else if (callee === 'protocolRequest' && literal(args[0])) {
          const scheme = literal(args[0]);
          const method = literal(args[1]) ?? '<dynamic>';
          const params = describeParams(checker, args[2]);
          record(
            `protocol-${scheme}`,
            { kind: 'request', direction: 'app->host', methods: { [method]: { payload: params } } },
            node,
          );
        } else if (callee === 'invoke' && literal(args[0])) {
          recordCatalogCall(literal(args[0]), 'request', args[1], node);
        } else if (callee === 'invokeStream' && literal(args[0])) {
          recordCatalogCall(literal(args[0]), 'stream', args[1], node);
        } else if (callee === 'protocolStream' || callee === 'consumeStream') {
          // protocolStream(name, method, params) / consumeStream(transport, name, method, …)
          const off = callee === 'consumeStream' ? 1 : 0;
          const nameNode = args[off];
          const method = literal(args[off + 1]) ?? '<dynamic>';
          const params = describeParams(checker, args[off + 2]);
          const name = literal(nameNode);
          if (name) {
            record(
              name,
              { kind: 'stream', direction: 'app->host', methods: { [method]: { payload: params } } },
              node,
            );
          } else if (nameNode && ts.isTemplateExpression(nameNode)) {
            // `protocol-${scheme}` — snapshot the TEMPLATE, never a wildcard.
            const template =
              nameNode.head.text +
              nameNode.templateSpans.map((s) => `<scheme>${s.literal.text}`).join('');
            const fam = (dynamicFamilies[template] ??= { schemes: [], sites: [] });
            fam.sites = [...new Set([...fam.sites, site(node)])].sort();
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // ── stream framing ──────────────────────────────────────────────────────────
  // Every `protocol-*` stream rides ONE envelope, declared once in
  // `protocolStream.ts`: the request frame, the early-cancel frame, and the
  // `event`/`done`/`error` frames the host replies with. A change there reshapes
  // every stream at once, so it is snapshotted as its own entry — the "stream
  // framing abuse" negative space (ways_of_working §3) has to have something to
  // regress against.
  const envelopes = {};
  const streamSrc = program.getSourceFile(resolve(srcDir, 'protocolStream.ts'));
  if (streamSrc) {
    ts.forEachChild(streamSrc, (n) => {
      if (ts.isInterfaceDeclaration(n) && n.name.text === 'StreamTransport') {
        for (const m of n.members) {
          if (!ts.isPropertySignature(m) || !m.type || !ts.isFunctionTypeNode(m.type)) continue;
          envelopes[m.name.getText()] = m.type.parameters.map((p) => ({
            name: p.name.getText(),
            ...describeType(checker, checker.getTypeAtLocation(p), p),
          }));
        }
      }
      if (ts.isTypeAliasDeclaration(n) && n.name.text === 'StreamFrame') {
        const t = checker.getTypeFromTypeNode(n.type);
        envelopes.frame = (t.isUnion() ? t.types : [t]).map((member) =>
          describeType(checker, member, n),
        );
      }
    });
  }

  // The scheme list for every dynamic family: the statically-known schemes, taken
  // from the request/stream names actually minted in this repo.
  const schemes = Object.entries(channels)
    .filter(([, c]) => c.kind === 'request' || c.kind === 'stream')
    .map(([name]) => name.replace(/^protocol-/, ''))
    .sort();
  for (const fam of Object.values(dynamicFamilies)) fam.schemes = schemes;

  const sorted = {};
  for (const key of Object.keys(channels).sort()) {
    const c = channels[key];
    const methods = c.methods
      ? Object.fromEntries(Object.keys(c.methods).sort().map((m) => [m, c.methods[m]]))
      : undefined;
    sorted[key] = {
      kind: c.kind,
      direction: c.direction,
      ...(c.poll ? { poll: c.poll } : {}),
      // A request/stream name carries ONE payload PER METHOD — `spaces:invite` and
      // `spaces:list` are the same wire name with different params, so a single
      // per-name payload would hide a reshape of all but one of them.
      ...(methods ? { methods } : { payload: c.payload }),
      ...(c.value ? { value: c.value } : {}),
      sites: c.sites,
    };
  }

  return { formatVersion: 1, repo: pkgName, channels: sorted, dynamicFamilies, envelopes };
};

// ── comparison ────────────────────────────────────────────────────────────────
/** Preserve hand-authored `divergent`/note keys (Phase 1 records them; R3-274e clears). */
const HAND_KEYS = ['divergent', 'divergentNote'];
const mergeHandKeys = (current, snapshot) => {
  for (const [name, entry] of Object.entries(current.channels)) {
    const prior = snapshot?.channels?.[name];
    if (!prior) continue;
    for (const k of HAND_KEYS) if (k in prior) entry[k] = prior[k];
  }
  return current;
};

const stable = (v) => JSON.stringify(v);

/** @returns {{removed: string[], added: string[], changed: string[]}} */
const compare = (current, snapshot) => {
  const removed = [];
  const added = [];
  const changed = [];
  for (const name of Object.keys(snapshot.channels ?? {})) {
    if (!current.channels[name]) removed.push(name);
  }
  for (const name of Object.keys(current.channels)) {
    if (!snapshot.channels?.[name]) added.push(name);
    else if (stable(current.channels[name]) !== stable(snapshot.channels[name])) {
      changed.push(name);
    }
  }
  if (stable(current.dynamicFamilies) !== stable(snapshot.dynamicFamilies ?? {})) {
    changed.push('(dynamic families)');
  }
  if (stable(current.envelopes) !== stable(snapshot.envelopes ?? {})) {
    changed.push('(stream envelope)');
  }
  return { removed, added, changed };
};

// ── the re-exported protocol module ──────────────────────────────────────────
/*
 * `src/generated/protocol.ts` used to be a COPY of a module generated in the sandbox
 * repo, and this file checked that the copy still covered exactly this repo's wire
 * surface — the best a hand-copied artifact allowed.
 *
 * Since R3-274b1 it re-exports `@immediately-run/sandbox-protocol/sdk`, so there is
 * no copy to go stale: the check that matters is the one below, this repo's SOURCE
 * against the PINNED CONTRACT. What is still worth asserting is that the file really
 * is a re-export of that package — if someone re-inlines the constants here, the
 * package stops being the source of truth silently, and every gate keeps passing.
 */
const generatedModulePath = join(root, 'src/generated/protocol.ts');

const checkGeneratedModule = () => {
  if (!existsSync(generatedModulePath)) {
    return ['src/generated/protocol.ts is missing — it re-exports the pinned contract.'];
  }
  const text = readFileSync(generatedModulePath, 'utf8');
  if (!/export \* from '@immediately-run\/sandbox-protocol\/sdk';/.test(text)) {
    return [
      'src/generated/protocol.ts no longer re-exports @immediately-run/sandbox-protocol/sdk ' +
        '— the wire vocabulary must come from the published contract, not from a local copy',
    ];
  }
  return [];
};

// ── main ──────────────────────────────────────────────────────────────────────
const NON_VACUOUS_MIN = 10;

const main = () => {
  const current = extract();
  const count = Object.keys(current.channels).length;
  if (count < NON_VACUOUS_MIN) {
    console.error(
      `error: extracted only ${count} wire names — the extractor is broken or pointed at\n` +
        'the wrong tree. A checker that finds nothing must fail, not pass.',
    );
    process.exit(1);
  }

  const snapshot = existsSync(snapshotPath)
    ? JSON.parse(readFileSync(snapshotPath, 'utf8'))
    : null;
  if (!snapshot) {
    console.error(
      'error: @immediately-run/sandbox-protocol is not installed — the wire contract\n' +
        'lives there since R3-274b1. Run `npm ci`.',
    );
    process.exit(1);
  }

  const { removed, added, changed } = compare(mergeHandKeys(current, snapshot), snapshot);
  if (!removed.length && !added.length && !changed.length) {
    console.log(
      `PASS  this repo's source matches @immediately-run/sandbox-protocol@${contractVersion} ` +
        `(${count} wire names).`,
    );
    const problems = checkGeneratedModule();
    if (problems.length) {
      console.error('\n✗ src/generated/protocol.ts is out of sync with the wire surface:\n');
      for (const p of problems) console.error(`  - ${p}`);
      console.error(
        '\nThe vocabulary is OWNED by @immediately-run/sandbox-protocol (R3-274b1).\n' +
          'Change the descriptors there, publish, and bump the pin — do not re-inline\n' +
          'the constants here.',
      );
      process.exit(1);
    }
    console.log(`PASS  src/generated/protocol.ts re-exports the pinned contract.`);
    return;
  }
  if (removed.length) {
    console.error('✗ BREAKING: wire names removed or renamed since the snapshot:\n');
    for (const r of removed) console.error(`  - ${r}`);
  }
  if (changed.length) {
    console.error('\n✗ BREAKING: wire payload shapes changed since the snapshot:\n');
    for (const c of changed) {
      console.error(`  ~ ${c}`);
      const was = snapshot.channels?.[c];
      const now = extract().channels[c];
      if (was && now) {
        console.error(`      was: ${stable(was.payload)}`);
        console.error(`      now: ${stable(now.payload)}`);
      }
    }
  }
  if (added.length) {
    console.error('\n✗ New wire names are not in the snapshot:\n');
    for (const a of added) console.error(`  + ${a}`);
  }
  console.error(
    '\nThe sandbox↔SDK wire is additive-only (SDK_PACKAGING_SPEC §9,\n' +
      'PLATFORM_LAYERING_SPEC §2): renaming or reshaping a name breaks every app\n' +
      'pinned to an older SDK against a newer frame, and vice versa. If the change is\n' +
      'genuinely additive: edit the descriptors in @immediately-run/sandbox-protocol,\n' +
      'publish, and bump the pin here. This repo cannot bless its own wire change any\n' +
      'more — that is the contract, not a chore.',
  );
  process.exit(1);
};

// ── --self-test: the gate must actually catch what it claims to ───────────────
const selfTest = () => {
  const real = extract();
  const cases = [
    [
      'a RENAMED wire string',
      new Map([[resolve(srcDir, 'tasks.ts'), readFileSync(join(srcDir, 'tasks.ts'), 'utf8').replace("'task-complete'", "'task-finished'")]]),
    ],
    [
      'a payload field made OPTIONAL (name unchanged)',
      new Map([
        [
          resolve(srcDir, 'tasks.ts'),
          readFileSync(join(srcDir, 'tasks.ts'), 'utf8').replace(
            'addListener(\'task-input\', (m: { task: string; params?: Record<string, unknown> })',
            'addListener(\'task-input\', (m: { task?: string; params?: Record<string, unknown> })',
          ),
        ],
      ]),
    ],
    [
      'a payload field TYPE change (name unchanged)',
      new Map([
        [
          resolve(srcDir, 'tasks.ts'),
          readFileSync(join(srcDir, 'tasks.ts'), 'utf8').replace(
            'addListener(\'task-input\', (m: { task: string; params?: Record<string, unknown> })',
            'addListener(\'task-input\', (m: { task: number; params?: Record<string, unknown> })',
          ),
        ],
      ]),
    ],
    [
      'a DELETED call site',
      new Map([
        [
          resolve(srcDir, 'dnd.ts'),
          readFileSync(join(srcDir, 'dnd.ts'), 'utf8').replace("sendMessage('dnd-cancel', {});", ''),
        ],
      ]),
    ],
    [
      'a push channel losing its request-* twin',
      new Map([
        [
          resolve(srcDir, 'theme.ts'),
          readFileSync(join(srcDir, 'theme.ts'), 'utf8').replace(
            "requestType: 'request-theme',",
            '',
          ),
        ],
      ]),
    ],
  ];

  let ok = 0;
  for (const [label, patch] of cases) {
    // A patch that silently stopped matching (source moved on) would make its case
    // pass vacuously — the poisoned tree would just be the clean one.
    for (const [file, text] of patch) {
      if (text === readFileSync(file, 'utf8')) {
        console.error(`FAIL  self-test case "${label}" no longer patches ${relative(root, file)}`);
        process.exit(1);
      }
    }
    const poisoned = extract({ patch });
    const diff = compare(poisoned, real);
    const caught = diff.removed.length + diff.added.length + diff.changed.length > 0;
    console.log(`${caught ? 'PASS' : 'FAIL'}  detects: ${label}`);
    if (caught) ok++;
  }

  // Non-vacuity: an extractor pointed at nothing must FAIL, not report a clean tree.
  let vacuousCaught = false;
  try {
    const empty = extract({ files: [] });
    vacuousCaught = Object.keys(empty.channels).length < NON_VACUOUS_MIN;
  } catch {
    vacuousCaught = true;
  }
  console.log(`${vacuousCaught ? 'PASS' : 'FAIL'}  an empty extraction is a failure, not a pass`);
  if (vacuousCaught) ok++;

  const clean = compare(extract(), real);
  const cleanOk = clean.removed.length + clean.added.length + clean.changed.length === 0;
  console.log(`${cleanOk ? 'PASS' : 'FAIL'}  extraction is deterministic (no false positive)`);
  if (cleanOk) ok++;

  const total = cases.length + 2;
  console.log(`\n${ok}/${total} self-test cases.`);
  if (ok !== total) {
    console.error('\nself-test FAILED — the protocol gate is not catching drift it must catch.');
    process.exit(1);
  }
};

if (process.argv.includes('--self-test')) selfTest();
else main();
