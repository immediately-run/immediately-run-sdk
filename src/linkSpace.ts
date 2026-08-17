// Link path spaces (R3-273; REPO_CONTENT_DISPATCH_SPEC §9 decision, 2026-08-17).
//
// A document link's target resolves in one of two spaces:
//
// - DEFAULT — the enclosing corpus's virtual filesystem. RELATIVE targets resolve
//   against the authoring file (identical in both spaces); ABSOLUTE targets
//   (`/x/y.mdx`) resolve from the corpus root when an enclosing `LinkSpaceContext`
//   declares one, else from the filesystem root. A non-corpus app declares nothing
//   and keeps today's behavior bit-for-bit (its fs root IS its only root).
//
// - `$fs:` — the explicit filesystem space: `$fs:/content/x.mdx` resolves from the
//   root of the filesystem the app reads, escaping corpus-relative addressing.
//
// `$fs:` changes ADDRESSING, never REACH: resolution is pure path arithmetic and
// existence is checked against the same in-mount metadata the default space uses —
// nothing is fetched, and a link can never name what the app cannot already read.
// A malformed `$fs:` target (anything not mount-absolute — which also catches
// scheme smuggling like `$fs:javascript:…`) is INVALID and must render as a broken
// link, never an anchor.
//
// Corpus nesting: `LinkSpaceContext` providers nest, and the NEAREST one wins —
// which is exactly the innermost-enclosing-corpus rule (bundle encapsulation): a
// document rendered inside a nested corpus resolves against the nested corpus.

import { createContext } from 'react';

export const FS_PREFIX = '$fs:';

export interface LinkSpace {
  /** Absolute filesystem path of the enclosing corpus's root (e.g. `/app/content`),
   *  or `null` when the document is not corpus-hosted (default). */
  corpusRoot: string | null;
}

/** Ambient link space. A corpus-rendering app wraps its document tree in
 *  `<LinkSpaceContext value={{ corpusRoot }}>`; nesting a second provider inside a
 *  rendered sub-corpus makes the innermost root win. */
export const LinkSpaceContext = createContext<LinkSpace>({ corpusRoot: null });

/** Collapse `.`/`..`/empty segments into a clean absolute path. `..` can never
 *  climb above the root — a (virtual) root's parent is itself, which is what keeps
 *  both the mount space and the corpus space closed under traversal. */
export const normalizeAbsolute = (path: string): string => {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
};

export type ResolvedLinkTarget =
  /** Resolved to an absolute filesystem path (existence NOT checked here). */
  | { state: 'resolved'; path: string }
  /** A relative target with no known authoring file — the caller may route
   *  optimistically (it cannot check existence or self-ness generically). */
  | { state: 'unresolvable' }
  /** A malformed `$fs:` target (not mount-absolute; includes scheme smuggling).
   *  Callers MUST render this broken/inert — never as an anchor. */
  | { state: 'invalid' };

/**
 * Resolve a raw link target (a wikilink target or an in-app href's path half —
 * fragment already split off) to an absolute filesystem path. THE shared resolver:
 * the default `WikiLink`, the markdown `a` override, and safe-content consumers
 * all route through this one function so the two render pipelines cannot drift.
 */
export function resolveLinkTarget(
  raw: string,
  opts: { currentFile?: string; corpusRoot?: string | null } = {},
): ResolvedLinkTarget {
  if (raw.startsWith(FS_PREFIX)) {
    const rest = raw.slice(FS_PREFIX.length);
    // Must be mount-absolute. This single rule also fails `$fs:javascript:…`,
    // `$fs:https://…`, and every other smuggled scheme closed.
    if (!rest.startsWith('/')) return { state: 'invalid' };
    return { state: 'resolved', path: normalizeAbsolute(rest) };
  }
  if (raw.startsWith('/')) {
    const corpusRoot = opts.corpusRoot ?? null;
    if (corpusRoot !== null) {
      // Clamp the corpus-relative half FIRST (the virtual FS is closed — `/../x`
      // stays inside the corpus), THEN anchor it at the corpus root.
      return { state: 'resolved', path: normalizeAbsolute(corpusRoot + normalizeAbsolute(raw)) };
    }
    return { state: 'resolved', path: normalizeAbsolute(raw) };
  }
  // Relative: against the authoring file's directory — the same in both spaces.
  if (!opts.currentFile) return { state: 'unresolvable' };
  const dir = opts.currentFile.slice(0, opts.currentFile.lastIndexOf('/'));
  return { state: 'resolved', path: normalizeAbsolute(`${dir}/${raw}`) };
}
