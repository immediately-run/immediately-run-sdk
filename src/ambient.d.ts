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
// ── The `fs` module ──────────────────────────────────────────────────────────
// The async-only `fs` surface the sandbox exposes is declared alongside this
// file in `ambient-fs.d.ts` (moved there from `@immediately-run/dev-fs` by
// R3-276b, so the package that owns the surface declares it). Nothing else is
// needed: this one reference is the whole ambient contract.
//
// `@immediately-run/dev-fs/fs` still works — it re-references this declaration
// for a deprecation window (`SDK_PACKAGING_SPEC` §9), because every app repo
// names that path in a `.d.ts` and moves on its own schedule.
//
// ── Host obligation: mount before boot ───────────────────────────────────────
// The corpus a viewer reads must be MOUNTED before the app boots. The SDK offers no
// "wait for the mount" affordance for it, and none of the types below imply one:
// app code that reads `fs` at module scope is entitled to assume the filesystem is
// already there, because the host guarantees the mount precedes evaluation. A host
// that boots an app first and mounts second is breaking the contract, not exposing
// a race the app should defend against.

/// <reference path="./ambient-fs.d.ts" />

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
