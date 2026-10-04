// Shared render harness for the LinkSpaceContext suites (R3-783, review round 1):
// WikiLink, MDXComponents' `a`, and mdxDefaults' `$fs:`/corpus-root cases all mount
// a component under the same TinkerableContext + LinkSpaceContext +
// RenderExportedComponentContext stack — one helper, one outerHref, so the suites
// cannot drift on the plumbing. Lives in test/ (not a logic path), beside
// mockChannelTransport.ts.

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { LinkSpaceContext, type LinkSpace } from '../src/linkSpace';
import { RenderExportedComponentContext } from '../src/components/Include';
import { TinkerableContext, type TinkerableState } from '../src/TinkerableContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A TinkerableContext value good enough for <Link> (and thus <WikiLink>) to build
// an in-app href without throwing (constructUrl needs a real outerHref).
const tinkerableState = (files: TinkerableState['filesMetadata'] = {}): TinkerableState => ({
  outerHref: 'https://localhost/present/github/acme/blog/main/about',
  navigationState: {
    mode: 'present',
    provider: 'github',
    namespace: 'acme',
    repository: 'blog',
    ref: 'main',
    sandboxPath: '/about',
    hash: '',
    search: '',
  },
  routingSpec: { routes: [] },
  filesMetadata: files,
});

/** Mount `ui` under a LinkSpaceContext (default: the empty space) plus the
 *  TinkerableContext and (when `currentFile` is given) the Include render context
 *  WikiLink reads its authoring file from. Returns the container, an `href()`
 *  accessor for the rendered anchor, and an unmount that also removes the
 *  container. */
export const renderWithLinkSpace = (
  ui: ReactNode,
  {
    space = {},
    currentFile,
    files,
  }: {
    space?: LinkSpace;
    currentFile?: string;
    files?: TinkerableState['filesMetadata'];
  } = {},
) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rctx = currentFile
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ evaluationContext: { evaluation: { module: { filepath: currentFile, source: '' } } } } as any)
    : null;
  act(() => {
    root.render(
      <TinkerableContext value={tinkerableState(files)}>
        <LinkSpaceContext value={space}>
          <RenderExportedComponentContext value={rctx}>{ui}</RenderExportedComponentContext>
        </LinkSpaceContext>
      </TinkerableContext>,
    );
  });
  return {
    container,
    href: () => container.querySelector('a')?.getAttribute('href'),
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
};
