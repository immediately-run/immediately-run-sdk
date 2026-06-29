import { Metadata, FilesMetadata, MetadataQueryFunction, MetadataQueryResult } from './sandboxTypes.js';

/**
 * Query the file metadata store (MDX frontmatter) with a plain JS function.
 *
 * The query receives every file's frontmatter keyed by path and returns the paths
 * that match; the hook resolves each path back to its frontmatter and returns an
 * array of `{ path, meta }` entries — so a single call gives you everything you
 * filtered on, with no second lookup. A throwing query is reported as `{ error }`
 * rather than crashing the render.
 *
 * The query runs synchronously during render (no empty first frame), and the
 * returned array keeps its identity while the matches are unchanged, so it is safe
 * to use directly in downstream `useMemo`/`useEffect` dependency arrays.
 *
 * Pass a type parameter to get typed frontmatter throughout:
 * ```ts
 * interface PostMeta { title: string; date: string; draft?: boolean }
 * const posts = useMetadataQuery<PostMeta>((files) =>
 *   Object.entries(files)
 *     .filter(([, m]) => !m.draft)
 *     .sort(([, a], [, b]) => b.date.localeCompare(a.date))
 *     .map(([path]) => path),
 * );
 * ```
 */
declare const useMetadataQuery: <T = Metadata>(queryFunction: MetadataQueryFunction<T>) => MetadataQueryResult<T>;
/**
 * Read one file's metadata (MDX frontmatter) by repo-relative path. Returns
 * `undefined` when the path has no metadata. Pass a type parameter for typed
 * field access.
 */
declare const useFileMetadata: <T = Metadata>(path: string) => T | undefined;
/**
 * The raw, reactive metadata store: a map from file path to frontmatter. The
 * escape hatch for apps that want to render their own index rather than express it
 * as a path-returning query. Pass a type parameter for typed frontmatter values.
 */
declare const useAllMetadata: <T = Metadata>() => FilesMetadata<T>;

export { useAllMetadata, useFileMetadata, useMetadataQuery };
