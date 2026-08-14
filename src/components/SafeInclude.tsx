import { Suspense, use, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { openAppFs, openFs } from '../fs';
import { getAppMountPath } from '../mounts';
import { useMDXComponents } from '../MDXProvider';
import { SafeContent } from '../safeContent/SafeContent';
import { createSourceCache, type SourceReader } from '../sourceCache';
import { RenderExportedComponentContext } from './includeContexts';
import { defaultErrorComponent, defaultLoadingComponent } from './defaults';

// `<Include mode="interpreted">` — the same tag, the NON-EXECUTABLE renderer. (R3-263)
//
// WHY THIS EXISTS. `<Include>` resolves a file through the module cache and *evaluates* it,
// which is right for an app's own source and wrong for content. An interpreter app
// (TRUST_MODES_SPEC §5) had no way to say "include this file, but as data": it could render
// its own bodies through `<SafeContent>` while any file it pulled in with `<Include>` still
// executed. Grove hit exactly that — a wiki declaring `render: safe` still ran author
// JavaScript out of its `_layout.mdx`, because the layout chain went through `<Include>`.
//
// It is also what makes such a file renderable AT ALL when it does not live in the app: the
// compiled path evaluates an app-source module, which a file resident in a content mount is
// not. That is the `AGENT_AUTHORING §10` MDX-from-mount gate, which `TRUST_MODES §5.1` says
// MUST terminate in the safe renderer and never in compiled MDX.
//
// The component map comes from `useMDXComponents` — the SAME provider map `boot({
// mdxComponents })` establishes for the compiled path — so a document resolves the identical
// vocabulary under either renderer and an app wires nothing extra to get it.

/** Strip a leading YAML frontmatter block (and an optional BOM). The compiled path never
 *  renders frontmatter — the MDX loader consumes it — so the safe path must not either, or
 *  the same file gains a wall of raw YAML when the renderer changes. */
export function stripFrontmatter(source: string): string {
  return source.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '');
}

/** `/app/content/x.mdx` → `content/x.mdx`. {@link openAppFs} is anchored at the app mount,
 *  so an absolute module path has to be made mount-relative before it is read. A path that
 *  is already relative is passed through untouched. */
export function appMountRelative(filename: string): string {
  const root = getAppMountPath().replace(/\/+$/, '');
  const abs = filename.startsWith(root + '/') ? filename.slice(root.length) : filename;
  return abs.replace(/^\/+/, '');
}

/** Is this an absolute path that lies OUTSIDE this app's own repo mount — i.e. a file
 *  resident in a content mount rather than in the app? */
export function isForeignMountPath(filename: string): boolean {
  if (!filename.startsWith('/')) return false;
  const root = getAppMountPath().replace(/\/+$/, '');
  return !filename.startsWith(`${root}/`) && filename !== root;
}

/**
 * Read an interpreted include's bytes.
 *
 * The reason this is not just `openAppFs()`: **the whole point of the interpreted include
 * is files the app did not author**, and the two consumers named in this file's header —
 * a dispatched wiki's `_layout.mdx`, a whiteboard object body — live in a MOUNT. An
 * app-anchored read cannot reach them, and it does not fail loudly either: the absolute
 * path is stripped to a relative one and looked up *inside the app*, so
 * `/task/<slot>/dir/_layout.mdx` becomes a miss at `task/<slot>/dir/_layout.mdx` in the
 * app's own tree. A silent wrong-file lookup, in the component whose job is rendering
 * other people's content.
 *
 * So: a path under the app mount reads exactly as before, and an absolute path outside it
 * — which could only ever have failed — reads from the unified sandbox namespace, where
 * every mount is addressable. This widens what resolves and changes nothing that resolved.
 */
function readInterpretedSource(filename: string): Promise<string> {
  if (isForeignMountPath(filename)) {
    // Anchored at the namespace root: mounts are addressable by their absolute paths, and
    // this component has no way to know (and no need to know) which mount a path belongs
    // to. It confers nothing — the ZenFS port is already chroot/`ro`-enforced host-side.
    return openFs({ path: '/', type: 'mount' } as never).readFile(
      filename.replace(/^\/+/, ''),
      'utf8',
    ) as Promise<string>;
  }
  return openAppFs().readFile(appMountRelative(filename), 'utf8') as Promise<string>;
}

// One cache for every interpreted include in the app: a layout file is included on every
// page, so a per-component cache would re-read it per navigation. See `../sourceCache` for
// why a REJECTED read must not be memoised.
const defaultSources = createSourceCache(readInterpretedSource);

function InterpretedBody({
  filename,
  components,
  readSource,
}: {
  filename: string;
  components?: Record<string, unknown>;
  readSource?: SourceReader;
}) {
  // A caller-supplied reader gets its own cache; the shared one is used otherwise. Memoised
  // on the reader identity so `use()` still sees a stable promise across renders.
  const sources = useMemo(
    () => (readSource ? createSourceCache(readSource) : defaultSources),
    [readSource],
  );
  const raw = use(sources.read(filename));
  const provided = useMDXComponents(components) as Record<string, unknown>;
  const body = stripFrontmatter(raw);
  return (
    // Publishing the included file's path is what lets the WikiLink resolver know which file
    // a relative `[[target]]` (and its `#sec-…` fragment) is relative TO — the same context
    // the compiled path publishes from the module's evaluation.
    <RenderExportedComponentContext
      value={{ evaluationContext: { evaluation: { module: { filepath: filename } } } } as never}
    >
      <SafeContent source={body} components={provided as never} />
    </RenderExportedComponentContext>
  );
}

/** Render another file's Markdown/MDX **as data** — no author JavaScript executes. Reached
 *  via `<Include mode="interpreted">` or `<IncludeModeContext value="interpreted">`. */
export const SafeInclude = ({
  filename,
  components,
  readSource,
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
}: {
  filename: string;
  /** Extra/override components, merged OVER the surrounding MDXProvider map. */
  components?: Record<string, unknown>;
  /** Read the raw bytes yourself — e.g. from a content mount rather than the app repo. */
  readSource?: SourceReader;
  LoadingComponent?: typeof defaultLoadingComponent;
  ErrorComponent?: typeof defaultErrorComponent;
}) => (
  // Same boundary shape as the compiled path: a file that fails to read renders the error
  // component rather than taking down the tree that included it.
  <ErrorBoundary fallbackRender={ErrorComponent}>
    <Suspense fallback={<LoadingComponent />}>
      <InterpretedBody filename={filename} components={components} readSource={readSource} />
    </Suspense>
  </ErrorBoundary>
);
