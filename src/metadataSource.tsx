// A supported surface for a viewer app to provide its own metadata store
// (PLATFORM_LAYERING_SPEC §4 / S3, R3-276).
//
// WHAT IT REPLACES. A viewer that scans its own corpus — Grove under dispatch, any
// app whose content is not the app-root MDX the sandbox pre-scans — had exactly one
// way to get that map in front of the metadata hooks: re-provide the platform's own
// context wholesale,
//
//     <TinkerableContext.Provider value={{ ...host, filesMetadata: corpus.metadata }}>
//
// which is a fork of a platform contract in app code. It works until the platform
// adds a field to `TinkerableState`, at which point every such app is silently
// re-providing a stale copy of whatever it spread from — and nothing tells it.
//
// This narrows that to the one thing the app actually wanted to say: here is the
// metadata store for my subtree. The platform stays free to grow `TinkerableState`.

import React, { createContext, use, useMemo } from 'react';

import { TinkerableContext } from './TinkerableContext';
import type { FilesMetadata, Metadata } from './sandboxTypes';

/** How a provided store combines with the one already in scope. */
export type MetadataSourceMode =
  /** The provided map IS the store for descendants — the host's entries are not
   *  visible. The default: a viewer that scanned its own corpus is describing a
   *  different file space, not adding to the platform's. */
  | 'replace'
  /** The provided entries are layered OVER what is already in scope: a path the
   *  provider does not name still resolves to the outer store's value. For a viewer
   *  that augments the app-root scan rather than replacing it. */
  | 'merge';

interface MetadataSourceValue {
  filesMetadata: FilesMetadata<Metadata>;
}

/** Undefined outside any provider, which is how the hooks know to read the host's
 *  store instead of an empty one — the two are NOT the same state. */
const MetadataSourceContext = createContext<MetadataSourceValue | undefined>(undefined);

export interface MetadataSourceProps {
  /** The metadata store to provide: path → frontmatter. */
  value: FilesMetadata<Metadata>;
  /** Default `'replace'`. See {@link MetadataSourceMode}. */
  mode?: MetadataSourceMode;
  children?: React.ReactNode;
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
export const MetadataSource = ({ value, mode = 'replace', children }: MetadataSourceProps): React.ReactElement => {
  const outer = use(MetadataSourceContext);
  const host = use(TinkerableContext);
  const provided = useMemo<MetadataSourceValue>(() => {
    if (mode !== 'merge') return { filesMetadata: value };
    const base = outer?.filesMetadata ?? host?.filesMetadata ?? {};
    return { filesMetadata: { ...base, ...value } };
  }, [value, mode, outer, host]);
  return <MetadataSourceContext.Provider value={provided}>{children}</MetadataSourceContext.Provider>;
};

/**
 * The metadata store in scope: the nearest {@link MetadataSource}, else the host's.
 *
 * The metadata hooks read through this, so an app never has to know which of the
 * two answered. Exported because a component that wants the raw map without the
 * query machinery should not have to reach for `TinkerableContext` and get the
 * answer wrong when a provider is present.
 */
export const useMetadataStore = <T = Metadata,>(): FilesMetadata<T> => {
  const source = use(MetadataSourceContext);
  const host = use(TinkerableContext);
  return (source?.filesMetadata ?? host?.filesMetadata ?? {}) as FilesMetadata<T>;
};
