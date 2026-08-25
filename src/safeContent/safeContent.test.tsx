/**
 * @jest-environment jsdom
 */
// Safe content renderer — the PURE security logic (TRUST_MODES_SPEC §5.1). These
// tests drive `renderMdast`/`sanitizeUrl`/`splitWikiLinks` directly against mdast
// trees shaped exactly as the verified no-acorn parser produces them (see
// `safeContent.e2e.mjs` for the real parse+render+eval-spy end-to-end proof). No
// ESM parser dep is imported here, so it runs under the repo's CJS jest.
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { renderMdast, type SafeContentComponents } from './renderMdast';
import { sanitizeUrl } from './sanitizeUrl';
import { splitWikiLinks } from './wikilink';
import type { SafeMdastNode } from './parseSafeMdast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const render = (ui: ReactNode) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, unmount: () => act(() => root.unmount()) };
};

const root = (...children: SafeMdastNode[]): SafeMdastNode => ({ type: 'root', children });
const text = (value: string): SafeMdastNode => ({ type: 'text', value });
const para = (...children: SafeMdastNode[]): SafeMdastNode => ({ type: 'paragraph', children });

describe('sanitizeUrl (§5.1 URL-scheme allowlist)', () => {
  it('allows http/https/mailto and relative/anchor', () => {
    expect(sanitizeUrl('http://a.com')).toBe('http://a.com');
    expect(sanitizeUrl('https://a.com/x')).toBe('https://a.com/x');
    expect(sanitizeUrl('mailto:x@a.com')).toBe('mailto:x@a.com');
    expect(sanitizeUrl('/rel/path')).toBe('/rel/path');
    expect(sanitizeUrl('#anchor')).toBe('#anchor');
    expect(sanitizeUrl('./sibling.md')).toBe('./sibling.md');
  });
  it('rejects javascript/data/vbscript/file', () => {
    expect(sanitizeUrl('javascript:evil()')).toBeUndefined();
    expect(sanitizeUrl('data:text/html,<script>')).toBeUndefined();
    expect(sanitizeUrl('vbscript:msgbox')).toBeUndefined();
    expect(sanitizeUrl('file:///etc/passwd')).toBeUndefined();
  });
  it('rejects control-char-obfuscated schemes (java\\tscript:)', () => {
    expect(sanitizeUrl('java\tscript:evil()')).toBeUndefined();
    expect(sanitizeUrl('java\nscript:evil()')).toBeUndefined();
    expect(sanitizeUrl('  javascript:evil()')).toBeUndefined();
    expect(sanitizeUrl('javascript:evil()')).toBeUndefined();
  });
});

describe('splitWikiLinks (§5.1 in-mount wikilinks)', () => {
  it('splits [[target]] and [[label|target]]', () => {
    expect(splitWikiLinks('see [[a.mdx]] and [[Label|b.mdx]] here')).toEqual([
      { text: 'see ' },
      { wiki: { target: 'a.mdx' } },
      { text: ' and ' },
      { wiki: { target: 'b.mdx', label: 'Label' } },
      { text: ' here' },
    ]);
  });
  it('returns null for plain text (byte-preserving)', () => {
    expect(splitWikiLinks('no wikilinks here')).toBeNull();
  });
});

