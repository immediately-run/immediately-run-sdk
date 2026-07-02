import { ReactNode, use } from 'react';
import { Link } from './Link';
import { TinkerableContext } from '../TinkerableContext';

/** Derive a human label from a target path: basename without the extension. */
const labelFromTarget = (target: string): string => {
  const base = target.split(/[\\/]/).pop() ?? target;
  return base.replace(/\.mdx?$/i, '') || target;
};

/**
 * Resolve a wiki-link target to an absolute sandbox path. An **absolute** target
 * (`/…`) is taken verbatim; a **relative** target is resolved against the
 * compiling file's directory (`dirname(from)`). Pure path arithmetic — `.`/`..`
 * segments are collapsed — so it depends only on `target` + `from`, never on the
 * filesystem or any other file (the byte-identity split, MARKDOWN_SYNTAX_SPEC §13.2).
 */
const resolveWikiTarget = (target: string, from?: string): string => {
  const baseDir = target.startsWith('/')
    ? ''
    : from
      ? from.slice(0, from.lastIndexOf('/'))
      : '';
  const out: string[] = [];
  for (const seg of `${baseDir}/${target}`.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
};

/**
 * Default MDX `WikiLink` component — the render target for the `[[target]]` /
 * `[[label|target]]` wiki-link syntax. The transpiler remark plugin (R3-153)
 * compiles that syntax to `<WikiLink target="…" label="…" from="…">`, carrying the
 * raw target/label verbatim plus `from` — the authoring file's own path (a
 * byte-local value); **resolution lives here** (MARKDOWN_SYNTAX_SPEC §13.2).
 *
 * Registered in {@link DEFAULT_MDX_COMPONENTS} so wiki-links render even in a
 * plain-markdown repo (§11.2 phantom defaults). Targets are **paths only** —
 * relative (resolved against `dirname(from)`) or absolute — with **no implicit
 * search path** (§13.3, a deliberate departure from Obsidian).
 *
 * The resolved path is checked for **existence** against the live metadata store
 * (keyed by absolute `/app/…` paths) for the three states (§13.3):
 * - **self** — the resolved path is the current file: inert text, no link.
 * - **broken** — no file at the resolved path (and the store has loaded): rendered
 *   as marked text, **not** a throw.
 * - **resolved** — routed through {@link Link} (in-app navigation for a same-app
 *   href, a plain `<a>` otherwise).
 *
 * The check is **optimistic until the metadata store loads** (an empty store never
 * flashes "broken"). Precise app-specific route→file mapping is an **override**
 * concern (§11) — an app with a bespoke router replaces this component.
 */
export const WikiLink = ({
  target,
  label,
  from,
  children,
  ...rest
}: {
  target?: string;
  label?: ReactNode;
  /** The authoring file's path, emitted by the kernel plugin (§13.2). */
  from?: string;
  children?: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>): ReactNode => {
  const { filesMetadata } = use(TinkerableContext);
  const rawTarget = target ?? '';
  const text = children ?? label ?? (rawTarget ? labelFromTarget(rawTarget) : '');

  // Defensive: the kernel never emits an empty target, but a hand-written
  // `<WikiLink>` might. Render inert text rather than a link to nowhere.
  if (!rawTarget) {
    return (
      <span className="ir-wikilink" {...rest}>
        {text}
      </span>
    );
  }

  const resolved = resolveWikiTarget(rawTarget, from);
  const files = filesMetadata ?? {};
  const loaded = Object.keys(files).length > 0;
  const isSelf = !!from && resolved === resolveWikiTarget(from);
  const exists = !loaded || resolved in files; // optimistic until loaded

  if (isSelf) {
    return (
      <span className="ir-wikilink ir-wikilink-self" data-state="self" {...rest}>
        {text}
      </span>
    );
  }
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
  return (
    <Link href={rawTarget} className="ir-wikilink" data-state="resolved" {...rest}>
      {text}
    </Link>
  );
};
