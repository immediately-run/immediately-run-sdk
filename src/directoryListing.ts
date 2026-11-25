// What `FileRouter` needs to route a DIRECTORY under `/files/*`. `files/<repo path>` is the
// filesystem-true address for anything in the mount (REPO_CONTENT_DISPATCH_SPEC §9), and
// a folder is part of the mount: a README that links to `tickets/` must land on something
// other than `require('/app/tickets')`, which is what every `/files/*` path used to become.
//
// Kept outside the component (R13) so the decisions — what counts as a directory, entry
// order, which file is the folder's README — are testable without rendering.
import { sandboxFs } from './fs';
import { underAppRoot } from './urlUtils';

/** One entry of a listed directory. `path` is repo-relative with a leading `/`, the form
 *  `Link` turns into a `/files/…` URL; a directory's path ends in `/`. */
export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface DirectoryListing {
  /** Repo-relative, leading `/`, trailing `/` (the root is `/`). */
  dir: string;
  /** The parent directory in the same form, or `null` at the repo root. */
  parent: string | null;
  entries: DirectoryEntry[];
  /** Repo-relative path of the README rendered under the listing, if the folder has one. */
  readme: string | null;
}

/** Shown below the listing, first match wins — GitHub's convention for a folder page. */
const README_NAMES = ['README.md', 'README.mdx', 'readme.md', 'index.md', 'index.mdx'];

/** `tickets/` / `/tickets` / `tickets` → `/tickets/`; `''` and `/` → `/`. */
export const toDirPath = (repoPath: string): string => {
  const trimmed = repoPath.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
};

/** A trailing slash is the URL saying "folder" — no filesystem round-trip needed. */
export const namesDirectory = (repoPath: string): boolean => repoPath === '' || repoPath.endsWith('/');

const fsPromises = () => {
  const fs = sandboxFs();
  return fs?.promises ?? null;
};

/**
 * Whether a repo-relative path is a directory in the sandbox fs. `false` when the path
 * does not exist or no fs is available: the caller then renders it as a file, and the
 * module loader reports the missing file itself — this probe never hides that error.
 */
export const isDirectoryPath = async (repoPath: string): Promise<boolean> => {
  const promises = fsPromises();
  if (!promises) return false;
  try {
    const st = await promises.stat(underAppRoot(repoPath.replace(/^\/+/, '')));
    return typeof st?.isDirectory === 'function' ? Boolean(st.isDirectory()) : false;
  } catch {
    // ENOENT and friends: not a directory. Include surfaces the real error for the path.
    return false;
  }
};

/** Directories first, then files; each group by name, case-insensitively. */
export const sortEntries = (entries: DirectoryEntry[]): DirectoryEntry[] =>
  [...entries].sort(
    (a, b) =>
      Number(b.isDirectory) - Number(a.isDirectory) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.name.localeCompare(b.name),
  );

export const pickReadme = (entries: DirectoryEntry[]): DirectoryEntry | null => {
  for (const name of README_NAMES) {
    const hit = entries.find((e) => !e.isDirectory && e.name === name);
    if (hit) return hit;
  }
  return null;
};

/** Read and shape one directory. Rejects (into the caller's error boundary) when the
 *  fs is unavailable or the read fails — an empty listing would be a lie. */
export const readDirectoryListing = async (repoPath: string): Promise<DirectoryListing> => {
  const promises = fsPromises();
  if (!promises) throw new Error(`Cannot list ${repoPath || '/'}: the sandbox filesystem is unavailable`);
  const dir = toDirPath(repoPath);
  const raw = (await promises.readdir(underAppRoot(dir.slice(1)), { withFileTypes: true })) as Array<{
    name: string;
    isDirectory(): boolean;
  }>;
  const entries = sortEntries(
    raw.map((d) => {
      const isDirectory = d.isDirectory();
      return { name: d.name, isDirectory, path: `${dir}${d.name}${isDirectory ? '/' : ''}` };
    }),
  );
  const parent = dir === '/' ? null : toDirPath(dir.slice(0, -1).replace(/[^/]*$/, ''));
  return { dir, parent, entries, readme: pickReadme(entries)?.path ?? null };
};
