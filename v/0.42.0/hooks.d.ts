import { FsError } from './fs.js';
import { SandboxMount } from './mounts.js';
import { Metadata, FilesMetadata, MetadataQueryFunction, MetadataQueryResult } from './sandboxTypes.js';
import './generated/spaces.js';
import './tasks.js';

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
/** The reactive state returned by {@link useObjectUrl}. */
interface ObjectUrlState {
    /** The object URL once the bytes have loaded; `null` while loading or on error. */
    url: string | null;
    /** True while the file is being read. */
    loading: boolean;
    /** The {@link FsError} if the read failed (`not-found`, `unavailable`, …), else `null`. */
    error: FsError | null;
}
/**
 * Read a file from a mount into an **object URL** for `<img src>`, revoking it
 * automatically on unmount or when `mount`/`relPath` changes. This is the React
 * answer to "an opaque-origin iframe can't fetch a mount path": it reads the bytes
 * off the sandbox ZenFS ({@link openFs}) and hands you a URL to drop into an
 * `<img>`, and it owns the create/revoke lifecycle so you never leak a URL.
 *
 * Pass `null`/`undefined` for `mount` or `relPath` to mean "nothing to load yet"
 * (idle state, no read). For a ready-made element use `MountImage`.
 *
 * ```tsx
 * const { url, loading, error } = useObjectUrl(mount, 'photos/cat.png');
 * if (loading) return <Spinner />;
 * if (error || !url) return <span>missing</span>;
 * return <img src={url} alt="cat" />;
 * ```
 */
declare const useObjectUrl: (mount: SandboxMount | null | undefined, relPath: string | null | undefined, opts?: {
    type?: string;
}) => ObjectUrlState;

export { type ObjectUrlState, useAllMetadata, useFileMetadata, useMetadataQuery, useObjectUrl };
