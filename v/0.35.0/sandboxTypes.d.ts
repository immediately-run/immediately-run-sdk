/** The exports object of an evaluated sandbox module (untyped — shape depends on the module). */
type ModuleExports = any;
/** The sandbox runtime's per-module evaluation context: a module's exports plus the
 *  helpers to dynamically import, resolve, and re-evaluate other modules.
 *  (The real type is `EvaluationContext` from `src/bundler/module/Evaluation.ts`.) */
type EvaluationContext = {
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
 */
type Metadata = Record<string, any>;
/** The whole metadata store: a map from repo-relative file path to its frontmatter. */
type FilesMetadata<T = Metadata> = Record<string, T>;
/** The paths a {@link MetadataQueryFunction} selected. */
type FileQueryResult = string[];
/**
 * A query over the metadata store: receive every file's frontmatter keyed by path
 * and return the paths that match. Plain JS — `Object.entries(...).filter(...)` —
 * no query language to learn.
 */
type MetadataQueryFunction<T = Metadata> = (filesMetadata: FilesMetadata<T>) => FileQueryResult;
/** One match from {@link MetadataQueryFunction}: the file path paired with its frontmatter. */
type MetadataQueryEntry<T = Metadata> = {
    path: string;
    meta: T;
};
/**
 * The result of running a metadata query: the matched entries (path + frontmatter),
 * or the error a throwing query produced.
 */
type MetadataQueryResult<T = Metadata> = MetadataQueryEntry<T>[] | {
    error: unknown;
};

export type { EvaluationContext, FileQueryResult, FilesMetadata, Metadata, MetadataQueryEntry, MetadataQueryFunction, MetadataQueryResult, ModuleExports };
