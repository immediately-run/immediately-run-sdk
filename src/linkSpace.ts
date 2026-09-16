// Link path spaces (R3-273; REPO_CONTENT_DISPATCH_SPEC §9 decision, 2026-08-17).
// R3-279: the RESOLVER CORE (resolveLinkTarget / normalizeAbsolute / FS_PREFIX /
// ResolvedLinkTarget) moved to `@immediately-run/mdx-plugins` — beside its parity
// fixture — and is re-exported here unchanged (API-stable). This module keeps the
// REACT surface (LinkSpaceContext): the provider a bundle-rendering app wraps its
// document tree in. Consumers importing from '@immediately-run/sdk/linkSpace' see
// exactly the same names.
//
// A document link's target resolves in one of two spaces:
//
// - DEFAULT — the enclosing bundle's virtual filesystem. RELATIVE targets resolve
//   against the authoring file (identical in both spaces); ABSOLUTE targets
//   (`/x/y.mdx`) resolve from the bundle root when an enclosing `LinkSpaceContext`
//   declares one, else from the filesystem root. A non-bundle app declares nothing
//   and keeps today's behavior bit-for-bit (its fs root IS its only root).
//
// - `$fs:` — the explicit filesystem space: `$fs:/content/x.mdx` resolves from the
//   root of the filesystem the app reads, escaping bundle-relative addressing.
//
// `$fs:` changes ADDRESSING, never REACH: resolution is pure path arithmetic and
// existence is checked against the same in-mount metadata the default space uses —
// nothing is fetched, and a link can never name what the app cannot already read.
// A malformed `$fs:` target (anything not mount-absolute — which also catches
// scheme smuggling like `$fs:javascript:…`) is INVALID and must render as a broken
// link, never an anchor.
//
// Bundle nesting: `LinkSpaceContext` providers nest, and the NEAREST one wins —
// which is exactly the innermost-enclosing-bundle rule (bundle encapsulation): a
// document rendered inside a nested bundle resolves against the nested bundle.

import { createContext } from 'react';

export { FS_PREFIX, normalizeAbsolute, resolveLinkTarget } from '@immediately-run/mdx-plugins';
export type { ResolvedLinkTarget, LinkSpace } from '@immediately-run/mdx-plugins';
import type { LinkSpace as LinkSpaceShape } from '@immediately-run/mdx-plugins';

/** Ambient link space. A bundle-rendering app wraps its document tree in
 *  `<LinkSpaceContext value={{ bundleRoot }}>`; nesting a second provider inside a
 *  rendered sub-bundle makes the innermost root win.
 *
 *  R3-482: the root's canonical spelling is `bundleRoot`; the deprecated
 *  `corpusRoot` field stays in the `LinkSpace` type (mdx-plugins §forever-compat)
 *  and is read as the fallback — only when `bundleRoot` is ABSENT, since an
 *  explicit `bundleRoot: null` is a value ("no bundle root"), not a miss. */
export const LinkSpaceContext = createContext<LinkSpaceShape>({
  bundleRoot: null,
  bundleChrooted: false,
});
