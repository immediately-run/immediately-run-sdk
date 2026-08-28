import * as react from 'react';
import { Metadata } from './sandboxTypes.js';

/** What a corpus viewer declares about the corpus it is rendering. */
interface CorpusScope {
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
/** Ambient corpus scope. A corpus-rendering app wraps its content tree in
 *  `<CorpusContext value={{ root, entry, toHref }}>`; nesting a second provider inside a
 *  rendered sub-corpus makes the innermost win, as with {@link LinkSpaceContext}. */
declare const CorpusContext: react.Context<CorpusScope>;
/** Read the ambient corpus scope. Every hook below is a convenience over this. */
declare const useCorpus: () => CorpusScope;
/**
 * Filesystem-absolute path → corpus-absolute, or `null` when the path is not inside the
 * corpus. Exact-root and separator-boundary aware, so `/mnt/hash2/x` is not treated as
 * living under `/mnt/hash`.
 */
declare const toCorpusPath: (absolute: string, root: string | null) => string | null;
/** Corpus-absolute path → filesystem-absolute, or `null` without a root. The inverse of
 *  {@link toCorpusPath}, for the rare content component that must read raw bytes. */
declare const fromCorpusPath: (corpusPath: string, root: string | null) => string | null;
/** One entry as content sees it: where it is, where it links, and its frontmatter. */
interface CorpusEntry<T = Metadata> {
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
declare const useCorpusEntries: <T = Metadata>() => CorpusEntry<T>[];
/** One entry's frontmatter by corpus-absolute path, or `undefined`. */
declare const useCorpusEntry: <T = Metadata>(corpusPath: string) => T | undefined;
/** The entry currently being read — `null` outside a corpus, or when the viewer declares
 *  no entry (a directory listing, a 404). See {@link CorpusScope.entry} for why this is
 *  the entry rather than the file the component happens to be written in. */
declare const useCurrentEntry: <T = Metadata>() => CorpusEntry<T> | null;

export { CorpusContext, type CorpusEntry, type CorpusScope, fromCorpusPath, toCorpusPath, useCorpus, useCorpusEntries, useCorpusEntry, useCurrentEntry };
