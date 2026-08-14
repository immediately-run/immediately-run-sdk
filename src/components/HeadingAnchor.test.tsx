/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { HeadingAnchor } from './HeadingAnchor';
import { TinkerableContext } from '../TinkerableContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const render = (ui: ReactNode) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, unmount: () => act(() => root.unmount()) };
};

const STATE = {
  outerHref: 'https://immediately.run/present/github/neumark/book-nine-from-here/main/',
  navigationState: {
    mode: 'present',
    provider: 'github',
    namespace: 'neumark',
    repository: 'book-nine-from-here',
    ref: 'main',
    sandboxPath: '/content/characters/gloria-reeves.mdx',
    hash: '',
    search: '',
  },
  routingSpec: {},
  filesMetadata: {},
} as never;

describe('HeadingAnchor — the permalink a reader copies', () => {
  it('builds an absolute HOST url, not one relative to the sandbox iframe', () => {
    // The bug this exists for: the app's document URL is the sandbox's, so a bare `#id`
    // resolved to `https://sandbox.immediately.run/index.html?href=…#id` — meaningless to
    // anyone the reader sends it to.
    const { container, unmount } = render(
      <TinkerableContext.Provider value={STATE}>
        <HeadingAnchor id="the-absolute-ban-on-her" />
      </TinkerableContext.Provider>,
    );
    const href = container.querySelector('a')?.getAttribute('href') ?? '';
    expect(href).toContain('https://immediately.run/');
    expect(href).toContain('neumark/book-nine-from-here');
    expect(href).toContain('#the-absolute-ban-on-her');
    expect(href).not.toContain('sandbox.immediately.run');
    unmount();
  });

  it('carries the ENTRY path, so the permalink opens the right document', () => {
    const { container, unmount } = render(
      <TinkerableContext.Provider value={STATE}>
        <HeadingAnchor id="x" />
      </TinkerableContext.Provider>,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toContain('characters/gloria-reeves.mdx');
    unmount();
  });

  it('falls back to a bare fragment with no routing context', () => {
    // A plain-markdown repo that never called boot() still gets a working in-page anchor.
    const { container, unmount } = render(<HeadingAnchor id="y" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('#y');
    unmount();
  });

  it('renders nothing without an id, rather than a dead `#` link', () => {
    const { container, unmount } = render(<HeadingAnchor />);
    expect(container.querySelector('a')).toBeNull();
    unmount();
  });
});
