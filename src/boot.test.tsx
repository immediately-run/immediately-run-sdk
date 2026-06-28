/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://localhost/?href=https%3A%2F%2Flocalhost%2Fpresent%2Fgithub%2Facme%2Fblog%2Fmain%2Fabout"}
 */
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { CATCH_ALL_ROUTING_SPEC, DEFAULT_ROUTING_SPEC, TinkerableApp } from './boot';
import { Route, Routes } from './components/Routes';
import { matchRoute } from './routeMatch';
import { createMockHost } from './testing';
import type { RoutingSpec } from './RoutingSpec';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = createMockHost();
beforeEach(() => host.install());
afterEach(() => host.uninstall());

// The jsdom URL above carries ?href=…/present/github/acme/blog/main/about, so
// getInitialContext resolves sandboxPath to "/about".
const renderApp = (ui: ReactNode) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return { text: () => container.textContent, unmount: () => act(() => root.unmount()) };
};

describe('CATCH_ALL_ROUTING_SPEC', () => {
  it('matches any sandboxPath so context builds without a table', () => {
    expect(matchRoute(CATCH_ALL_ROUTING_SPEC.routes[0].pattern, '/anything/at/all')).toEqual({});
  });
});

describe('DEFAULT_ROUTING_SPEC (re-expressed with templates, §7)', () => {
  const ruleFor = (path: string) =>
    DEFAULT_ROUTING_SPEC.routes.find((r) => matchRoute(r.pattern, path));

  it('routes `/` to MainContent with no params', () => {
    const rule = ruleFor('/');
    expect(rule?.name).toBe('MainContent');
    expect(matchRoute(rule!.pattern, '/')).toEqual({});
  });

  it('routes `/files/<path>` to FileRouter, surfacing the path under `*`', () => {
    const rule = ruleFor('/files/a/b.mdx');
    expect(rule?.name).toBe('FileRouter');
    expect(matchRoute(rule!.pattern, '/files/a/b.mdx')).toEqual({ '*': 'a/b.mdx' });
  });

  it('falls through to ErrorNotFound for an unknown path', () => {
    expect(ruleFor('/nope')?.name).toBe('ErrorNotFound');
  });
});

describe('TinkerableApp', () => {
  it('renders children (owning dispatch via <Routes>) instead of the Router', () => {
    const r = renderApp(
      <TinkerableApp routingSpec={CATCH_ALL_ROUTING_SPEC}>
        <Routes fallback={<span>404</span>}>
          <Route path="/" element={<span>home</span>} />
          <Route path="/about" element={<span>about-page</span>} />
        </Routes>
      </TinkerableApp>,
    );
    expect(r.text()).toBe('about-page');
    r.unmount();
  });

  it('falls back to the Router (routingSpec) when no children are given', () => {
    const spec: RoutingSpec = {
      routes: [{ name: 'About', pattern: '/about', element: <span>routed</span> }],
    };
    const r = renderApp(<TinkerableApp routingSpec={spec} />);
    expect(r.text()).toBe('routed');
    r.unmount();
  });
});
