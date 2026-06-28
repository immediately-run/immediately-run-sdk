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
| `verify.mjs` | §7 acceptance test (request) — generated path ≡ hand-written `src/mounts.ts` path (identical wire call + thrown `.code`), all 9 methods. |
| `verify.streams.mjs` | §7 acceptance test (stream) — generated path ≡ hand-written `src/contribute.ts`/`src/llm.ts` path (identical request envelope + yielded events + return value + thrown `.code`), both methods. |
| `generated/` | Output: `<family>.generated.ts` (wrappers+types), `<family>.llms.txt` (docs), `<family>.catalog.json` (catalog twin). |

## Run

```sh
node scripts/codegen-prototype/generate.mjs ./descriptors.spaces.mjs    # 1 source → 3 projections
node scripts/codegen-prototype/generate.mjs ./descriptors.streams.mjs
node scripts/codegen-prototype/verify.mjs           # 9/9 request methods: generated ≡ hand-written
node scripts/codegen-prototype/verify.streams.mjs   # 2/2 stream methods:  generated ≡ hand-written
```

Both generated `.ts` files type-check under `--strict`, including discriminated-union
narrowing on the streamed events (`ev.stage === 'done'`, `delta.type === 'text-delta'`).

The generated `spaces.generated.ts` type-checks under `--strict` and its public
signatures (`shareSpace(spaceId, login, role)`, the `Role`/`Member`/`GrantRecord`
types) are byte-identical to today's hand-written `src/mounts.ts` exports — so a
swap is a no-op to consuming apps and keeps `npm run api:check` green.

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
- `verify.mjs` re-implements the two call paths (from `catalog.ts` / `mounts.ts`)
  rather than importing the TS, whose load-time side effects don't exist under node.
