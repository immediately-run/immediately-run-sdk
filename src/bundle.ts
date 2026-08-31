// The bundle scope — what a component rendered INSIDE a bundle may know about it
// (R3-174; MDX_FROM_MOUNT_SPEC §2, §7 1a).
//
// A bundle viewer can register components the bundle itself ships, so an entry writes
// `<ProjectIndex/>` and the viewer resolves it — no engine fork, no import line
// (`MDX_FROM_MOUNT_SPEC` §2's "provider composition is consumer policy"). Those components
// live in the CONTENT filesystem and the viewer lives in its own, and the seam between
// them is this package: a content component cannot import the viewer (it would resolve a
// second copy from the registry, with its own module state, and read the wrong bundle), so
// anything the viewer must tell it has to arrive through a surface both sides already
// share. This is that surface.
//
// **Why paths here are bundle-absolute, not filesystem-absolute.** The metadata store is
// keyed by absolute module path, which under dispatch means `/mnt/<hash>/roadmap/x.mdx` —
// the host-minted chroot. That prefix is host knowledge a viewer may read THROUGH but must
// never publish (the property `grove/src/components/DirectoryList.test.tsx` pins with
// `expect(el.innerHTML).not.toContain('mnt')`), and it is not stable across loads. A
// content component that saw it would embed it in hrefs and keys. So the bundle scope
// rebases every path it hands out to the bundle root (`/roadmap/x.mdx`), which is the same
// address under fork, library and dispatch composition — `PLATFORM_LAYERING_SPEC` §1.1's
// mode-invariance rule, applied to metadata rather than to links.
//
// **Why the href mapping is injected rather than derived.** Bundle path → in-app URL is
// VIEWER policy, and the two packagings genuinely disagree (a fork's URLs are anchored at
// its app root and are already published and cited; a dispatched viewer's are bundle-
// relative). A content component must not have to know which it is in, and the SDK must
// not guess — so the viewer supplies `toHref` and content never computes a URL itself.

import { createContext, use, useMemo } from 'react';
import { useMetadataStore } from './metadataSource';
import type { Metadata } from './sandboxTypes';

/** What a bundle viewer declares about the bundle it is rendering. */
export interface BundleScope {
  /**
   * Absolute filesystem path of the bundle root, WITHOUT a trailing slash
   * (`/app/content` in a fork, `/mnt/<hash>` under dispatch), or `null` when the
   * surrounding app is not rendering a bundle — the default, which leaves every hook here
   * returning the empty result rather than guessing a root.
   */
  root: string | null;
  /** Bundle-absolute path of the entry currently being read (`/roadmap/R3-174.mdx`), or
   *  `null` when nothing is. This is the entry, NOT the file being rendered: a component
   *  in a `_layout.mdx` wrapping that entry sees the entry, which is what makes furniture
   *  in the layout chain (a status line, a dependency rail) able to describe the page. */
  entry: string | null;
  /** Bundle-absolute path → the href to navigate to it. Supplied by the viewer; the
   *  identity function by default, which is correct for a viewer whose URL space IS the
   *  bundle space. */
  toHref: (bundlePath: string) => string;
}

const EMPTY_SCOPE: BundleScope = { root: null, entry: null, toHref: (p) => p };

/** Ambient bundle scope. A bundle-rendering app wraps its content tree in
 *  `<BundleContext value={{ root, entry, toHref }}>`; nesting a second provider inside a
 *  rendered sub-bundle makes the innermost win, as with {@link LinkSpaceContext}. */
export const BundleContext = createContext<BundleScope>(EMPTY_SCOPE);

/** Read the ambient bundle scope. Every hook below is a convenience over this. */
export const useBundle = (): BundleScope => use(BundleContext);

/**
 * Filesystem-absolute path → bundle-absolute, or `null` when the path is not inside the
 * bundle. Exact-root and separator-boundary aware, so `/mnt/hash2/x` is not treated as
 * living under `/mnt/hash`.
 */
export const toBundlePath = (absolute: string, root: string | null): string | null => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, '');
  if (base === '') return absolute;
  if (!absolute.startsWith(`${base}/`)) return null;
  return absolute.slice(base.length);
};

/** Bundle-absolute path → filesystem-absolute, or `null` without a root. The inverse of
 *  {@link toBundlePath}, for the rare content component that must read raw bytes. */
export const fromBundlePath = (bundlePath: string, root: string | null): string | null => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, '');
  return `${base}${bundlePath.startsWith('/') ? '' : '/'}${bundlePath}`;
};

/** One entry as content sees it: where it is, where it links, and its frontmatter. */
export interface BundleEntry<T = Metadata> {
  /** Bundle-absolute path (`/roadmap/R3-174.mdx`). */
  path: string;
  /** The href that navigates to it, per the viewer's mapping. */
  href: string;
  meta: T;
}

/**
 * Every entry in the surrounding bundle, with bundle-absolute paths and viewer-supplied
 * hrefs — the surface a content component queries instead of {@link useMetadataQuery},
 * whose keys are filesystem-absolute and therefore carry the mount prefix.
 *
 * Returns an empty array outside a bundle, so a component written for a bundle renders
 * nothing rather than throwing when someone drops it elsewhere. The array keeps its
 * identity while the store and root are unchanged, so it is safe in dependency arrays.
 */
export const useBundleEntries = <T = Metadata>(): BundleEntry<T>[] => {
  const files = useMetadataStore<T>();
  const { root, toHref } = useBundle();
  return useMemo(() => {
    if (root === null) return [];
    const out: BundleEntry<T>[] = [];
    for (const [absolute, meta] of Object.entries(files)) {
      const path = toBundlePath(absolute, root);
      if (path === null) continue;
      out.push({ path, href: toHref(path), meta: meta as T });
    }
    // Path order, so a consumer that does not sort still renders deterministically
    // (object key order is insertion order, which is scan order, which is not stable).
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }, [files, root, toHref]);
};

/** One entry's frontmatter by bundle-absolute path, or `undefined`. */
export const useBundleEntry = <T = Metadata>(bundlePath: string): T | undefined => {
  const files = useMetadataStore<T>();
  const { root } = useBundle();
  return useMemo(() => {
    const absolute = fromBundlePath(bundlePath, root);
    return absolute === null ? undefined : files[absolute];
  }, [bundlePath, files, root]);
};

/** The entry currently being read — `null` outside a bundle, or when the viewer declares
 *  no entry (a directory listing, a 404). See {@link BundleScope.entry} for why this is
 *  the entry rather than the file the component happens to be written in. */
export const useCurrentEntry = <T = Metadata>(): BundleEntry<T> | null => {
  const files = useMetadataStore<T>();
  const { root, entry, toHref } = useBundle();
  return useMemo(() => {
    if (root === null || entry === null) return null;
    const absolute = fromBundlePath(entry, root);
    const meta = absolute === null ? undefined : files[absolute];
    if (meta === undefined) return null;
    return { path: entry, href: toHref(entry), meta: meta as T };
  }, [files, root, entry, toHref]);
};
