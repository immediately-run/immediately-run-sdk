import type { RoutingSpec } from './RoutingSpec';
import { type TinkerableState } from './TinkerableContext';
import { parseHref, getSearchParams } from './urlUtils';
import { FilesMetadata } from './sandboxTypes';
import { applyRoutingRule } from './routing';
import { getInjectedMetadataSnapshot } from './injectedBundler';

export const getContextFromUrl = (
  routingSpec: RoutingSpec,
  outerHref: string,
  filesMetadata?: FilesMetadata,
): TinkerableState => {
  const navigationState = parseHref(outerHref);
  const appliedRoutingRule = applyRoutingRule(routingSpec, navigationState);
  if (!appliedRoutingRule) {
    // TODO: better error
    throw new Error(`No route registered for path ${navigationState.sandboxPath}!`);
  }
  return {
    filesMetadata: filesMetadata ?? {},
    routingSpec,
    outerHref,
    navigationState: {
      ...navigationState,
      ...appliedRoutingRule,
    },
  };
};

export const getInitialContext = (routingSpec: RoutingSpec): (() => TinkerableState) => {
  const searchParams = getSearchParams();
  // initial href is passed in 'href' search param value; seed filesMetadata from the
  // injected bundler's boot snapshot (§1.4) so the first synchronous frame already
  // holds the full MDX collection (injected path). Off-injection the snapshot is null
  // → `{}`, and the store fills from `metadata-update` events as before (event-fill).
  return () => getContextFromUrl(routingSpec, searchParams['href'], getInjectedMetadataSnapshot() ?? undefined);
};

export const updateContext = (context: TinkerableState, href: string): TinkerableState => {
  // No update is necessary if outerHref has not changed.
  if (href === context.outerHref) {
    return context;
  }
  return getContextFromUrl(context.routingSpec, href, context.filesMetadata);
};
