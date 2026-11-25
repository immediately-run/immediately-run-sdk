/**
 * @jest-environment jsdom
 */
// FileRouter wraps routed Markdown in the prose article and leaves everything else alone.
// The route params come from the real default route table, matched the way the router
// matches it, so the `*` wildcard the component reads is the one boot() produces.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { DEFAULT_ROUTING_SPEC } from '../boot';
import { applyRoutingRule } from '../routing';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { FileRouter } from './FileRouter';
import { PROSE_CLASS } from '../proseStyles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./Include', () => ({
  Include: ({ filename }: { filename: string }) => <p data-included={filename}>included</p>,
}));

const render = (sandboxPath: string) => {
  const applied = applyRoutingRule(DEFAULT_ROUTING_SPEC, { sandboxPath } as TinkerableState['navigationState']);
  expect(applied?.routingRule.name).toBe('FileRouter');
  const state = {
    navigationState: { sandboxPath, pathParameters: applied!.pathParameters },
  } as unknown as TinkerableState;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <TinkerableContext value={state}>
        <FileRouter />
      </TinkerableContext>,
    ),
  );
  return { container, unmount: () => act(() => root.unmount()) };
};

describe('FileRouter prose wrapper', () => {
  it.each(['/files/README.md', '/files/docs/guide.mdx'])('wraps %s in the prose article', (path) => {
    const { container, unmount } = render(path);
    const article = container.querySelector(`article.${PROSE_CLASS}`);
    expect(article).not.toBeNull();
    expect(article!.querySelector('[data-included]')).not.toBeNull();
    unmount();
  });

  it.each(['/files/src/App.tsx', '/files/index.html'])('renders %s unwrapped', (path) => {
    const { container, unmount } = render(path);
    expect(container.querySelector('article')).toBeNull();
    expect(container.querySelector('[data-included]')).not.toBeNull();
    unmount();
  });
});
