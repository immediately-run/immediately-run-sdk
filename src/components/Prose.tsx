import { useLayoutEffect, type ComponentPropsWithRef } from 'react';

import { ensureProseStyles, PROSE_CLASS } from '../proseStyles';
import { useHostTheme } from '../theme';

/**
 * The wrapper for rendered Markdown: an `<article class="ir-prose">` styled by the SDK's
 * layered default stylesheet and keyed to the host theme through `data-theme`.
 *
 * `FileRouter` uses it for every routed `.md`/`.mdx` file. An app that renders Markdown
 * itself can wrap its content in it to get the same typography; any unlayered CSS the app
 * ships overrides the defaults, and setting a token such as `--accent` or `--sans` on an
 * ancestor restyles every rule that reads it.
 */
export const Prose = ({ className, children, ...rest }: ComponentPropsWithRef<'article'>) => {
  useLayoutEffect(() => {
    ensureProseStyles();
  }, []);
  const theme = useHostTheme();
  return (
    <article {...rest} className={className ? `${PROSE_CLASS} ${className}` : PROSE_CLASS} data-theme={theme}>
      {children}
    </article>
  );
};
