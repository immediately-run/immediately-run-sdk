# REFACTOR_CANDIDATES — `@immediately-run/sdk`

Dim-3 (complexity / code-smell) **record-only** list from the code-verification pass
(`docs/plans/code-verification/02-sdk.md`). **Nothing here is actioned** — each entry is
a cited reason a future, separately-scoped refactor task can start from.

| Candidate | Smell / reason | Risk if touched |
|---|---|---|
| **`Tinkerable*` symbol family** (`TinkerableContext`, `TinkerableState`, `TinkerableApp`, `useTinkerableLink`, `NavigationState`/`PathState`, + `contextUtils.ts`/`routing.tsx`/`boot.tsx`/`components/*`/`hooks.ts`/`urlUtils.ts`) | Product-hygiene only — the legacy `Tinkerable` brand name (SPEC_CODE_DEBT §1.5), **not** a core_concepts vocabulary issue. | **HIGH** — all are **public exports** (`api-snapshot.json` `index`/`TinkerableContext`/`boot`/`routing` lists); a rename breaks every consuming app's imports + needs `api:update`. Zero spec impact. Defer. |
| **`sandboxUtils.ts` `transport()` dual-mode resolution** | Branches across the legacy in-bundler injection path and the `hostRuntime` discovery global (SDK_PACKAGING §4/§8). Two transport topologies in one resolver. | MEDIUM — load-bearing (the 0.2.7 cycle fix lives near here); the dual-mode is intentional during the migration. Change only with `check:circular` + the transport tests. Re-evaluate once the injection path is retired. |
| **`tasks.ts` `ensureInputListener` and `mounts.ts`'s replay poll** (verified on 2026-10-05) | Each hand-writes "register the listener, then send one best-effort poll", which is what `createPushChannel`'s `start` already does (`pushChannel.ts`). `task-input` became pollable with `request-task-input`, so `tasks.ts` could be a `createPushChannel<TaskInput \| null>` with one eager `get()`. | `scripts/check-protocol-snapshot.mjs` matches the literal `addListener(TASK_INPUT, …)` text, and `task-input` is declared a `message`, not a `push`, in `@immediately-run/sandbox-protocol`; moving it changes the wire snapshot's kind and needs a protocol bump. |

## SDK_SIMPLIFICATION §7 — the hand-cast `res.data as T` sites

Verified on 2026-10-09 (`grep -n "res.data as" src/*.ts` — this list is the complete
set; R3-1089's exit criterion pins it. The grep also matches `src/mounts.test.ts:19`,
a COMMENT quoting the pattern — not a cast, and deliberately unlisted). The §7 migration
item replaces each with the
generated wrapper for its family; until then these are the only places a reply is
hand-cast after the refusal gate:

- `src/catalog.ts:56` — `invoke<T>`'s generic return after `throwOnRefusal`; the cast
  is the generic's job (the descriptor's `result` is the type argument's source), and
  it is the reply path every generated wrapper uses.
- `src/mounts.ts:489` — verified on 2026-10-09.
- `src/mounts.ts:622` — verified on 2026-10-09.
- `src/mounts.ts:708` — verified on 2026-10-09.
- `src/secrets.ts:88` — verified on 2026-10-09.
- `src/tasks.ts:130` — verified on 2026-10-09.
