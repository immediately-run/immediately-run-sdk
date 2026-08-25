import { createElement, Fragment, type ReactNode } from 'react';
import { sanitizeUrl } from './sanitizeUrl';
import { splitWikiLinks, type WikiLinkToken } from './wikilink';
import { resolveLinkTarget } from '../linkSpace';
import type { SafeMdastNode, SafeMdxAttribute } from './parseSafeMdast';

// The mdast→React renderer for the safe content path (TRUST_MODES_SPEC §5.1). PURE
// and synchronous — it only reads `node.type` off an already-parsed tree, so it
// carries no ESM dep and is exhaustively unit-testable. Every security property lives
// here:
//
//  - **JSX tags resolve ONLY to a component registry, by name.** A `<Component/>`
//    node becomes `registry[name]` with **literal string props only**; an unknown tag
//    renders its children inert (a Fragment, no element) — so author-written `<div
//    onclick=…>`, `<img onerror=…>`, `<script>` never become an intrinsic element with
//    attacker attributes. (Block-level raw HTML arrives as an `html` node, below.)
//  - **Expression attributes are dropped.** `f={fetch("/x")}` / `{...spread}` are
//    `mdxJsxExpressionAttribute` or object-valued `mdxJsxAttribute`s — never passed to
//    a component, never evaluated. (There is also no evaluator to reach — parse used
//    no acorn.)
//  - **Raw HTML is inert text.** `html` nodes render as their literal string via a
//    text node — never `dangerouslySetInnerHTML` (no `rehype-raw`).
//  - **URL-scheme sanitizer** on every `link`/`image` URL (`sanitizeUrl`).
//  - **Wikilinks resolve in-mount only** via an injected resolver; the renderer never
//    fetches.

export interface SafeContentComponents {
  /** Safe components an app exposes to `<Component/>` syntax (host/app-provided).
   *  Looked up by the JSX tag name; anything not here renders inert. */
  [tag: string]: React.ComponentType<Record<string, string>>;
}

export interface RenderMdastOptions {
  /** The component registry for `<Component/>` syntax. Absent ⇒ all JSX tags inert. */
  components?: SafeContentComponents;
  /**
   * Resolve a wikilink target to an href, **within the granted mount only** — a pure,
   * synchronous, mount-scoped lookup that MUST NOT fetch or reach out of the mount.
   * Return `undefined` for an unresolvable/out-of-mount target (rendered as inert
   * text). Absent ⇒ every wikilink renders as inert text.
   */
  resolveWikiLink?: (target: string) => string | undefined;
}

/** Extract the literal string props of a JSX element — `mdxJsxAttribute`s whose value
 *  is a plain string. Expression attributes (object value) and spreads are DROPPED. */
function literalProps(attributes: SafeMdxAttribute[] | undefined): Record<string, string> {
  const props: Record<string, string> = {};
  for (const attr of attributes ?? []) {
    if (attr.type !== 'mdxJsxAttribute') continue; // drop `{...spread}`
    if (typeof attr.name !== 'string') continue;
    // A literal attribute's value is a string (or null → boolean-ish `true`). An
    // expression value is an object (`mdxJsxAttributeValueExpression`) — DROP it: it
    // is an inert raw string, never a real value, and must never reach a component.
    if (typeof attr.value === 'string') props[attr.name] = attr.value;
    else if (attr.value === null || attr.value === undefined) props[attr.name] = '';
    // object-valued (expression) → skipped
  }
  return props;
}

let keyCounter = 0;
const nextKey = () => `sc-${keyCounter++}`;

/**
 * The element to build for a link/image: the host's registered override when it has one,
 * else the intrinsic tag.
 *
 * **Why this is safe.** `components` is the HOST's registry — the same one `<Component/>`
 * syntax resolves against — never author input. An author cannot add to it or choose one
 * here, because the lookup is by a FIXED key (`'a'`/`'img'`), not by anything read out of
 * the document. The URL is still `sanitizeUrl`'d before it is handed over, and only props
 * this renderer controls are passed. The trust boundary is unchanged: author text still
 * reaches nothing but children and a sanitized URL.
 *
 * **Why it is needed.** Without it, a safe-rendered document's links are raw `<a href>`,
 * so a click performs a REAL navigation. Inside an app's sandboxed iframe that is fatal —
 * the frame navigates away from the app, and in a routed host app it dies with
 * `Failed to construct 'URL': Invalid URL`. Hosts route links through a component for
 * exactly this reason, and the compiled-MDX path has always honoured that component; the
 * safe path silently ignored it, so one document behaved differently on the two renderers.
 */
function elementFor(tag: 'a' | 'img', components: RenderMdastOptions['components']): React.ElementType {
  return (components?.[tag] as React.ElementType) ?? tag;
}

/** Render a wikilink token via the in-mount resolver, or inert text when it can't
 *  resolve (never a network call — resolution is the injected mount-scoped callback). */
function renderWiki(token: WikiLinkToken, opts: RenderMdastOptions): ReactNode {
  const label = token.label ?? token.target;
  // R3-273: a malformed `$fs:` target (not mount-absolute — catches scheme
  // smuggling) is inert BEFORE the injected resolver ever sees it, so every
  // consumer fails closed identically. Consumers implement their resolver on the
  // same shared `resolveLinkTarget` for well-formed targets.
  if (resolveLinkTarget(token.target).state === 'invalid') return label;
  const href = opts.resolveWikiLink?.(token.target);
  const safe = href !== undefined ? sanitizeUrl(href) : undefined;
  if (safe === undefined) return label; // inert text — unresolved or out-of-mount
  return createElement(
    elementFor('a', opts.components),
    { href: safe, 'data-wikilink': token.target, key: nextKey() },
    label,
  );
}

