// Ambient declarations for the globals the immediately.run SANDBOX provides to app
// code (PLATFORM_LAYERING_SPEC §4 / S3, R3-276).
//
// Activate them in a consuming app with a one-line reference in any `.d.ts` your
// tsconfig includes:
//
//     /// <reference types="@immediately-run/sdk/ambient" />
//
// This is types-only: nothing here is imported at runtime, so referencing it does
// not pull the SDK's sandbox-adapter tier into the app's bundle graph.
//
// ── What is NOT here: the `fs` module ────────────────────────────────────────
// The async-only `fs` surface the sandbox exposes is declared by
// `@immediately-run/dev-fs/fs` (`/// <reference types="@immediately-run/dev-fs/fs" />`),
// the package that also bridges it to real disk under `vite dev`. It is not
// re-declared here: a second copy of a type declaration is the drift this whole
// project is removing, and the copy would be the one apps hit first. Moving that
// declaration's OWNERSHIP to the SDK (with dev-fs re-referencing it) is the right
// long-run shape and needs a change in that repo — filed as R3-276b.
//
// ── Host obligation: mount before boot ───────────────────────────────────────
// The corpus a viewer reads must be MOUNTED before the app boots. The SDK offers no
// "wait for the mount" affordance for it, and none of the types below imply one:
// app code that reads `fs` at module scope is entitled to assume the filesystem is
// already there, because the host guarantees the mount precedes evaluation. A host
// that boots an app first and mounts second is breaking the contract, not exposing
// a race the app should defend against.

import type { EvaluationContext } from './sandboxTypes';

declare global {
  /**
   * The module currently being evaluated — the sandbox's evaluation context for
   * THIS file, injected as a global by the runtime.
   *
   * Its use in app code is as `<Include baseModule={module} …>`: the anchor a
   * relative include resolves against, so an included file's own relative imports
   * resolve from where it lives rather than from the app root.
   *
   * TypeScript otherwise types a bare `module` from `@types/node` (a CommonJS
   * `NodeModule`, which this is not) or fails to resolve it at all — the reason app
   * repos ended up asserting `module as any` at every call site.
   */
  const module: EvaluationContext;
}

export {};
