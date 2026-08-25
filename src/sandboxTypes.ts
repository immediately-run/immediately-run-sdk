/** The exports object of an evaluated sandbox module (untyped — shape depends on the module). */
export type ModuleExports = any;

/** The sandbox runtime's per-module evaluation context: a module's exports plus the
 *  helpers to dynamically import, resolve, and re-evaluate other modules.
 *  (The real type is `EvaluationContext` from `src/bundler/module/Evaluation.ts`.) */
export type EvaluationContext = {
  exports: ModuleExports;
  dynamicImport: (moduleToImport: string, symbolToImport: string) => Promise<ModuleExports>;
  getModuleEvaluationContext: (moduleName: string) => Promise<EvaluationContext>;
  resolve: (moduleName: string) => Promise<string>;
  evaluation: {
    module: {
      source: string;
      filepath: string;
    };
  };
};

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

/**
 * A record a query may return INSTEAD of a bare path (R3-276): the path plus
 * whatever the query computed on the way to selecting it.
 *
 * The motivating case is a query that derives something per match — a sort key, a
 * section, a formatted date — and would otherwise have to recompute it downstream
 * from `meta`, or smuggle it through a closure. Returning it here keeps the
 * derivation next to the selection that needed it.
 */
export type MetadataQueryRecord = { path: string } & Record<string, unknown>;

/** What a {@link MetadataQueryFunction} selected: paths, or {@link MetadataQueryRecord}s.
 *  The two forms may not be mixed in one result — a query returns one or the other. */
export type FileQueryResult = string[] | MetadataQueryRecord[];

/**
 * A query over the metadata store: receive every file's frontmatter keyed by path
 * and return the paths that match. Plain JS — `Object.entries(...).filter(...)` —
 * no query language to learn.
 *
 * Return bare paths, or records carrying extra fields alongside `path` (R3-276);
 * either way the hook resolves each path to its frontmatter.
 */
export type MetadataQueryFunction<T = Metadata> = (filesMetadata: FilesMetadata<T>) => FileQueryResult;

/**
 * One match from {@link MetadataQueryFunction}: the file path paired with its
 * frontmatter, plus any extra fields the query returned as a
 * {@link MetadataQueryRecord}.
 *
 * `E` defaults to `{}`, so every existing `MetadataQueryEntry<T>` keeps meaning
 * exactly what it meant — the extra-fields form is opt-in at the type level.
 * `path` and `meta` are applied AFTER the record's own fields, so a query cannot
 * shadow them with something else.
 */
export type MetadataQueryEntry<T = Metadata, E extends object = {}> = E & {
  path: string;
  meta: T;
};

/**
 * The result of running a metadata query: the matched entries (path + frontmatter),
 * or the error a throwing query produced.
 */
export type MetadataQueryResult<T = Metadata, E extends object = {}> = MetadataQueryEntry<T, E>[] | { error: unknown };
