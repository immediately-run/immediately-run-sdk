import { useCallback, useLayoutEffect, useRef, type ComponentPropsWithRef, type Ref } from 'react';

import { ensureProseStyles, PROSE_CLASS } from '../proseStyles';
import { tokensFor } from '../proseTokens';
import { useProseTokens } from '../proseTokensHook';
import { useHostTheme } from '../theme';

export interface ProseProps extends ComponentPropsWithRef<'article'> {
  /**
   * The repo-relative path of the Markdown file this wraps. When set, the author token
   * file that governs it (`PROSE_TOKEN_FILE`, or the file a bundle marker's `styles`
   * names — MARKDOWN_SYNTAX_SPEC §16.6) restyles this article. `FileRouter` passes it.
   */
  filename?: string;
}

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null): void => {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
};

/**
 * The wrapper for rendered Markdown: an `<article class="ir-prose">` styled by the SDK's
 * layered default stylesheet and keyed to the host theme through `data-theme`.
 *
 * `FileRouter` uses it for every routed `.md`/`.mdx` file. An app that renders Markdown
 * itself can wrap its content in it to get the same typography; any unlayered CSS the app
 * ships overrides the defaults, and setting a token such as `--accent` or `--sans` on an
 * ancestor restyles every rule that reads it.
 */
export const Prose = ({ className, children, filename, ref, ...rest }: ProseProps) => {
  useLayoutEffect(() => {
    ensureProseStyles();
  }, []);
  const theme = useHostTheme();
  const tokens = useProseTokens(filename);
  const element = useRef<HTMLElement | null>(null);
  const setElement = useCallback(
    (node: HTMLElement | null) => {
      element.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  // Author tokens are SET, one property at a time, on this element; never written as CSS
  // text. Each set is removed before the next (a token dropped from the file must stop
  // applying) and on unmount.
  useLayoutEffect(() => {
    const el = element.current;
    if (!el || !tokens) return;
    const entries = tokensFor(tokens, theme);
    for (const [name, value] of entries) el.style.setProperty(name, value);
    return () => {
      for (const [name] of entries) el.style.removeProperty(name);
    };
  }, [tokens, theme]);

  return (
    <article
      {...rest}
      ref={setElement}
      className={className ? `${PROSE_CLASS} ${className}` : PROSE_CLASS}
      data-theme={theme}
    >
      {children}
    </article>
  );
};
