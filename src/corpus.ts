// DEPRECATED alias surface — the pre-2026-08-31 spelling of `./bundle` (R3-482).
//
// `core_concepts §7a`/§11 renamed the file-collection concept `corpus` → **bundle**
// on 2026-08-22; `./bundle.ts` is the implementation and the canonical spelling.
// These eight names are in `api-snapshot.json`, so `ways_of_working §6`'s
// forever-compat rule applies: an app pinned to an older SDK, or one nobody in this
// org can grep, keeps working. Removing them would be its own PR and may simply
// never happen.
//
// **Every name here is a RE-EXPORT, never a re-declaration.** `BundleContext` in
// particular must stay one object across both spellings — a second `createContext`
// would make a provider written as `<CorpusContext>` invisible to `useBundle`, which
// is exactly the silent breakage a compatibility alias exists to prevent.

export type {
  /** @deprecated Renamed to `BundleScope` (R3-482). */
  BundleScope as CorpusScope,
  /** @deprecated Renamed to `BundleEntry` (R3-482). */
  BundleEntry as CorpusEntry,
} from './bundle';

export {
  /** @deprecated Renamed to `BundleContext` (R3-482). Same object — safe to mix. */
  BundleContext as CorpusContext,
  /** @deprecated Renamed to `useBundle` (R3-482). */
  useBundle as useCorpus,
  /** @deprecated Renamed to `useBundleEntries` (R3-482). */
  useBundleEntries as useCorpusEntries,
  /** @deprecated Renamed to `useBundleEntry` (R3-482). */
  useBundleEntry as useCorpusEntry,
  /** @deprecated Renamed to `toBundlePath` (R3-482). */
  toBundlePath as toCorpusPath,
  /** @deprecated Renamed to `fromBundlePath` (R3-482). */
  fromBundlePath as fromCorpusPath,
} from './bundle';

// `useCurrentEntry` carries no `corpus` token, so it is not renamed — but it IS
// re-exported, because `@immediately-run/sdk/corpus` is a real subpath (the `./*`
// wildcard in `exports`) and dropping a name from it would shrink that module's
// surface. `api:check` catches exactly this.
export { useCurrentEntry } from './bundle';
