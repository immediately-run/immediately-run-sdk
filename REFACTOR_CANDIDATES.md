# REFACTOR_CANDIDATES — `@immediately-run/sdk`

Dim-3 (complexity / code-smell) **record-only** list from the code-verification pass
(`docs/plans/code-verification/02-sdk.md`). **Nothing here is actioned** — each entry is
a cited reason a future, separately-scoped refactor task can start from.

| Candidate | Smell / reason | Risk if touched |
|---|---|---|
| **`Tinkerable*` symbol family** (`TinkerableContext`, `TinkerableState`, `TinkerableApp`, `useTinkerableLink`, `NavigationState`/`PathState`, + `contextUtils.ts`/`routing.tsx`/`boot.tsx`/`components/*`/`hooks.ts`/`urlUtils.ts`) | Product-hygiene only — the legacy `Tinkerable` brand name (SPEC_CODE_DEBT §1.5), **not** a core_concepts vocabulary issue. | **HIGH** — all are **public exports** (`api-snapshot.json` `index`/`TinkerableContext`/`boot`/`routing` lists); a rename breaks every consuming app's imports + needs `api:update`. Zero spec impact. Defer. |
| **`sandboxUtils.ts` `transport()` dual-mode resolution** | Branches across the legacy in-bundler injection path and the `hostRuntime` discovery global (SDK_PACKAGING §4/§8). Two transport topologies in one resolver. | MEDIUM — load-bearing (the 0.2.7 cycle fix lives near here); the dual-mode is intentional during the migration. Change only with `check:circular` + the transport tests. Re-evaluate once the injection path is retired. |
