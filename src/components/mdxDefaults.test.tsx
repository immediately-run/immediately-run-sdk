/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import type { FC, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { resolveMdxComponents } from '../boot';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { RenderExportedComponentContext } from './Include';
import { Admonition, DEFAULT_MDX_COMPONENTS, WikiLink } from './MDXComponents';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const render = (ui: ReactNode) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, unmount: () => act(() => root.unmount()) };
};

// A TinkerableContext value good enough for <Link> (and thus <WikiLink>) to build
// an in-app href without throwing (constructUrl needs a real outerHref).
const ctx: TinkerableState = {
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
  filesMetadata: {},
};

describe('DEFAULT_MDX_COMPONENTS — the phantom defaults (§11.2)', () => {
  it('always provides a, Admonition and WikiLink', () => {
    // The MDX missing-reference guard throws only when a referenced component is
    // ABSENT from the provider map. These keys being present is exactly what stops
    // `_missingMdxReference("Admonition"/"WikiLink")` from firing on a plain repo.
    expect(typeof DEFAULT_MDX_COMPONENTS.a).toBe('function');
    expect(typeof DEFAULT_MDX_COMPONENTS.Admonition).toBe('function');
    expect(typeof DEFAULT_MDX_COMPONENTS.WikiLink).toBe('function');
  });
});

describe('resolveMdxComponents — boot() merge semantics (§11.3)', () => {
  const Custom: FC = () => null;

  it('no arg → the defaults themselves (same reference)', () => {
    expect(resolveMdxComponents(undefined)).toBe(DEFAULT_MDX_COMPONENTS);
  });

  it('a map is merged OVER the defaults — override one, keep the rest', () => {
    const resolved = resolveMdxComponents({ WikiLink: Custom });
    expect(resolved.WikiLink).toBe(Custom); // overridden
    expect(resolved.a).toBe(DEFAULT_MDX_COMPONENTS.a); // kept (same ref)
    expect(resolved.Admonition).toBe(DEFAULT_MDX_COMPONENTS.Admonition); // kept (same ref)
  });

  it('a function is the full-replace escape hatch, handed the defaults', () => {
    let received: Record<string, FC> | undefined;
    const resolved = resolveMdxComponents((defaults) => {
      received = defaults;
      return { a: Custom };
    });
    expect(received).toBe(DEFAULT_MDX_COMPONENTS); // the fn receives the defaults
    expect(resolved.a).toBe(Custom);
    expect('Admonition' in resolved).toBe(false); // fully replaced — defaults dropped
    expect('WikiLink' in resolved).toBe(false);
  });
});

describe('default Admonition (§12.3)', () => {
  it('renders semantic, typed, accessible markup', () => {
    const { container, unmount } = render(<Admonition type="warning">Heads up.</Admonition>);
    const el = container.querySelector('.ir-admonition');
    expect(el).not.toBeNull();
    expect(el!.classList.contains('ir-admonition-warning')).toBe(true);
    expect(el!.getAttribute('role')).toBe('note');
    expect(container.querySelector('.ir-admonition-title')!.textContent).toBe('Warning');
    expect(container.querySelector('.ir-admonition-body')!.textContent).toBe('Heads up.');
    unmount();
  });

  it('defaults to the note kind for an unknown type', () => {
    const { container, unmount } = render(<Admonition type="bogus">x</Admonition>);
    expect(container.querySelector('.ir-admonition-title')!.textContent).toBe('Note');
    unmount();
  });
});

