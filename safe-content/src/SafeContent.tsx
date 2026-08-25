import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { parseSafeMdast } from './parseSafeMdast';
import { renderMdast, type RenderMdastOptions } from './renderMdast';

// R3-213 — sharing the component map: `parseSafeMdast` runs the SAME kernel remark
// plugins the compiled path uses, so it emits `<Admonition>` / `<WikiLink>` /
// `<HeadingAnchor>` element nodes. To render them identically to the compiled path (and
// so pick up the R3-212 fragment resolver + scroll), an interpreter app passes the SAME
// `DEFAULT_MDX_COMPONENTS` it hands `boot({ mdxComponents })` as this component's
// `components` — that shared map IS the uniformity (no forked second component set). We
// deliberately do NOT import DEFAULT_MDX_COMPONENTS here: the safe renderer is a lean,
// dep-light security primitive (render-as-data, no evaluator, ESM-clean for the e2e
// bundle), and must not pull the full component library into its module graph.

// `<SafeContent>` — the host/SDK-owned safe renderer (TRUST_MODES_SPEC §5.1,
// AGENT_AUTHORING §10). An interpreter app renders untrusted Markdown/MDX-syntax
// content — a shared board's body, a multi-writer wiki entry — through THIS component
// so **no author JavaScript ever executes** while `<Component/>` syntax still reaches
// the app's own safe components. It is the mandatory terminal for the MDX-from-mount
// gate: a shared board is a multi-writer (M3) source, and compiled/executable MDX
// would run board-author code with the app's authority (the WHITEBOARD §8 blast
// radius this gate bounds).
//
// The parse (no-acorn, ESM-only deps) is async, so this renders a small placeholder
// until the tree is ready, then the pure synchronous `renderMdast`. Parsing is keyed
// on the source string; a changed source re-parses, and a stale async result is
// discarded (the ref guard) so a fast source swap can't paint the wrong content.

export interface SafeContentProps extends RenderMdastOptions {
  /** The untrusted Markdown/MDX-syntax source to render as data. */
  source: string;
  /** Rendered while the async parse is in flight (default: nothing). */
  fallback?: ReactNode;
}

export function SafeContent({ source, fallback = null, ...options }: SafeContentProps): ReactNode {
  const [tree, setTree] = useState<Awaited<ReturnType<typeof parseSafeMdast>> | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    setTree(null);
    let cancelled = false;
    parseSafeMdast(source)
      .then((parsed) => {
        // Discard a stale result (source changed / unmounted) so we never paint the
        // wrong tree — the render-as-data guarantee also needs the RIGHT data shown.
        if (!cancelled && runId.current === id) setTree(parsed);
      })
      .catch(() => {
        if (!cancelled && runId.current === id) setTree(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // `renderMdast` is pure; memoise on the tree + the option identities the caller
  // passes. (Callers should memoise `components`/`resolveWikiLink` themselves for a
  // stable identity; changing them re-renders, which is correct.)
  const rendered = useMemo(
    () => (tree ? renderMdast(tree, options) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, options.components, options.resolveWikiLink],
  );

  return tree ? rendered : fallback;
}
