/** The exports object of an evaluated sandbox module (untyped — shape depends on the module). */
export type ModuleExports = any

/** The sandbox runtime's per-module evaluation context: a module's exports plus the
 *  helpers to dynamically import, resolve, and re-evaluate other modules.
 *  (The real type is `EvaluationContext` from `src/bundler/module/Evaluation.ts`.) */
export type EvaluationContext = {
  exports: ModuleExports;
  dynamicImport: (moduleToImport: string, symbolToImport:string) => Promise<ModuleExports>;
  getModuleEvaluationContext: (moduleName: string) =>  Promise<EvaluationContext>;
  resolve: (moduleName: string) => Promise<string>;
  evaluation: {
    module: {
      source: string;
      filepath: string;
    }
  }
}

/**
 * The parsed frontmatter of a single file. Apps can supply their own shape as the
 * `T` type parameter on the metadata hooks for typed field access; it defaults to
 * an open record.
 *
 * The ENVELOPE this widens is `Frontmatter` from
 * `@immediately-run/platform-constants` (R3-275): string keys, JSON-serializable
 * values, the emitter's object-identity semantics, and the empty-frontmatter drop —
 * one statement of the contract, shared with the CLI that writes the sidecar and the
 * sandbox that reads it. This alias stays `any`-valued deliberately: app code
 * indexes frontmatter fields directly (`meta.title.length`), and tightening it to
 * `JsonValue` would turn every such access into a type error for a guarantee the
 * *values* never made (they are open by the spec's §6 decision).
 */
export type Metadata = Record<string, any>;

/** The whole metadata store: a map from repo-relative file path to its frontmatter. */
export type FilesMetadata<T = Metadata> = Record<string, T>;

/** The paths a {@link MetadataQueryFunction} selected. */
export type FileQueryResult = string[]

/**
 * A query over the metadata store: receive every file's frontmatter keyed by path
 * and return the paths that match. Plain JS — `Object.entries(...).filter(...)` —
 * no query language to learn.
 */
export type MetadataQueryFunction<T = Metadata> = (filesMetadata: FilesMetadata<T>) => FileQueryResult;

/** One match from {@link MetadataQueryFunction}: the file path paired with its frontmatter. */
export type MetadataQueryEntry<T = Metadata> = { path: string; meta: T };

/**
 * The result of running a metadata query: the matched entries (path + frontmatter),
 * or the error a throwing query produced.
 */
export type MetadataQueryResult<T = Metadata> = MetadataQueryEntry<T>[] | { error: unknown }
