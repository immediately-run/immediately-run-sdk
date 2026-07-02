import { ReactNode, use } from 'react';
import { Link } from './Link';
import { TinkerableContext, type NavigationState } from '../TinkerableContext';
import { underAppRoot } from '../urlUtils';

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
 * The current file's absolute `/app/…` path, from the routing context. The default
 * `DEFAULT_ROUTING_SPEC` routes `/files/*` to `FileRouter`, which renders
 * `underAppRoot(pathParameters['*'])` — so the routed file's fs path is exactly
 * that. Returns `undefined` for a route that is not the default `/files/*` file
 * route (e.g. an app's bespoke route), in which case a relative target cannot be
 * resolved by the default and routes optimistically.
 */
const currentFilePath = (navigationState?: NavigationState): string | undefined => {
  const rel = navigationState?.pathParameters?.['*'];
  return typeof rel === 'string' && rel ? underAppRoot(rel) : undefined;
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
 * **no implicit search path** (§13.3, a deliberate departure from Obsidian). The
 * current file is derived from the routing context (the default `/files/*` →
 * `FileRouter` bridge, `underAppRoot(pathParameters['*'])`), so no compile-time
 * per-node help is needed.
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
 * flashes "broken"), and a relative target with no derivable current file (a
 * bespoke, non-`/files/*` route) routes optimistically. An app with such routing
 * overrides this component (§11) for precise resolution.
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
  const { navigationState, filesMetadata } = use(TinkerableContext);
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

  const current = currentFilePath(navigationState);
  const resolved = resolveWikiTarget(rawTarget, current);
  const files = filesMetadata ?? {};
  const loaded = Object.keys(files).length > 0;

  // `resolved === undefined` ⇒ a relative target with no known base: route it
  // optimistically (can't check existence or self-ness generically).
  if (resolved !== undefined) {
    if (current && resolved === current) {
      return (
        <span className="ir-wikilink ir-wikilink-self" data-state="self" {...rest}>
          {text}
        </span>
      );
    }
    const exists = !loaded || resolved in files; // optimistic until loaded
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
  return (
    <Link href={rawTarget} className="ir-wikilink" data-state="resolved" {...rest}>
      {text}
    </Link>
  );
};
