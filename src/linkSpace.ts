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
export const LinkSpaceContext = createContext<LinkSpace>({
  corpusRoot: null,
  bundleChrooted: false,
});

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

/** Anchor a corpus-absolute path at `corpusRoot`, clamping the corpus-relative
 *  half FIRST so the virtual corpus space stays closed under traversal. Shared by
 *  the `/p` branch and — under a bundle chroot — the `$fs:/p` branch, so the two
 *  spellings cannot drift into resolving differently. */
function resolveCorpusAbsolute(path: string, corpusRoot: string | null): ResolvedLinkTarget {
  const inner = normalizeAbsolute(path);
  if (corpusRoot === null || corpusRoot === '/') return { state: 'resolved', path: inner };
  return { state: 'resolved', path: normalizeAbsolute(corpusRoot + inner) };
}

/**
 * Resolve a raw link target (a wikilink target or an in-app href's path half —
 * fragment already split off) to an absolute filesystem path. THE shared resolver:
 * the default `WikiLink`, the markdown `a` override, and safe-content consumers
 * all route through this one function so the two render pipelines cannot drift.
 */
export function resolveLinkTarget(
  raw: string,
  opts: {
    currentFile?: string;
    corpusRoot?: string | null;
    /** See `LinkSpace.bundleChrooted`. Under a bundle-chroot'd grant `$fs:`
     *  resolves in the corpus space, because they are the same space. */
    bundleChrooted?: boolean;
  } = {},
): ResolvedLinkTarget {
  if (raw.startsWith(FS_PREFIX)) {
    const rest = raw.slice(FS_PREFIX.length);
    // Must be mount-absolute. This single rule also fails `$fs:javascript:…`,
    // `$fs:https://…`, and every other smuggled scheme closed.
    if (!rest.startsWith('/')) return { state: 'invalid' };
    // Under a bundle chroot the mount root IS the bundle root, so `$fs:` has
    // nowhere outside to name: it takes the corpus-absolute branch below and the
    // two spellings collapse. `normalizeAbsolute` clamps `..` at the root either
    // way, so neither spelling can climb out — the collapse changes WHERE a
    // `$fs:` link points, never whether it can escape.
    if (opts.bundleChrooted) return resolveCorpusAbsolute(rest, opts.corpusRoot ?? null);
    return { state: 'resolved', path: normalizeAbsolute(rest) };
  }
  if (raw.startsWith('/')) {
    const corpusRoot = opts.corpusRoot ?? null;
    if (corpusRoot !== null) {
      // Clamp the corpus-relative half FIRST (the virtual FS is closed — `/../x`
      // stays inside the corpus), THEN anchor it at the corpus root.
      return resolveCorpusAbsolute(raw, corpusRoot);
    }
    return { state: 'resolved', path: normalizeAbsolute(raw) };
  }
  // Relative: against the authoring file's directory — the same in both spaces.
  if (!opts.currentFile) return { state: 'unresolvable' };
  const dir = opts.currentFile.slice(0, opts.currentFile.lastIndexOf('/'));
  return { state: 'resolved', path: normalizeAbsolute(`${dir}/${raw}`) };
}
