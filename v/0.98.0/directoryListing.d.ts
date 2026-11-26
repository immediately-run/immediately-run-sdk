/** One entry of a listed directory. `path` is repo-relative with a leading `/`, the form
 *  `Link` turns into a `/files/…` URL; a directory's path ends in `/`. */
interface DirectoryEntry {
    name: string;
    path: string;
    isDirectory: boolean;
}
interface DirectoryListing {
    /** Repo-relative, leading `/`, trailing `/` (the root is `/`). */
    dir: string;
    /** The parent directory in the same form, or `null` at the repo root. */
    parent: string | null;
    entries: DirectoryEntry[];
    /** Repo-relative path of the README rendered under the listing, if the folder has one. */
    readme: string | null;
}
/** `tickets/` / `/tickets` / `tickets` → `/tickets/`; `''` and `/` → `/`. */
declare const toDirPath: (repoPath: string) => string;
/** A trailing slash is the URL saying "folder" — no filesystem round-trip needed. */
declare const namesDirectory: (repoPath: string) => boolean;
/**
 * Whether a repo-relative path is a directory in the sandbox fs. `false` when the path
 * does not exist or no fs is available: the caller then renders it as a file, and the
 * module loader reports the missing file itself — this probe never hides that error.
 */
declare const isDirectoryPath: (repoPath: string) => Promise<boolean>;
/** Directories first, then files; each group by name, case-insensitively. */
declare const sortEntries: (entries: DirectoryEntry[]) => DirectoryEntry[];
declare const pickReadme: (entries: DirectoryEntry[]) => DirectoryEntry | null;
/** Read and shape one directory. Rejects (into the caller's error boundary) when the
 *  fs is unavailable or the read fails — an empty listing would be a lie. */
declare const readDirectoryListing: (repoPath: string) => Promise<DirectoryListing>;

export { type DirectoryEntry, type DirectoryListing, isDirectoryPath, namesDirectory, pickReadme, readDirectoryListing, sortEntries, toDirPath };
