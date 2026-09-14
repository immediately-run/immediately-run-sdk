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
 * A query may return RECORDS instead of bare paths (R3-276) — `{ path, ...extra }`
 * — and the extra fields ride along on each entry, so something derived while
 * selecting does not have to be recomputed downstream:
 * ```ts
 * const posts = useMetadataQuery<PostMeta, { year: string }>((files) =>
 *   Object.entries(files).map(([path, m]) => ({ path, year: m.date.slice(0, 4) })),
 * );
 * ```
 * The store it queries is the nearest {@link MetadataSource}, else the host's.
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
declare const useMetadataQuery: <T = Metadata, E extends object = {}>(queryFunction: MetadataQueryFunction<T>) => MetadataQueryResult<T, E>;
/**
 * Read one file's metadata (MDX frontmatter) by path. Returns `undefined` when the
 * path has no metadata. Pass a type parameter for typed field access.
 *
 * **The store is keyed by ABSOLUTE module path** — `/app/content/post.mdx`, the same
 * identifier `fs`, `module.dynamicImport` and `<Include>` use — not by the
 * repo-relative path this doc claimed until R3-276. Keeping metadata in the file
 * space is what lets an app read a file's metadata and render that same file by the
 * same path (`sandbox/src/bundler/metadataKey.test.ts` pins it).
 *
 * A repo-relative path (`/content/post.mdx`) is accepted as a fallback: if the path
 * is not a key, it is retried under the app root via the shared
 * `underAppRoot` helper (R3-275). That is additive — it only turns a previous
 * `undefined` into a value — and it exists because the old doc told people to pass
 * exactly that form. A path a {@link MetadataSource} provided in some other key
 * space is looked up as given, unchanged.
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
 *
 * Off-host: under `vite dev` with the `@immediately-run/dev-fs` plugin (>= 0.5.0)
 * this works against your local disk — the plugin publishes its fs bridge where
 * the SDK discovers the sandbox fs (see `sandboxFs` in `fs.ts`). Under plain
 * `vite dev` (no plugin) there is no filesystem at all, and the hook settles to
 * `{ url: null, loading: false, error }` with `error.code === 'unavailable'` —
 * render the error/absent state, don't treat it as forever-loading.
 */
declare const useObjectUrl: (mount: SandboxMount | null | undefined, relPath: string | null | undefined, opts?: {
    type?: string;
}) => ObjectUrlState;

export { type ObjectUrlState, useAllMetadata, useFileMetadata, useMetadataQuery, useObjectUrl };
