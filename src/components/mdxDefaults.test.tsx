/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import type { FC, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { resolveMdxComponents } from '../boot';
import * as sandboxUtils from '../sandboxUtils';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { RenderExportedComponentContext } from './Include';
import { Admonition, DEFAULT_MDX_COMPONENTS, HeadingAnchor, WikiLink } from './MDXComponents';
import { LinkSpaceContext } from '../linkSpace';

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
  it('always provides a, Admonition, HeadingAnchor and WikiLink', () => {
    // The MDX missing-reference guard throws only when a referenced component is
    // ABSENT from the provider map. These keys being present is exactly what stops
    // `_missingMdxReference("Admonition"/"HeadingAnchor"/"WikiLink")` from firing on
    // a plain repo (§11.2 phantom defaults).
    expect(typeof DEFAULT_MDX_COMPONENTS.a).toBe('function');
    expect(typeof DEFAULT_MDX_COMPONENTS.Admonition).toBe('function');
    expect(typeof DEFAULT_MDX_COMPONENTS.HeadingAnchor).toBe('function');
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

describe('default HeadingAnchor (§15.4)', () => {
  it('renders an aria-labelled permalink whose href targets the heading id', () => {
    const { container, unmount } = render(<HeadingAnchor id="sec-8-9" />);
    const a = container.querySelector('a.ir-heading-anchor');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe('#sec-8-9'); // permalink == the heading's own id
    expect(a!.getAttribute('aria-label')).toBe('Permalink to this heading');
    unmount();
  });

  it('renders nothing for a missing id (no dead `#` link)', () => {
    const { container, unmount } = render(<HeadingAnchor />);
    expect(container.querySelector('a')).toBeNull();
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
    const { container, unmount } = renderWiki(<WikiLink target="/guide/setup.mdx" label="Set it up" />, {
      currentFile: '/app/content/intro.mdx',
      files: {},
    });
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
    const { container, unmount } = renderWiki(<WikiLink target="/app/content/guide/setup.mdx" />, {
      currentFile: '/app/content/intro.mdx',
    });
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

  // ── Fragments — deep-linking (§13.5, R3-212) ──────────────────────────────────
  const FRAG_FILES = {
    '/app/content/spec.mdx': { title: 'Spec' },
    '/app/content/intro.mdx': { title: 'Intro' },
  } as TinkerableState['filesMetadata'];

  it('resolves a cross-file section target — existence checked on the STRIPPED path', () => {
    // `[[spec.mdx#sec-8-9]]` must be `resolved` (not broken): the `#sec-8-9` fragment
    // is split off before the existence check.
    const { container, unmount } = renderWiki(<WikiLink target="spec.mdx#sec-8-9" />, {
      currentFile: '/app/content/intro.mdx',
      files: FRAG_FILES,
    });
    const a = container.querySelector('a.ir-wikilink');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('data-state')).toBe('resolved');
    unmount();
  });

  it('a bogus fragment on an EXISTING file still resolves (scroll degrades to top, not broken)', () => {
    const { container, unmount } = renderWiki(<WikiLink target="spec.mdx#bogus" />, {
      currentFile: '/app/content/intro.mdx',
      files: FRAG_FILES,
    });
    expect(container.querySelector('a.ir-wikilink[data-state="resolved"]')).not.toBeNull();
    expect(container.querySelector('span.ir-wikilink-broken')).toBeNull();
    unmount();
  });

  it('a fragment on a MISSING file renders broken (file existence still wins)', () => {
    const { container, unmount } = renderWiki(<WikiLink target="nope.mdx#x" />, {
      currentFile: '/app/content/intro.mdx',
      files: FRAG_FILES,
    });
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('span.ir-wikilink-broken')).not.toBeNull();
    unmount();
  });

  it('a same-page anchor `[[#sec-8-9]]` scrolls in place with NO route change', () => {
    const sendMessage = jest.spyOn(sandboxUtils, 'sendMessage');
    const target = document.createElement('h3');
    target.id = 'sec-8-9';
    const scrollSpy = jest.fn();
    target.scrollIntoView = scrollSpy;
    document.body.appendChild(target);

    const { container, unmount } = renderWiki(<WikiLink target="#sec-8-9" />, {
      currentFile: '/app/content/intro.mdx',
      files: FRAG_FILES,
    });
    const a = container.querySelector('a.ir-wikilink') as HTMLAnchorElement;
    expect(a).not.toBeNull();
    expect(a.getAttribute('data-state')).toBe('anchor');
    expect(a.getAttribute('href')).toBe('#sec-8-9');

    act(() => {
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(scrollSpy).toHaveBeenCalled();
    // "no route change": the host was never asked to change the URL.
    expect(sendMessage).not.toHaveBeenCalledWith('urlchange', expect.anything());

    sendMessage.mockRestore();
    document.body.removeChild(target);
    unmount();
  });

  it('a self-file target WITH a fragment becomes a same-page anchor (not inert self)', () => {
    const { container, unmount } = renderWiki(<WikiLink target="intro.mdx#sec-2" />, {
      currentFile: '/app/content/intro.mdx',
      files: FRAG_FILES,
    });
    const a = container.querySelector('a.ir-wikilink');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('data-state')).toBe('anchor');
    expect(a!.getAttribute('href')).toBe('#sec-2');
    expect(container.querySelector('span.ir-wikilink-self')).toBeNull();
    unmount();
  });
});

// ---- R3-273 link spaces: `$fs:` prefix + corpus-rooted default space ----------
describe('link spaces (R3-273)', () => {
  const FILES = {
    '/app/content/guide/setup.mdx': { title: 'Setup' },
    '/app/content/intro.mdx': { title: 'Intro' },
    '/app/content/sub/page.mdx': { title: 'Nested page' },
    '/app/content/sub/other.mdx': { title: 'Nested sibling' },
  } as TinkerableState['filesMetadata'];

  const renderSpaced = (
    ui: ReactNode,
    {
      currentFile,
      corpusRoot = null,
      files = FILES,
    }: { currentFile?: string; corpusRoot?: string | null; files?: TinkerableState['filesMetadata'] } = {},
  ) => {
    const tctx: TinkerableState = { ...ctx, filesMetadata: files };
    const rctx = currentFile
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ evaluationContext: { evaluation: { module: { filepath: currentFile, source: '' } } } } as any)
      : null;
    return render(
      <TinkerableContext value={tctx}>
        <LinkSpaceContext value={{ corpusRoot }}>
          <RenderExportedComponentContext value={rctx}>{ui}</RenderExportedComponentContext>
        </LinkSpaceContext>
      </TinkerableContext>,
    );
  };

  it('a `$fs:` wikilink resolves mount-absolute even under a corpusRoot', () => {
    const { container, unmount } = renderSpaced(<WikiLink target="$fs:/app/content/intro.mdx" />, {
      currentFile: '/app/content/guide/setup.mdx',
      corpusRoot: '/app/content',
    });
    const a = container.querySelector('a.ir-wikilink');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('data-state')).toBe('resolved');
    unmount();
  });

  it('a `$fs:` wikilink to a missing file renders broken', () => {
    const { container, unmount } = renderSpaced(<WikiLink target="$fs:/nope.mdx" />, {
      currentFile: '/app/content/intro.mdx',
    });
    const el = container.querySelector('.ir-wikilink-broken');
    expect(el).not.toBeNull();
    expect(container.querySelector('a')).toBeNull();
    unmount();
  });

  it('a malformed `$fs:` wikilink (scheme smuggling) renders broken, never an anchor', () => {
    const { container, unmount } = renderSpaced(<WikiLink target="$fs:javascript:alert(1)" label="click me" />, {
      currentFile: '/app/content/intro.mdx',
    });
    expect(container.querySelector('a')).toBeNull();
    const el = container.querySelector('.ir-wikilink-broken');
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe('click me');
    unmount();
  });

  it('an ABSOLUTE wikilink target resolves from the corpus root when one is declared', () => {
    // Without the corpusRoot this would resolve to /intro.mdx (not in FILES → broken);
    // the resolved state proves the corpus mapping applied.
    const { container, unmount } = renderSpaced(<WikiLink target="/intro.mdx" />, {
      currentFile: '/app/content/guide/setup.mdx',
      corpusRoot: '/app/content',
    });
    expect(container.querySelector('a.ir-wikilink')!.getAttribute('data-state')).toBe('resolved');
    unmount();
  });

  it('without a corpusRoot, absolute targets keep the legacy fs-root meaning', () => {
    const { container, unmount } = renderSpaced(<WikiLink target="/intro.mdx" />, {
      currentFile: '/app/content/guide/setup.mdx',
      corpusRoot: null,
    });
    expect(container.querySelector('.ir-wikilink-broken')).not.toBeNull();
    unmount();
  });

  it('nested LinkSpaceContext providers: the INNERMOST corpus wins (bundle rule)', () => {
    const { container, unmount } = render(
      <TinkerableContext value={{ ...ctx, filesMetadata: FILES }}>
        <LinkSpaceContext value={{ corpusRoot: '/app/content' }}>
          <LinkSpaceContext value={{ corpusRoot: '/app/content/sub' }}>
            <RenderExportedComponentContext
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value={
                {
                  evaluationContext: { evaluation: { module: { filepath: '/app/content/sub/page.mdx', source: '' } } },
                } as any
              }
            >
              <WikiLink target="/other.mdx" />
            </RenderExportedComponentContext>
          </LinkSpaceContext>
        </LinkSpaceContext>
      </TinkerableContext>,
    );
    // /other.mdx → /app/content/sub/other.mdx (inner, exists → resolved), NOT
    // /app/content/other.mdx (outer, absent → would render broken).
    expect(container.querySelector('a.ir-wikilink')!.getAttribute('data-state')).toBe('resolved');
    unmount();
  });

  it('the default `a` translates a `$fs:` href to its mount path and routes it', () => {
    const A = DEFAULT_MDX_COMPONENTS.a;
    const { container, unmount } = renderSpaced(<A href="$fs:/app/content/intro.mdx#sec-2">read the intro</A>, {
      corpusRoot: '/app/content',
    });
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    // In-app href: routed (outer URL form), never the raw `$fs:` text.
    expect(a!.getAttribute('href')).not.toContain('$fs:');
    expect(a!.getAttribute('href')).toContain('/app/content/intro.mdx');
    expect(a!.getAttribute('href')).toContain('#sec-2');
    unmount();
  });

  it('the default `a` renders a malformed `$fs:` href as broken text, not an anchor', () => {
    const A = DEFAULT_MDX_COMPONENTS.a;
    const { container, unmount } = renderSpaced(<A href="$fs:javascript:alert(1)">x</A>, {});
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('.ir-link-broken')).not.toBeNull();
    unmount();
  });

  it('the default `a` corpus-roots an absolute href when a corpusRoot is declared', () => {
    const A = DEFAULT_MDX_COMPONENTS.a;
    const { container, unmount } = renderSpaced(<A href="/intro.mdx">intro</A>, {
      corpusRoot: '/app/content',
    });
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toContain('/app/content/intro.mdx');
    unmount();
  });

  it('the default `a` is untouched with no corpusRoot (non-corpus apps, bit-for-bit)', () => {
    const A = DEFAULT_MDX_COMPONENTS.a;
    const { container, unmount } = renderSpaced(<A href="/about">about</A>, { corpusRoot: null });
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).not.toContain('/app/content');
    unmount();
  });
});
