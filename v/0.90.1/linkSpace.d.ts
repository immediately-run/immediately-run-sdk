import * as react from 'react';
import { LinkSpace } from '@immediately-run/mdx-plugins';
export { FS_PREFIX, LinkSpace, ResolvedLinkTarget, normalizeAbsolute, resolveLinkTarget } from '@immediately-run/mdx-plugins';

/** Ambient link space. A bundle-rendering app wraps its document tree in
 *  `<LinkSpaceContext value={{ bundleRoot }}>`; nesting a second provider inside a
 *  rendered sub-bundle makes the innermost root win.
 *
 *  R3-482: the root's canonical spelling is `bundleRoot`; the deprecated
 *  `corpusRoot` field stays in the `LinkSpace` type (mdx-plugins §forever-compat)
 *  and is read as the fallback — only when `bundleRoot` is ABSENT, since an
 *  explicit `bundleRoot: null` is a value ("no bundle root"), not a miss. */
declare const LinkSpaceContext: react.Context<LinkSpace>;

export { LinkSpaceContext };
