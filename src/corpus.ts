// The corpus scope — what a component rendered INSIDE a corpus may know about it
// (R3-174; MDX_FROM_MOUNT_SPEC §2, §7 1a).
//
// A corpus viewer can register components the corpus itself ships, so an entry writes
// `<ProjectIndex/>` and the viewer resolves it — no engine fork, no import line
// (`MDX_FROM_MOUNT_SPEC` §2's "provider composition is consumer policy"). Those components
// live in the CONTENT filesystem and the viewer lives in its own, and the seam between
// them is this package: a content component cannot import the viewer (it would resolve a
// second copy from the registry, with its own module state, and read the wrong corpus), so
// anything the viewer must tell it has to arrive through a surface both sides already
// share. This is that surface.
//
// **Why paths here are corpus-absolute, not filesystem-absolute.** The metadata store is
// keyed by absolute module path, which under dispatch means `/mnt/<hash>/roadmap/x.mdx` —
// the host-minted chroot. That prefix is host knowledge a viewer may read THROUGH but must
// never publish (the property `grove/src/components/DirectoryList.test.tsx` pins with
// `expect(el.innerHTML).not.toContain('mnt')`), and it is not stable across loads. A
// content component that saw it would embed it in hrefs and keys. So the corpus scope
// rebases every path it hands out to the corpus root (`/roadmap/x.mdx`), which is the same
// address under fork, library and dispatch composition — `PLATFORM_LAYERING_SPEC` §1.1's
// mode-invariance rule, applied to metadata rather than to links.
//
// **Why the href mapping is injected rather than derived.** Corpus path → in-app URL is
// VIEWER policy, and the two packagings genuinely disagree (a fork's URLs are anchored at
// its app root and are already published and cited; a dispatched viewer's are corpus-
// relative). A content component must not have to know which it is in, and the SDK must
// not guess — so the viewer supplies `toHref` and content never computes a URL itself.

import { createContext, use, useMemo } from 'react';
import { useMetadataStore } from './metadataSource';
import type { Metadata } from './sandboxTypes';

/** What a corpus viewer declares about the corpus it is rendering. */
export interface CorpusScope {
  /**
   * Absolute filesystem path of the corpus root, WITHOUT a trailing slash
   * (`/app/content` in a fork, `/mnt/<hash>` under dispatch), or `null` when the
   * surrounding app is not rendering a corpus — the default, which leaves every hook here
   * returning the empty result rather than guessing a root.
   */
  root: string | null;
  /** Corpus-absolute path of the entry currently being read (`/roadmap/R3-174.mdx`), or
   *  `null` when nothing is. This is the entry, NOT the file being rendered: a component
   *  in a `_layout.mdx` wrapping that entry sees the entry, which is what makes furniture
   *  in the layout chain (a status line, a dependency rail) able to describe the page. */
  entry: string | null;
  /** Corpus-absolute path → the href to navigate to it. Supplied by the viewer; the
   *  identity function by default, which is correct for a viewer whose URL space IS the
   *  corpus space. */
  toHref: (corpusPath: string) => string;
}

const EMPTY_SCOPE: CorpusScope = { root: null, entry: null, toHref: (p) => p };

/** Ambient corpus scope. A corpus-rendering app wraps its content tree in
 *  `<CorpusContext value={{ root, entry, toHref }}>`; nesting a second provider inside a
 *  rendered sub-corpus makes the innermost win, as with {@link LinkSpaceContext}. */
export const CorpusContext = createContext<CorpusScope>(EMPTY_SCOPE);

/** Read the ambient corpus scope. Every hook below is a convenience over this. */
export const useCorpus = (): CorpusScope => use(CorpusContext);

/**
 * Filesystem-absolute path → corpus-absolute, or `null` when the path is not inside the
 * corpus. Exact-root and separator-boundary aware, so `/mnt/hash2/x` is not treated as
 * living under `/mnt/hash`.
 */
export const toCorpusPath = (absolute: string, root: string | null): string | null => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, '');
  if (base === '') return absolute;
  if (!absolute.startsWith(`${base}/`)) return null;
  return absolute.slice(base.length);
};

/** Corpus-absolute path → filesystem-absolute, or `null` without a root. The inverse of
 *  {@link toCorpusPath}, for the rare content component that must read raw bytes. */
export const fromCorpusPath = (corpusPath: string, root: string | null): string | null => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, '');
  return `${base}${corpusPath.startsWith('/') ? '' : '/'}${corpusPath}`;
};

/** One entry as content sees it: where it is, where it links, and its frontmatter. */
export interface CorpusEntry<T = Metadata> {
  /** Corpus-absolute path (`/roadmap/R3-174.mdx`). */
  path: string;
  /** The href that navigates to it, per the viewer's mapping. */
  href: string;
  meta: T;
}

/**
 * Every entry in the surrounding corpus, with corpus-absolute paths and viewer-supplied
 * hrefs — the surface a content component queries instead of {@link useMetadataQuery},
 * whose keys are filesystem-absolute and therefore carry the mount prefix.
 *
 * Returns an empty array outside a corpus, so a component written for a corpus renders
 * nothing rather than throwing when someone drops it elsewhere. The array keeps its
 * identity while the store and root are unchanged, so it is safe in dependency arrays.
 */
export const useCorpusEntries = <T = Metadata>(): CorpusEntry<T>[] => {
  const files = useMetadataStore<T>();
  const { root, toHref } = useCorpus();
  return useMemo(() => {
    if (root === null) return [];
    const out: CorpusEntry<T>[] = [];
    for (const [absolute, meta] of Object.entries(files)) {
      const path = toCorpusPath(absolute, root);
      if (path === null) continue;
      out.push({ path, href: toHref(path), meta: meta as T });
    }
    // Path order, so a consumer that does not sort still renders deterministically
    // (object key order is insertion order, which is scan order, which is not stable).
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }, [files, root, toHref]);
};

/** One entry's frontmatter by corpus-absolute path, or `undefined`. */
export const useCorpusEntry = <T = Metadata>(corpusPath: string): T | undefined => {
  const files = useMetadataStore<T>();
  const { root } = useCorpus();
  return useMemo(() => {
    const absolute = fromCorpusPath(corpusPath, root);
    return absolute === null ? undefined : files[absolute];
  }, [corpusPath, files, root]);
};

/** The entry currently being read — `null` outside a corpus, or when the viewer declares
 *  no entry (a directory listing, a 404). See {@link CorpusScope.entry} for why this is
 *  the entry rather than the file the component happens to be written in. */
export const useCurrentEntry = <T = Metadata>(): CorpusEntry<T> | null => {
  const files = useMetadataStore<T>();
  const { root, entry, toHref } = useCorpus();
  return useMemo(() => {
    if (root === null || entry === null) return null;
    const absolute = fromCorpusPath(entry, root);
    const meta = absolute === null ? undefined : files[absolute];
    if (meta === undefined) return null;
    return { path: entry, href: toHref(entry), meta: meta as T };
  }, [files, root, entry, toHref]);
};