describe('renderMdast — the render-as-data security properties', () => {
  // The exact node shape the no-acorn parser produces for `<X f={fetch("/x")} n={1+1}
  // s="ok" {...spread}/>` — expression attrs are inert objects, spreads are
  // mdxJsxExpressionAttribute. renderMdast must pass ONLY the literal `s` to the
  // component and NEVER touch the expression strings.
  const jsxWithExprAttrs = (name: string, children: SafeMdastNode[] = []): SafeMdastNode => ({
    type: 'mdxJsxFlowElement',
    name,
    attributes: [
      { type: 'mdxJsxAttribute', name: 's', value: 'ok' },
      { type: 'mdxJsxAttribute', name: 'f', value: { type: 'mdxJsxAttributeValueExpression', value: 'fetch("/x")' } },
      { type: 'mdxJsxAttribute', name: 'n', value: { type: 'mdxJsxAttributeValueExpression', value: '1+1' } },
      { type: 'mdxJsxExpressionAttribute', value: '...spread' },
    ],
    children,
  });

  it('§5.1: a registry component gets ONLY literal props; expression attrs dropped', () => {
    const seen: Array<Record<string, unknown>> = [];
    const components: SafeContentComponents = {
      WikiEmbed: (props) => {
        seen.push(props);
        return <span data-embed={props.s ?? ''} />;
      },
    };
    const { container, unmount } = render(renderMdast(root(jsxWithExprAttrs('WikiEmbed')), { components }));
    expect(container.querySelector('[data-embed="ok"]')).not.toBeNull();
    // The component received the literal `s` but NOT `f`/`n`/spread.
    expect(seen[0].s).toBe('ok');
    expect('f' in seen[0]).toBe(false);
    expect('n' in seen[0]).toBe(false);
    unmount();
  });

  it('§5.1: an UNKNOWN JSX tag renders children inert — no element, no attributes (kills <script>/<div onclick>/<img onerror> written as JSX)', () => {
    // `<script>`, `<div onclick>`, `<img onerror>` as JSX → not in the registry → the
    // tag disappears, only inert children remain, NO attributes reach the DOM.
    const scriptJsx: SafeMdastNode = {
      type: 'mdxJsxFlowElement',
      name: 'script',
      attributes: [{ type: 'mdxJsxAttribute', name: 'src', value: 'evil.js' }],
      children: [text('alert(1)')],
    };
    const { container, unmount } = render(renderMdast(root(scriptJsx), {}));
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/evil\.js/);
    expect(container.textContent).toContain('alert(1)'); // children shown as inert text
    unmount();
  });

  it('§5.1: raw-HTML mdast `html` nodes render as inert TEXT (no rehype-raw, no injection)', () => {
    const html = (value: string): SafeMdastNode => ({ type: 'html', value });
    const { container, unmount } = render(
      render0(root(html('<script>alert(1)</script>'), html('<img src=x onerror=evil()>'))),
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // The literal markup is shown as text, not parsed into elements.
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('onerror=evil()');
    unmount();
  });
  function render0(tree: SafeMdastNode) {
    return renderMdast(tree, {});
  }

  it('§5.1: a link with a rejected scheme renders text only, never an <a href>', () => {
    const link = (url: string, label: string): SafeMdastNode => ({
      type: 'link',
      url,
      children: [text(label)],
    });
    const { container, unmount } = render(renderMdast(root(para(link('javascript:evil()', 'click'))), {}));
    const a = container.querySelector('a');
    expect(a).toBeNull(); // no anchor at all for a rejected scheme
    expect(container.textContent).toContain('click');
    unmount();
  });

  it('§5.1: an allowed-scheme link renders an <a href> with the sanitized URL', () => {
    const link: SafeMdastNode = { type: 'link', url: 'https://ok.com', children: [text('go')] };
    const { container, unmount } = render(renderMdast(root(para(link)), {}));
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://ok.com');
    unmount();
  });

  it('§5.1: an image with a data: URL is dropped (no <img>)', () => {
    const img: SafeMdastNode = { type: 'image', url: 'data:text/html,<script>', alt: 'x' };
    const { container, unmount } = render(renderMdast(root(para(img)), {}));
    expect(container.querySelector('img')).toBeNull();
    unmount();
  });

  it('§5.1: wikilinks resolve IN-MOUNT via the injected resolver only (no network)', () => {
    const calls: string[] = [];
    const resolveWikiLink = (target: string) => {
      calls.push(target);
      return target === 'in-mount.mdx' ? '/mnt/board/in-mount.mdx' : undefined; // out-of-mount → undefined
    };
    const tree = root(para(text('see [[in-mount.mdx]] and [[../escape.mdx]]')));
    const { container, unmount } = render(renderMdast(tree, { resolveWikiLink }));
    // Resolver consulted for both; only the in-mount one becomes a link, the other is inert text.
    expect(calls).toEqual(['in-mount.mdx', '../escape.mdx']);
    const links = container.querySelectorAll('a[data-wikilink]');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/mnt/board/in-mount.mdx');
    expect(container.textContent).toContain('../escape.mdx'); // inert text
    unmount();
  });

  it('R3-273: a malformed `$fs:` wikilink is inert BEFORE the resolver sees it', () => {
    const calls: string[] = [];
    const resolveWikiLink = (target: string) => {
      calls.push(target);
      return '/mnt/board/x.mdx'; // a maximally permissive resolver — must not matter
    };
    const tree = root(para(text('try [[$fs:javascript:alert(1)]] and [[$fs:/mnt/board/ok.mdx]]')));
    const { container, unmount } = render(renderMdast(tree, { resolveWikiLink }));
    // The smuggled-scheme target never reaches the resolver; the well-formed one does.
    expect(calls).toEqual(['$fs:/mnt/board/ok.mdx']);
    expect(container.querySelectorAll('a[data-wikilink]').length).toBe(1);
    expect(container.textContent).toContain('$fs:javascript:alert(1)'); // inert text
    unmount();
  });

  // ── Host link/image overrides on the safe path ────────────────────────────────
  //
  // A raw `<a href>` performs a REAL navigation on click. Inside an app's sandboxed
  // iframe that is fatal: the frame leaves the app, and a routed host app dies with
  // "Failed to construct 'URL': Invalid URL". Hosts therefore route links through a
  // component -- which the compiled-MDX path has always honoured and this path did not,
  // so one document behaved differently on the two renderers.

  it('a markdown link uses the host `a` override when the registry has one', () => {
    const seen: string[] = [];
    const A = ({ href, children }: any) => {
      seen.push(href);
      return (
        <a href={href} data-routed="1">
          {children}
        </a>
      );
    };
    const link: SafeMdastNode = { type: 'link', url: '/content/roadmap/index.mdx', children: [text('Roadmap')] };
    const components = { a: A } as unknown as SafeContentComponents;
    const { container, unmount } = render(renderMdast(root(para(link)), { components }));
    const a = container.querySelector('a');
    expect(a?.getAttribute('data-routed')).toBe('1'); // the override rendered, not a raw <a>
    expect(seen).toEqual(['/content/roadmap/index.mdx']); // and it received the href
    unmount();
  });

  it('a wikilink uses the host `a` override too', () => {
    const A = ({ href, children }: any) => (
      <a href={href} data-routed="1">
        {children}
      </a>
    );
    const tree = root(para(text('see [[in-mount.mdx]]')));
    const components = { a: A } as unknown as SafeContentComponents;
    const { container, unmount } = render(
      renderMdast(tree, { components, resolveWikiLink: () => '/mnt/board/in-mount.mdx' }),
    );
    expect(container.querySelector('a')?.getAttribute('data-routed')).toBe('1');
    unmount();
  });

  it('an image uses the host `img` override when the registry has one', () => {
    const Img = ({ src, alt }: any) => <img src={src} alt={alt} data-routed="1" />;
    const img: SafeMdastNode = { type: 'image', url: '/assets/x.png', alt: 'x' };
    const components = { img: Img } as unknown as SafeContentComponents;
    const { container, unmount } = render(renderMdast(root(para(img)), { components }));
    expect(container.querySelector('img')?.getAttribute('data-routed')).toBe('1');
    unmount();
  });

  it('falls back to the intrinsic tag when the host registers no override', () => {
    const link: SafeMdastNode = { type: 'link', url: 'https://ok.com', children: [text('go')] };
    const { container, unmount } = render(renderMdast(root(para(link)), { components: {} as SafeContentComponents }));
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://ok.com');
    expect(a?.getAttribute('data-routed')).toBeNull();
    unmount();
  });

  it('SECURITY: the override never sees a rejected scheme -- sanitizing still happens first', () => {
    const seen: string[] = [];
    const A = ({ href, children }: any) => {
      seen.push(href);
      return <a href={href}>{children}</a>;
    };
    const link: SafeMdastNode = { type: 'link', url: 'javascript:evil()', children: [text('click')] };
    const components = { a: A } as unknown as SafeContentComponents;
    const { container, unmount } = render(renderMdast(root(para(link)), { components }));
    expect(seen).toEqual([]); // the override was never invoked for a rejected scheme
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('click'); // inert text, as before
    unmount();
  });

  it('SECURITY: an author cannot choose the element -- the lookup key is fixed', () => {
    // A document naming a component in its own text must not be able to redirect the
    // `a` lookup; only the fixed key `a` is consulted.
    const Evil = () => <span data-evil="1" />;
    const link: SafeMdastNode = { type: 'link', url: 'https://ok.com', children: [text('Evil')] };
    const components = { Evil } as unknown as SafeContentComponents;
    const { container, unmount } = render(renderMdast(root(para(link)), { components }));
    expect(container.querySelector('[data-evil]')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://ok.com');
    unmount();
  });

  it('R3-213: a heading id set by the shared plugin (data.hProperties.id) is translated to a React prop', () => {
    // The no-acorn path has no hast stage, so renderMdast must translate the id +
    // data-slug the shared remarkHeadingAnchors plugin sets on the mdast into props —
    // else headings render id-less and `#sec-8-9` deep-linking breaks in the safe path.
    const heading: SafeMdastNode = {
      type: 'heading',
      depth: 2,
      data: { hProperties: { id: 'sec-8-9', 'data-slug': '89-powerbox' } },
      children: [text('8.9 Powerbox')],
    };
    const { container, unmount } = render(renderMdast(root(heading), {}));
    const h2 = container.querySelector('h2');
    expect(h2?.getAttribute('id')).toBe('sec-8-9');
    expect(h2?.getAttribute('data-slug')).toBe('89-powerbox');
    unmount();
  });

  it('R3-213: WikiLink / Admonition element nodes render via the shared component map (literal props only)', () => {
    // The nodes the shared plugins emit resolve through the SAME components map the
    // compiled path uses — the caller (an interpreter app) passes DEFAULT_MDX_COMPONENTS.
    // Here we assert the mechanism: named element nodes reach the mapped component with
    // their literal attributes (incl. a `#sec-` deep-link fragment carried verbatim).
    const seen: Record<string, Record<string, unknown>> = {};
    const components: SafeContentComponents = {
      WikiLink: (props) => {
        seen.WikiLink = props;
        return <a data-t={props.target ?? ''}>{props.label ?? ''}</a>;
      },
      Admonition: (props) => {
        seen.Admonition = props;
        return <aside data-type={props.type ?? ''} />;
      },
    };
    const wikiNode: SafeMdastNode = {
      type: 'mdxJsxTextElement',
      name: 'WikiLink',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'target', value: 'specs/x.mdx#sec-3-2' },
        { type: 'mdxJsxAttribute', name: 'label', value: 'Guide' },
      ],
      children: [],
    };
    const admNode: SafeMdastNode = {
      type: 'mdxJsxFlowElement',
      name: 'Admonition',
      attributes: [{ type: 'mdxJsxAttribute', name: 'type', value: 'note' }],
      children: [para(text('heads up'))],
    };
    const { container, unmount } = render(renderMdast(root(para(wikiNode), admNode), { components }));
    expect(seen.WikiLink.target).toBe('specs/x.mdx#sec-3-2');
    expect(seen.WikiLink.label).toBe('Guide');
    expect(seen.Admonition.type).toBe('note');
    expect(container.querySelector('a[data-t="specs/x.mdx#sec-3-2"]')).not.toBeNull();
    expect(container.querySelector('aside[data-type="note"]')).not.toBeNull();
    unmount();
  });

  it('§5.1: standard markdown renders (headings, emphasis, lists) as safe elements', () => {
    const tree = root(
      { type: 'heading', depth: 2, children: [text('Title')] },
      para({ type: 'strong', children: [text('bold')] }),
      { type: 'list', ordered: false, children: [{ type: 'listItem', children: [para(text('item'))] }] },
    );
    const { container, unmount } = render(renderMdast(tree, {}));
    expect(container.querySelector('h2')?.textContent).toBe('Title');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('ul li')?.textContent).toBe('item');
    unmount();
  });
});
