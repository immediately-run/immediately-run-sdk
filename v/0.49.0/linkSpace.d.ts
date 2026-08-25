import * as react from 'react';

declare const FS_PREFIX = "$fs:";
interface LinkSpace {
    /** Absolute filesystem path of the enclosing corpus's root (e.g. `/app/content`),
     *  or `null` when the document is not corpus-hosted (default). */
    corpusRoot: string | null;
    /**
     * True when the filesystem this document resolves against is **chroot'd to the
     * bundle** — i.e. the port the app holds was scoped to the bundle's subtree, so
     * the mount root and the bundle root are the same directory
     * (`BUNDLE_LAYERS_SPEC §9`; the `T2`/`T4` wrapper, R3-319 / BL-2).
     *
     * Under that grant `$fs:` **collapses to the scoped root**: `$fs:/p` and `/p`
     * name the same byte, because there is no longer any "mount-absolute" space
     * outside the bundle for `$fs:` to reach into. Without this flag the resolver
     * would hand back a mount-absolute path that the chroot then re-roots anyway —
     * a link that renders as valid and resolves somewhere the author did not mean.
     *
     * **This is an invariant to CREATE, not one to inherit** (`BUNDLE_LAYERS_SPEC
     * §11`): the shipped resolver reads `{currentFile, corpusRoot}` and nothing
     * else, so `$fs:` is bundle-anchored only if something says so. It lives here,
     * in the resolver, rather than as a rule each caller applies by passing
     * `corpusRoot: '/'` — an invariant the arithmetic carries cannot be forgotten
     * at one call site out of five.
     */
    bundleChrooted?: boolean;
}
/** Ambient link space. A corpus-rendering app wraps its document tree in
 *  `<LinkSpaceContext value={{ corpusRoot }}>`; nesting a second provider inside a
 *  rendered sub-corpus makes the innermost root win. */
declare const LinkSpaceContext: react.Context<LinkSpace>;
/** Collapse `.`/`..`/empty segments into a clean absolute path. `..` can never
 *  climb above the root — a (virtual) root's parent is itself, which is what keeps
 *  both the mount space and the corpus space closed under traversal. */
declare const normalizeAbsolute: (path: string) => string;
type ResolvedLinkTarget = 
/** Resolved to an absolute filesystem path (existence NOT checked here). */
{
    state: 'resolved';
    path: string;
}
/** A relative target with no known authoring file — the caller may route
 *  optimistically (it cannot check existence or self-ness generically). */
 | {
    state: 'unresolvable';
}
/** A malformed `$fs:` target (not mount-absolute; includes scheme smuggling).
 *  Callers MUST render this broken/inert — never as an anchor. */
 | {
    state: 'invalid';
};
/**
 * Resolve a raw link target (a wikilink target or an in-app href's path half —
 * fragment already split off) to an absolute filesystem path. THE shared resolver:
 * the default `WikiLink`, the markdown `a` override, and safe-content consumers
 * all route through this one function so the two render pipelines cannot drift.
 */
declare function resolveLinkTarget(raw: string, opts?: {
    currentFile?: string;
    corpusRoot?: string | null;
    /** See `LinkSpace.bundleChrooted`. Under a bundle-chroot'd grant `$fs:`
     *  resolves in the corpus space, because they are the same space. */
    bundleChrooted?: boolean;
}): ResolvedLinkTarget;

export { FS_PREFIX, type LinkSpace, LinkSpaceContext, type ResolvedLinkTarget, normalizeAbsolute, resolveLinkTarget };
