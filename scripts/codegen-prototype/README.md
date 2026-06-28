# Gate-table → SDK codegen (prototype)

Proof-of-concept for `docs/specs/SDK_SIMPLIFICATION_SPEC.md`: derive the typed SDK
surface from one capability-descriptor set instead of hand-maintaining the typed
wrappers, the catalog, and the docs in parallel. Scoped to the `spaces:*` family.

## Files

| File | Role (spec §) |
|---|---|
| `descriptors.spaces.mjs` | The **single source** — the §2 `CapabilityDescriptor` set for `spaces:*`, transcribed from `src/catalog.ts` + `src/mounts.ts` + `CAPABILITY_REFERENCE.md`. |
| `generate.mjs` | The generator — emits the §3 projections (wrappers, types, error unions, llms.txt, catalog manifest). Dependency-free; ships a tiny json-schema→TS (real impl uses `json-schema-to-typescript`). |
| `verify.mjs` | The §7 acceptance test — proves the generated path ≡ the hand-written `src/mounts.ts` path (identical wire call + identical thrown `.code`) for all 9 methods. |
| `generated/` | Output. `spaces.generated.ts` (wrappers+types), `spaces.llms.txt` (docs), `spaces.catalog.json` (catalog twin). |

## Run

```sh
node scripts/codegen-prototype/generate.mjs   # 1 source → 3 projections
node scripts/codegen-prototype/verify.mjs     # 9/9 methods: generated ≡ hand-written
```

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
