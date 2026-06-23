import { use, useMemo, useRef } from 'react';
import { TinkerableContext } from './TinkerableContext';
import {
  FilesMetadata,
  Metadata,
  MetadataQueryEntry,
  MetadataQueryFunction,
  MetadataQueryResult,
} from './sandboxTypes';

const entriesEqual = <T>(a: MetadataQueryEntry<T>[], b: MetadataQueryEntry<T>[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    // Unchanged frontmatter keeps its object identity across `metadata-update`
    // merges, so an identity check on `meta` is a sound "did this match change?".
    if (a[i].path !== b[i].path || a[i].meta !== b[i].meta) {
      return false;
    }
  }
  return true;
};

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
export const useMetadataQuery = <T = Metadata>(
  queryFunction: MetadataQueryFunction<T>,
): MetadataQueryResult<T> => {
  const { filesMetadata } = use(TinkerableContext);
  const previous = useRef<MetadataQueryEntry<T>[]>([]);
  return useMemo<MetadataQueryResult<T>>(() => {
    const files = (filesMetadata ?? {}) as FilesMetadata<T>;
    let entries: MetadataQueryEntry<T>[];
    try {
      entries = queryFunction(files).map((path) => ({ path, meta: files[path] }));
    } catch (error) {
      return { error };
    }
    // Preserve the prior array reference when nothing matched differently.
    if (entriesEqual(entries, previous.current)) {
      return previous.current;
    }
    previous.current = entries;
    return entries;
  }, [filesMetadata, queryFunction]);
};

/**
 * Read one file's metadata (MDX frontmatter) by repo-relative path. Returns
 * `undefined` when the path has no metadata. Pass a type parameter for typed
 * field access.
 */
export const useFileMetadata = <T = Metadata>(path: string): T | undefined => {
  const { filesMetadata } = use(TinkerableContext);
  return useMemo(
    () => (filesMetadata ?? {})[path] as T | undefined,
    [path, filesMetadata],
  );
};

/**
 * The raw, reactive metadata store: a map from file path to frontmatter. The
 * escape hatch for apps that want to render their own index rather than express it
 * as a path-returning query. Pass a type parameter for typed frontmatter values.
 */
export const useAllMetadata = <T = Metadata>(): FilesMetadata<T> => {
  const { filesMetadata } = use(TinkerableContext);
  return (filesMetadata ?? {}) as FilesMetadata<T>;
};
