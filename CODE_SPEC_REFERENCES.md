# CODE_SPEC_REFERENCES — `@immediately-run/sdk`

The **in-App client** of the platform: code that runs inside the sandboxed iframe and
reaches the Host through one transport (core_concepts §1 App, §2 Host). It owns no
authority — every method is a request the Host adjudicates. Seeded by the
code-verification pass (`docs/plans/code-verification/02-sdk.md`, roadmap R3-124).

## Findings log (dim 1 + 5)

| Area | Finding | Disposition |
|---|---|---|
| `api-snapshot.json` vs `dist` | **Snapshot drift (FIXED 2026-06-22).** The snapshot was missing the `src/llm.ts` (`llm.chat@1`) exports — `chat`, `describeChat`, `onChatProviderChange`, `useChatProvider`, `ChatDelta`/`ChatMessage`/`ChatRequest`/`ChatResult`/`ChatRole`/`ChatStopReason`/`ChatFeatures`/`ChatProviderInfo`/`ContentPart`/`ToolDef` (in both `index` + `llm` lists). **Purely additive** (no removals). This made `npm run api:check` RED on `main`, which **blocks the SDK's `build-test-publish` CI** (api:check gates the publish). | **FIXED:** `npm run api:update` committed. `commit e0dfc04` ("Add … LLM chat SDK module") merged (PR #33) without updating the snapshot — the api:check gate did not catch it pre-merge. |
| `package.json` version / publish lag | **Publish lag (FIXED 2026-06-22).** `src/llm.ts` (e0dfc04) was added on `main` *after* the v0.12.0 trust-root sync (b53f49d) with **no version bump**, so the published `0.12.0` does NOT expose `./llm` — consumers can't get `llm.chat@1`. Same pattern as `@immediately-run/preauth-core@0.1.1`. | **FIXED:** bumped `0.12.0 → 0.13.0`; on merge `.github/workflows/ci.yml` publishes 0.13.0 (npm trusted publishing) + assembles gh-pages `v/0.13.0/` + `integrity.json` + commits the trust root + tags `v0.13.0` (idempotent; immutability guard protects published versions). Decoupled from the host `DEFAULT_SDK_VERSION` (the integrity gate's coverage is unchanged). |
| `SDK_PACKAGING_STATUS.md` version | Status doc says **0.11.0** throughout; the repo + npm were **0.12.0** (now → **0.13.0** here). Historical `0.4.0`-drift references stay. | Reconciled in the docs PR. |

## Non-trivial code↔spec mappings (seed)

- **`src/sandboxUtils.ts` `transport()` / `protocolRequest`** — the single Host transport
  seam. `protocolRequest(protocol, method, params)` is the host-brokered **Service**
  invocation primitive (core_concepts §6); `sendMessage`/`addListener` are the push side.
  `transport()` resolves dual-mode: the legacy in-bundler injection path first, then the
  `hostRuntime` discovery global (SDK_PACKAGING §4/§8). The dependency-free leaf
  `src/hostRuntime.ts` exists to break the import cycle that crashed SDK 0.2.7 — keep it
  acyclic (`npm run check:circular` guards this).
- **`src/catalog.ts` `getCatalog`/`invoke`/`invokeStream`** — the **grant-filtered method
  catalog** = the App's Capability-filtered Service surface (UI_AS_APPS §5.5 + §5.9). This
  IS the agent's tool list; an embedded agent must use it, not hand-rolled tools.
- **`src/mounts.ts` content-refs (`makeContentRef`/`resolveContentRef`/`resolveContentRefs`)**
  — relaying a `{mountId, relPath}` reference the app already holds (FILE_SHARING §7 /
  UI_AS_APPS §8.7; the comments' internal "plan 12 §E" label). A RELAY, not a fabrication:
  honored only when the app holds a grant to `ref.mountId`, else `forbidden`.
- **`src/tasks.ts` `capFile`/`capDir` delegation** — cross-app Service invocation with a
  delegated file Capability (UI_AS_APPS §5.7): data crosses, authority does not.
- **`src/testing.ts` `createMockHost`/`stubProtocol`** — a **test double of the Host's
  Service/transport seam** (TESTING_AUTOMATION §3/§7), NOT a forkable/parallel Host (the
  Host is the one non-forkable TCB — core_concepts §2). The `/testing` subpath API names
  are kept (published surface).

## Symbol-rename work items (FILED — not executed here)

- **RENAME-1 (coordinated, cross-repo track) — `mounts.ts` `Member.principal` → `grantee`.**
  SPEC_CODE_DEBT §7.1 / core_concepts §4 reserved-word: `Member.principal` (`mounts.ts:509`)
  and the "resolved to a principal" doc-comments (`:515`, `:548`) name a **grantee** (a space
  member `user:<uid>`), not the authority-context Principal. This is the SDK half of the
  shipped cross-repo `principal`→`grantee` rename (Firestore `members/{principal}` +
  site-main + space-manager). **Blast radius:** the exported `Member` interface field →
  consuming apps reading `member.principal` (file-sharing / space-manager UI) + a possible
  `api-snapshot.json` regen. **Gate:** part of the overview §6 shared rename track — do NOT
  do piecemeal. Test: `npm run build && npm test && npm run api:update && npm run api:check`.
- **RENAME-2 (deferred, low value) — the `Tinkerable*` family.** SPEC_CODE_DEBT §1.5,
  out of spec scope, all public exports (high blast radius, zero spec impact). Recorded in
  `REFACTOR_CANDIDATES.md`, not filed as active.
