import react__default from 'react';
import { FilesMetadata, Metadata } from './sandboxTypes.js';

/** How a provided store combines with the one already in scope. */
type MetadataSourceMode = 
/** The provided map IS the store for descendants — the host's entries are not
 *  visible. The default: a viewer that scanned its own corpus is describing a
 *  different file space, not adding to the platform's. */
'replace'
/** The provided entries are layered OVER what is already in scope: a path the
 *  provider does not name still resolves to the outer store's value. For a viewer
 *  that augments the app-root scan rather than replacing it. */
 | 'merge';
interface MetadataSourceProps {
    /** The metadata store to provide: path → frontmatter. */
    value: FilesMetadata<Metadata>;
    /** Default `'replace'`. See {@link MetadataSourceMode}. */
    mode?: MetadataSourceMode;
    children?: react__default.ReactNode;
}
/**
 * Provide a metadata store to `useMetadataQuery`, `useFileMetadata` and
 * `useAllMetadata` for everything rendered inside.
 *
 * ```tsx
 * <MetadataSource value={corpus.metadata}>
 *   <Wiki />
 * </MetadataSource>
 * ```
 *
 * Nesting is allowed and the innermost provider wins; `mode="merge"` layers over
 * whatever is in scope (an outer provider, else the host's store). Unmounting the
 * provider restores the outer store — there is no registry to clean up, so an app
 * cannot leak a stale source by forgetting to unregister.
 *
 * The value is used as given: pass a stable reference (a `useMemo`, module state)
 * if you care about the query hooks' identity-preservation, which is what keeps
 * their results usable in dependency arrays.
 */
declare const MetadataSource: ({ value, mode, children, }: MetadataSourceProps) => react__default.ReactElement;
/**
 * The metadata store in scope: the nearest {@link MetadataSource}, else the host's.
 *
 * The metadata hooks read through this, so an app never has to know which of the
 * two answered. Exported because a component that wants the raw map without the
 * query machinery should not have to reach for `TinkerableContext` and get the
 * answer wrong when a provider is present.
 */
declare const useMetadataStore: <T = Metadata>() => FilesMetadata<T>;

export { MetadataSource, type MetadataSourceMode, type MetadataSourceProps, useMetadataStore };
