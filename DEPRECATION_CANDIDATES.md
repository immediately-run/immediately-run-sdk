# DEPRECATION_CANDIDATES — `@immediately-run/sdk`

Dim-4 (dead / spec-less features) **flag-only** list from the code-verification pass
(`docs/plans/code-verification/02-sdk.md`). **Nothing here is removed.** The SDK is NOT a
fork (unlike `sandbox`/`sandpack`), so the dim-4 surface is small — the focus is
retired-transport residue, not inherited-upstream code.

| Candidate | Why a candidate | Evidence / caveat |
|---|---|---|
| **The legacy in-bundler injection transport** (`injectedBundler.*` / `module.evaluation.module.bundler.*` path in `sandboxUtils.ts transport()`) | Superseded by the `hostRuntime` discovery-global path (SDK_PACKAGING §4). Once every host serves the discovery global and no app loads via the old in-bundler injection, this branch is dead. | **DO NOT REMOVE YET** — still the fallback for hosts/apps on the old transport; removing it would break those. Retire only after a deprecation window + confirming no host uses the injection path. Tracked here, not actioned. |

(No upstream-fork dead surface — this package is first-party.)