describe('default WikiLink (§13) — resolve at runtime', () => {
  const FILES = {
    '/app/content/guide/setup.mdx': { title: 'Setup' },
    '/app/content/intro.mdx': { title: 'Intro' },
  } as TinkerableState['filesMetadata'];

  // Render a <WikiLink> as it appears at runtime: under TinkerableContext (for the
  // metadata store) and the <Include> render context (for the AUTHORING file, whose
  // `evaluation.module.filepath` the component reads). `currentFile` undefined ⇒ no
  // ambient render context (MDX rendered outside <Include>).
  const renderWiki = (
    ui: ReactNode,
    { currentFile, files = FILES }: { currentFile?: string; files?: TinkerableState['filesMetadata'] } = {},
  ) => {
    const tctx: TinkerableState = { ...ctx, filesMetadata: files };
    const rctx = currentFile
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ evaluationContext: { evaluation: { module: { filepath: currentFile, source: '' } } } } as any)
      : null;
    return render(
      <TinkerableContext value={tctx}>
        <RenderExportedComponentContext value={rctx}>{ui}</RenderExportedComponentContext>
      </TinkerableContext>,
    );
  };

  it('renders a link, deriving a label from the target when none is given', () => {
    const { container, unmount } = renderWiki(<WikiLink target="/guide/setup.mdx" />, {
      currentFile: '/app/content/intro.mdx',
      files: {},
    });
    const a = container.querySelector('a.ir-wikilink');
    expect(a).not.toBeNull();
    expect(a!.textContent).toBe('setup'); // basename minus extension
    unmount();
  });

  it('uses an explicit label when provided', () => {
    const { container, unmount } = renderWiki(
      <WikiLink target="/guide/setup.mdx" label="Set it up" />,
      { currentFile: '/app/content/intro.mdx', files: {} },
    );
    expect(container.querySelector('a.ir-wikilink')!.textContent).toBe('Set it up');
    unmount();
  });

  it('resolves a RELATIVE target against the AUTHORING file dir and links when it exists', () => {
    // authored in content/guide/index.mdx; `../intro.mdx` → /app/content/intro.mdx
    const { container, unmount } = renderWiki(<WikiLink target="../intro.mdx" />, {
      currentFile: '/app/content/guide/index.mdx',
    });
    const a = container.querySelector('a.ir-wikilink');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('data-state')).toBe('resolved');
    unmount();
  });

  it('resolves relative to the <Include>d FRAGMENT, not the top-level page', () => {
    // MainPage.mdx <Include>s nav/NavSection.mdx; a `[[../demos.mdx]]` inside the
    // fragment must resolve against the fragment dir → /app/content/demos.mdx.
    const { container, unmount } = renderWiki(<WikiLink target="../demos.mdx" />, {
      currentFile: '/app/content/nav/NavSection.mdx',
      files: { '/app/content/demos.mdx': { title: 'Demos' } } as TinkerableState['filesMetadata'],
    });
    expect(container.querySelector('a.ir-wikilink[data-state="resolved"]')).not.toBeNull();
    unmount();
  });

  it('resolves an ABSOLUTE target verbatim and links when it exists', () => {
    const { container, unmount } = renderWiki(
      <WikiLink target="/app/content/guide/setup.mdx" />,
      { currentFile: '/app/content/intro.mdx' },
    );
    expect(container.querySelector('a.ir-wikilink[data-state="resolved"]')).not.toBeNull();
    unmount();
  });

  it('renders the BROKEN state (marked text, no link, no throw) for a missing path', () => {
    const { container, unmount } = renderWiki(<WikiLink target="does/not/exist.mdx" />, {
      currentFile: '/app/content/intro.mdx',
    });
    expect(container.querySelector('a')).toBeNull(); // not a link
    const span = container.querySelector('span.ir-wikilink-broken');
    expect(span).not.toBeNull();
    expect(span!.getAttribute('data-state')).toBe('broken');
    unmount();
  });

  it('renders the SELF state (inert text) when the target resolves to the current file', () => {
    const { container, unmount } = renderWiki(<WikiLink target="intro.mdx" />, {
      currentFile: '/app/content/intro.mdx',
    });
    expect(container.querySelector('a')).toBeNull();
    const span = container.querySelector('span.ir-wikilink-self');
    expect(span).not.toBeNull();
    expect(span!.getAttribute('data-state')).toBe('self');
    unmount();
  });

  it('is optimistic until the metadata store loads (an empty store never flashes broken)', () => {
    const { container, unmount } = renderWiki(<WikiLink target="whatever.mdx" />, {
      currentFile: '/app/content/intro.mdx',
      files: {},
    });
    expect(container.querySelector('span.ir-wikilink-broken')).toBeNull();
    expect(container.querySelector('a.ir-wikilink')).not.toBeNull();
    unmount();
  });

  it('a relative target with no ambient render context routes optimistically', () => {
    // No <Include> render context (MDX rendered outside Include).
    const { container, unmount } = renderWiki(<WikiLink target="sibling.mdx" />, {
      currentFile: undefined,
    });
    expect(container.querySelector('span.ir-wikilink-broken')).toBeNull();
    expect(container.querySelector('a.ir-wikilink')).not.toBeNull();
    unmount();
  });
});
