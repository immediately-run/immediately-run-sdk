import * as react from 'react';
import { LinkSpace } from '@immediately-run/mdx-plugins';
export { FS_PREFIX, LinkSpace, ResolvedLinkTarget, normalizeAbsolute, resolveLinkTarget } from '@immediately-run/mdx-plugins';

/** Ambient link space. A corpus-rendering app wraps its document tree in
 *  `<LinkSpaceContext value={{ corpusRoot }}>`; nesting a second provider inside a
 *  rendered sub-corpus makes the innermost root win. */
declare const LinkSpaceContext: react.Context<LinkSpace>;

export { LinkSpaceContext };
