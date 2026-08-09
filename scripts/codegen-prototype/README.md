# Gate-table → SDK codegen (prototype)

Proof-of-concept for `docs/specs/SDK_SIMPLIFICATION_SPEC.md`: derive the typed SDK
surface from one capability-descriptor set instead of hand-maintaining the typed
wrappers, the catalog, and the docs in parallel. Covers both a **request** family
(`spaces:*`) and a **stream** family (`contribute:run`, `llm:chat`).

## Files

| File | Role (spec §) |
|---|---|
| `descriptors.spaces.mjs` | The **single source** for the request family — the §2 `CapabilityDescriptor` set for `spaces:*`, transcribed from `src/catalog.ts` + `src/mounts.ts` + `CAPABILITY_REFERENCE.md`. |
| `descriptors.streams.mjs` | The single source for the **stream** family — `contribute:run` + `llm:chat`, transcribed from `src/contribute.ts` + `src/llm.ts`. Proves the `kind:'stream'` → `AsyncGenerator<Event, Result>` projection (incl. discriminated-union events via `oneOf`/`const`). |
| `generate.mjs` | The generator — emits the §3 projections (wrappers, types, error unions, llms.txt, catalog manifest). Dependency-free; ships a tiny json-schema→TS (object/enum/const/array/record/unknown/$ref/oneOf/void). Real impl uses `json-schema-to-typescript`. |
| `verify.mjs` | §7 acceptance test (request) — descriptors ≡ the **SHIPPED** surface: each `alias.fn` is a real export of the BUILT `dist/mounts.js` and is pinned in `api-snapshot.json`, and the generated path (via the real `invoke()` from `dist/catalog.js`) makes an identical wire call + throws the same `.code`, all 9 methods. |
| `verify.streams.mjs` | §7 acceptance test (stream) — descriptors ≡ the **SHIPPED** surface, through the REAL `consumeStream`: each `alias.fn` is an export of the BUILT `dist/contribute.js`/`dist/llm.js`, and the generated path (real `invokeStream`) matches on request envelope, yielded events, return value and thrown `.code`. Plus the `signal`-stays-off-the-wire constraint. |
| `verify.types.mjs` | Type-member parity — the descriptors' shared types vs. the BUILT `dist/mounts.d.ts`, field by field (TypeScript compiler AST, not regex). Closes a gap **both** other gates have: `api:check` compares exported NAMES, and the wire check never sees types, so an interface silently losing a FIELD passes everything. It caught the descriptors dropping `Member.principal`. |
| `generated/` | Output: `<family>.generated.ts` (wrappers+types), `<family>.llms.txt` (docs), `<family>.catalog.json` (catalog twin). |

## Run

```sh
node scripts/codegen-prototype/generate.mjs ./descriptors.spaces.mjs    # 1 source → 3 projections
node scripts/codegen-prototype/generate.mjs ./descriptors.streams.mjs
node scripts/codegen-prototype/verify.mjs             # 9/9 request methods ≡ the SHIPPED surface
node scripts/codegen-prototype/verify.streams.mjs     # 2/2 stream  methods ≡ the SHIPPED surface
node scripts/codegen-prototype/verify.mjs --self-test         # the gate is not vacuous
node scripts/codegen-prototype/verify.streams.mjs --self-test # …nor is the stream one

# both, as CI runs them (needs `npm run build` first):
npm run verify:codegen-parity
```

Both generated `.ts` files type-check under `--strict`, including discriminated-union
narrowing on the streamed events (`ev.stage === 'done'`, `delta.type === 'text-delta'`).

The generated `spaces.generated.ts` type-checks under `--strict` and its public
signatures (`inviteToSpace(spaceId, login, role)`, the `Role`/`Member`/`GrantRecord`
types) are byte-identical to today's hand-written `src/mounts.ts` exports — so a
swap is a no-op to consuming apps and keeps `npm run api:check` green. That claim is
now *checked* rather than asserted: `verify.mjs` reads the built artifacts (see
below), and it is what caught the descriptors having drifted to a `shareSpace`
method the SDK never shipped.

## What it demonstrates (the thesis)

The hand-written wrapper (human / authoring-agent surface) and the catalog
descriptor (embedded-agent surface) are **two projections of one fact**. Change
`spaces:share`'s params in `descriptors.spaces.mjs` and the wrapper, its types,
the error union, the llms.txt row, and the catalog entry all move together — they
*cannot* drift (the drift recorded in `status/SDK_PACKAGING_STATUS.md`, where
`llm.ts` fell out of `api-snapshot.json`, becomes structurally impossible).

This is why "agent-friendly vs human-friendly" stops being a trade-off: the two
surfaces are the same artifact viewed from two angles. The one axis it does *not*
fix — ambient magic (e.g. `fs` is not an SDK export) — is called out in the spec
§6 as out-of-scope-but-named, not papered over.

## Known prototype limitations (not the real design)

- The json-schema→TS is a ~40-line subset (object/enum/string/number/boolean/
  array/$ref/void) — enough for `spaces:*`. The real step is `json-schema-to-typescript`.
- Descriptors are authored here; in the real design they are generated from the host
  gate table (`SDK_SIMPLIFICATION_SPEC §8 O1`).
- ~~`verify.mjs` re-implements the two call paths~~ — **fixed (R3-166).** It now
  imports the BUILT `dist/mounts.js` + `dist/catalog.js`, so parity is measured
  against what actually ships. (The blocker was never load-time side effects, as
  this note used to claim — `transport()` resolves lazily and `tasks` is a
  type-only import. It was tsup's extensionless relative specifiers, which node's
  ESM resolver rejects; a small `registerHooks` resolver bridges them.)
  **`verify.streams.mjs` too** — it was further gone (it re-implemented
  `consumeStream` itself), and now drives `dist/contribute.js` + `dist/llm.js` and
  the real `invokeStream`, over a scripted transport installed at the §4 discovery
  global. It also pins one shipped behaviour the descriptors do not model: `chat()`
  peels `signal` off before the wire, and the self-test proves the naive generated
  form would leak it — a real constraint on the §3.2 stream projection.
