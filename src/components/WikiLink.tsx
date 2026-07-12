import { ReactNode, use } from 'react';
import { Link } from './Link';
import { RenderExportedComponentContext } from './Include';
import { TinkerableContext } from '../TinkerableContext';
import { splitHash } from '../urlUtils';

/** Derive a human label from a target path: basename without the extension. */
const labelFromTarget = (target: string): string => {
  const base = target.split(/[\\/]/).pop() ?? target;
  return base.replace(/\.mdx?$/i, '') || target;
};

/** Collapse `.`/`..`/empty segments into a clean absolute path. */
const normalize = (path: string): string => {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
};

/**
 * Resolve a wiki-link target to an absolute sandbox path, or `undefined` when it
 * cannot be resolved (a relative target with no known current file). An
 * **absolute** target (`/…`) is taken verbatim; a **relative** target resolves
 * against the current file's directory. Pure path arithmetic (MARKDOWN_SYNTAX_SPEC
 * §13.2) — it never touches the filesystem or any other file.
 */
const resolveWikiTarget = (target: string, currentFile?: string): string | undefined => {
  if (target.startsWith('/')) return normalize(target);
  if (!currentFile) return undefined;
  const dir = currentFile.slice(0, currentFile.lastIndexOf('/'));
  return normalize(`${dir}/${target}`);
};

/**
 * Default MDX `WikiLink` component — the render target for the `[[target]]` /
 * `[[label|target]]` wiki-link syntax. The transpiler remark plugin (R3-153)
 * compiles that syntax to `<WikiLink target="…" label="…">`, carrying the raw
 * target/label verbatim; **resolution lives here** (MARKDOWN_SYNTAX_SPEC §13.2).
 *
 * Registered in {@link DEFAULT_MDX_COMPONENTS} so wiki-links render even in a
 * plain-markdown repo (§11.2 phantom defaults). Targets are **paths only** —
 * relative (resolved against the current file's directory) or absolute — with
 * **no implicit search path** (§13.3, a deliberate departure from Obsidian).
 *
 * The **current file** — the one the link is *authored in* — is read from the
 * ambient `<Include>` render context. Every MDX file renders through `<Include>`
 * (`FileRouter` renders even the top-level file that way), and Include publishes
 * the rendered module's `EvaluationContext` to its subtree via
 * {@link RenderExportedComponentContext}; the nearest one's
 * `evaluation.module.filepath` is this file's own `/app/…` path. Because that
 * context nests with each `<Include>`, a relative target inside an included
 * fragment resolves against the **fragment**, not the top-level page in the URL.
 *
 * A target may carry a `#fragment` (`[[FILE.mdx#sec-8-9]]`, `[[#sec-8-9]]`): the
 * fragment is **split off** ({@link splitHash}, §13.5) and existence is resolved on
 * the **fragment-stripped path**, so a section citation to an existing file resolves
 * (not "broken"). The fragment then rides to navigation, where the scroll-after-nav
 * effect ({@link useScrollAfterNavigation}) lands the reader on the section.
 *
 * The resolved path is checked for **existence** against the live metadata store
 * (keyed by absolute `/app/…` paths) for the states (§13.3, §13.5):
 * - **anchor** — a fragment with no path (`[[#sec-8-9]]`), or a fragment whose path is
 *   the current file: a same-page {@link Link} that scrolls in place, no route change.
 * - **self** — the resolved path is the current file (no fragment): inert text, no link.
 * - **broken** — no file at the resolved path (and the store has loaded): rendered
 *   as marked text, **not** a throw.
 * - **resolved** — routed through {@link Link} (in-app navigation for a same-app
 *   href, a plain `<a>` otherwise), carrying any `#fragment`.
 *
 * The check is **optimistic until the metadata store loads** (an empty store never
 * flashes "broken"), and a relative target with no ambient render context (MDX
 * rendered outside `<Include>`) routes optimistically. Such an app overrides this
 * component (§11) for precise resolution.
 */
export const WikiLink = ({
  target,
  label,
  children,
  ...rest
}: {
  target?: string;
  label?: ReactNode;
  children?: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>): ReactNode => {
  const { filesMetadata } = use(TinkerableContext);
  const renderContext = use(RenderExportedComponentContext);
  const currentFile = renderContext?.evaluationContext?.evaluation?.module?.filepath;

  const rawTarget = target ?? '';
  const [pathPart, frag] = splitHash(rawTarget);
  const text = children ?? label ?? (rawTarget ? labelFromTarget(pathPart || frag || rawTarget) : '');

  // Defensive: the kernel never emits an empty target, but a hand-written
  // `<WikiLink>` might. Render inert text rather than a link to nowhere.
  if (!rawTarget) {
    return (
      <span className="ir-wikilink" {...rest}>
        {text}
      </span>
    );
  }

  // Same-page anchor: a fragment with no path (`[[#sec-8-9]]`). Scroll within the
  // current file — no route change (§13.5). <Link> intercepts a bare `#`-href.
  if (pathPart === '' && frag) {
    return (
      <Link href={`#${frag}`} className="ir-wikilink" data-state="anchor" {...rest}>
        {text}
      </Link>
    );
  }

  const resolved = resolveWikiTarget(pathPart, currentFile);
  const files = filesMetadata ?? {};
  const loaded = Object.keys(files).length > 0;

  // `resolved === undefined` ⇒ a relative target with no known current file: route
  // it optimistically (can't check existence or self-ness generically).
  if (resolved !== undefined) {
    if (currentFile && resolved === currentFile) {
      // The target IS this file. With a fragment it is a same-page anchor to another
      // of this file's sections; without one it is an inert self-reference.
      if (frag) {
        return (
          <Link href={`#${frag}`} className="ir-wikilink" data-state="anchor" {...rest}>
            {text}
          </Link>
        );
      }
      return (
        <span className="ir-wikilink ir-wikilink-self" data-state="self" {...rest}>
          {text}
        </span>
      );
    }
    // Existence is checked on the FRAGMENT-STRIPPED path (optimistic until loaded).
    const exists = !loaded || resolved in files;
    if (!exists) {
      return (
        <span
          className="ir-wikilink ir-wikilink-broken"
          data-state="broken"
          title={`No file at ${resolved}`}
          {...rest}
        >
          {text}
        </span>
      );
    }
  }
  // Resolved cross-file target: route through <Link>, carrying the raw target so its
  // `#fragment` rides through navigation to the scroll-after-nav effect (§13.5).
  return (
    <Link href={rawTarget} className="ir-wikilink" data-state="resolved" {...rest}>
      {text}
    </Link>
  );
};
