import * as react from 'react';
import { Metadata } from './sandboxTypes.js';

/** What a bundle viewer declares about the bundle it is rendering. */
interface BundleScope {
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
/** Ambient bundle scope. A bundle-rendering app wraps its content tree in
 *  `<BundleContext value={{ root, entry, toHref }}>`; nesting a second provider inside a
 *  rendered sub-bundle makes the innermost win, as with {@link LinkSpaceContext}. */
declare const BundleContext: react.Context<BundleScope>;
/** Read the ambient bundle scope. Every hook below is a convenience over this. */
declare const useBundle: () => BundleScope;
/**
 * Filesystem-absolute path → bundle-absolute, or `null` when the path is not inside the
 * bundle. Exact-root and separator-boundary aware, so `/mnt/hash2/x` is not treated as
 * living under `/mnt/hash`.
 */
declare const toBundlePath: (absolute: string, root: string | null) => string | null;
/** Bundle-absolute path → filesystem-absolute, or `null` without a root. The inverse of
 *  {@link toBundlePath}, for the rare content component that must read raw bytes. */
declare const fromBundlePath: (bundlePath: string, root: string | null) => string | null;
/** One entry as content sees it: where it is, where it links, and its frontmatter. */
interface BundleEntry<T = Metadata> {
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
declare const useBundleEntries: <T = Metadata>() => BundleEntry<T>[];
/** One entry's frontmatter by bundle-absolute path, or `undefined`. */
declare const useBundleEntry: <T = Metadata>(bundlePath: string) => T | undefined;
/** The entry currently being read — `null` outside a bundle, or when the viewer declares
 *  no entry (a directory listing, a 404). See {@link BundleScope.entry} for why this is
 *  the entry rather than the file the component happens to be written in. */
declare const useCurrentEntry: <T = Metadata>() => BundleEntry<T> | null;

export { BundleContext, type BundleEntry, type BundleScope, fromBundlePath, toBundlePath, useBundle, useBundleEntries, useBundleEntry, useCurrentEntry };
