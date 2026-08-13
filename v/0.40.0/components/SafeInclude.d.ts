import * as react from 'react';
import { SourceReader } from '../sourceCache.js';
import { defaultLoadingComponent, defaultErrorComponent } from './defaults.js';
import 'react-error-boundary';

/** Strip a leading YAML frontmatter block (and an optional BOM). The compiled path never
 *  renders frontmatter — the MDX loader consumes it — so the safe path must not either, or
 *  the same file gains a wall of raw YAML when the renderer changes. */
declare function stripFrontmatter(source: string): string;
/** `/app/content/x.mdx` → `content/x.mdx`. {@link openAppFs} is anchored at the app mount,
 *  so an absolute module path has to be made mount-relative before it is read. A path that
 *  is already relative is passed through untouched. */
declare function appMountRelative(filename: string): string;
/** Render another file's Markdown/MDX **as data** — no author JavaScript executes. Reached
 *  via `<Include mode="interpreted">` or `<IncludeModeContext value="interpreted">`. */
declare const SafeInclude: ({ filename, components, readSource, LoadingComponent, ErrorComponent, }: {
    filename: string;
    /** Extra/override components, merged OVER the surrounding MDXProvider map. */
    components?: Record<string, unknown>;
    /** Read the raw bytes yourself — e.g. from a content mount rather than the app repo. */
    readSource?: SourceReader;
    LoadingComponent?: typeof defaultLoadingComponent;
    ErrorComponent?: typeof defaultErrorComponent;
}) => react.JSX.Element;

export { SafeInclude, appMountRelative, stripFrontmatter };