/** Render a `text` node, splitting any `[[…]]` wikilinks out of it. */
function renderText(value: string, opts: RenderMdastOptions): ReactNode {
  const parts = splitWikiLinks(value);
  if (!parts) return value;
  return parts.map((p, i) =>
    'text' in p
      ? createElement(Fragment, { key: `t${i}` }, p.text)
      : createElement(Fragment, { key: `w${i}` }, renderWiki(p.wiki, opts)),
  );
}

function renderChildren(node: SafeMdastNode, opts: RenderMdastOptions): ReactNode[] {
  return (node.children ?? []).map((c, i) => renderNode(c, opts, i));
}

// Standard mdast block/inline nodes → a FIXED, safe React element. We control every
// attribute; author input only reaches text content and (sanitized) URLs.
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

function renderNode(node: SafeMdastNode, opts: RenderMdastOptions, index = 0): ReactNode {
  const key = `n${index}`;
  switch (node.type) {
    case 'root':
      return createElement(Fragment, { key }, ...renderChildren(node, opts));
    case 'text':
      return renderText(node.value ?? '', opts);
    case 'paragraph':
      return createElement('p', { key }, ...renderChildren(node, opts));
    case 'heading': {
      const tag = HEADING_TAGS[Math.min(Math.max((node.depth ?? 1) - 1, 0), 5)];
      // R3-213: the no-acorn path has no hast stage, so the heading id the shared
      // `remarkHeadingAnchors` plugin sets via `data.hProperties.id` (+ the `data-slug`
      // fallback, R3-211) must be translated to React props HERE, or headings render
      // id-less and deep-linking (`#sec-8-9`) breaks in the safe path. These are
      // plugin-computed literal strings, not author input — safe to pass through.
      const hp = (node.data as { hProperties?: Record<string, unknown> } | undefined)?.hProperties;
      const headingProps: Record<string, string> = {};
      if (typeof hp?.id === 'string') headingProps.id = hp.id;
      if (typeof hp?.['data-slug'] === 'string') headingProps['data-slug'] = hp['data-slug'];
      return createElement(tag, { key, ...headingProps }, ...renderChildren(node, opts));
    }
    case 'strong':
      return createElement('strong', { key }, ...renderChildren(node, opts));
    case 'emphasis':
      return createElement('em', { key }, ...renderChildren(node, opts));
    case 'delete':
      return createElement('del', { key }, ...renderChildren(node, opts));
    case 'inlineCode':
      return createElement('code', { key }, node.value ?? '');
    case 'code':
      return createElement('pre', { key }, createElement('code', null, node.value ?? ''));
    case 'blockquote':
      return createElement('blockquote', { key }, ...renderChildren(node, opts));
    case 'list':
      return createElement(node.ordered ? 'ol' : 'ul', { key }, ...renderChildren(node, opts));
    case 'listItem':
      return createElement('li', { key }, ...renderChildren(node, opts));
    case 'thematicBreak':
      return createElement('hr', { key });
    case 'break':
      return createElement('br', { key });
    case 'link': {
      const href = sanitizeUrl(node.url);
      // A rejected scheme → render the link TEXT only (inert), never an <a href>.
      if (href === undefined) return createElement(Fragment, { key }, ...renderChildren(node, opts));
      return createElement(
        elementFor('a', opts.components),
        { key, href, title: node.title ?? undefined },
        ...renderChildren(node, opts),
      );
    }
    case 'image': {
      const src = sanitizeUrl(node.url);
      if (src === undefined) return node.alt ? createElement(Fragment, { key }, node.alt) : null;
      return createElement(elementFor('img', opts.components), {
        key,
        src,
        alt: node.alt ?? '',
        title: node.title ?? undefined,
      });
    }
    // GFM tables.
    case 'table':
      return createElement('table', { key }, createElement('tbody', null, ...renderChildren(node, opts)));
    case 'tableRow':
      return createElement('tr', { key }, ...renderChildren(node, opts));
    case 'tableCell':
      return createElement('td', { key }, ...renderChildren(node, opts));
    // Raw HTML (`<script>`, `<div onclick>` at block level) → INERT TEXT. No
    // `rehype-raw`, never `dangerouslySetInnerHTML`. The literal markup is shown, not run.
    case 'html':
      return createElement(Fragment, { key }, node.value ?? '');
    // JSX `<Component/>` syntax → registry lookup by NAME, literal props only.
    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement': {
      const name = typeof node.name === 'string' ? node.name : '';
      const Component = name ? opts.components?.[name] : undefined;
      const children = renderChildren(node, opts);
      // Unknown tag (not in the registry) OR a fragment `<>` → render children inert,
      // NO element, NO author attributes. This is what neutralizes `<script>`/`<div
      // onclick>`/`<img onerror>` written as JSX.
      if (!Component) return createElement(Fragment, { key }, ...children);
      return createElement(Component, { key, ...literalProps(node.attributes) }, ...children);
    }
    // Inert expression nodes (should not occur — expression extension is off — but be
    // defensive if a tree from elsewhere carries them): render nothing.
    case 'mdxFlowExpression':
    case 'mdxTextExpression':
    case 'mdxjsEsm':
      return null;
    default:
      // Unknown node → render its children (never its raw value as markup).
      return node.children ? createElement(Fragment, { key }, ...renderChildren(node, opts)) : null;
  }
}

/**
 * Render a safe-parsed mdast tree to React. Pure and synchronous; carries every §5.1
 * security property (registry-only JSX, dropped expressions, inert raw HTML, URL
 * sanitizing, in-mount wikilinks). Feed it a tree from {@link parseSafeMdast}.
 */
export function renderMdast(tree: SafeMdastNode, options: RenderMdastOptions = {}): ReactNode {
  keyCounter = 0;
  return renderNode(tree, options);
}
