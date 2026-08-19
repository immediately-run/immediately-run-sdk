import * as react from 'react';

declare const FS_PREFIX = "$fs:";
interface LinkSpace {
    /** Absolute filesystem path of the enclosing corpus's root (e.g. `/app/content`),
     *  or `null` when the document is not corpus-hosted (default). */
    corpusRoot: string | null;
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
}): ResolvedLinkTarget;

export { FS_PREFIX, type LinkSpace, LinkSpaceContext, type ResolvedLinkTarget, normalizeAbsolute, resolveLinkTarget };
