/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { TinkerableContext } from '../TinkerableContext';
import type { NavigationState, TinkerableState } from '../TinkerableContext';
import { useRoute, useRouteParams } from '../routing';
import { Route, Routes } from './Routes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navState = (sandboxPath: string): NavigationState =>
  ({
    sandboxPath,
    mode: 'present',
    provider: 'github',
    namespace: 'acme',
    repository: 'blog',
    ref: 'main',
    hash: '',
    search: '',
  } as NavigationState);

const render = (sandboxPath: string, ui: React.ReactNode) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const state = { navigationState: navState(sandboxPath) } as TinkerableState;
  act(() => {
    root.render(<TinkerableContext value={state}>{ui}</TinkerableContext>);
  });
  return {
    container,
    text: () => container.textContent,
    unmount: () => act(() => root.unmount()),
  };
};

const Slug = () => {
  const { slug } = useRouteParams<{ slug: string }>();
  return <span>post:{slug}</span>;
};

describe('Routes / Route', () => {
  it('renders the first matching route in render order', () => {
    const r = render(
      '/',
      <Routes fallback={<span>nope</span>}>
        <Route path="/" element={<span>home</span>} />
        <Route path="/posts/:slug" element={<Slug />} />
      </Routes>,
    );
    expect(r.text()).toBe('home');
    r.unmount();
  });

  it('exposes matched params via useRouteParams in the rendered element', () => {
    const r = render(
      '/posts/intro',
      <Routes>
        <Route path="/" element={<span>home</span>} />
        <Route path="/posts/:slug" element={<Slug />} />
      </Routes>,
    );
    expect(r.text()).toBe('post:intro');
    r.unmount();
  });

  it('passes params to a component route as a prop', () => {
    const Card = ({ params }: { params: Record<string, string> }) => <span>card:{params['*']}</span>;
    const r = render(
      '/files/a/b.mdx',
      <Routes>
        <Route path="/files/*" component={Card} />
      </Routes>,
    );
    expect(r.text()).toBe('card:a/b.mdx');
    r.unmount();
  });

  it('renders the fallback when nothing matches', () => {
    const r = render(
      '/missing',
      <Routes fallback={<span>404</span>}>
        <Route path="/" element={<span>home</span>} />
      </Routes>,
    );
    expect(r.text()).toBe('404');
    r.unmount();
  });

  it('supports dynamically generated routes (e.g. from data)', () => {
    const posts = ['intro', 'second'];
    const r = render(
      '/posts/second',
      <Routes fallback={<span>404</span>}>
        {posts.map((slug) => (
          <Route key={slug} path={`/posts/${slug}`} element={<span>p:{slug}</span>} />
        ))}
      </Routes>,
    );
    expect(r.text()).toBe('p:second');
    r.unmount();
  });

  it('a conditionally-omitted route is not matched', () => {
    const enabled = false;
    const r = render(
      '/admin',
      <Routes fallback={<span>403</span>}>{enabled && <Route path="/admin" element={<span>admin</span>} />}</Routes>,
    );
    expect(r.text()).toBe('403');
    r.unmount();
  });

  it('scopes platform prefix fields through useRoute', () => {
    const Probe = () => {
      const { mode, repository, name } = useRoute();
      return <span>{`${name}|${mode}|${repository}`}</span>;
    };
    const r = render(
      '/about',
      <Routes>
        <Route name="about" path="/about" element={<Probe />} />
      </Routes>,
    );
    expect(r.text()).toBe('about|present|blog');
    r.unmount();
  });
});
