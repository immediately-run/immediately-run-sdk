import type { RoutingSpec } from './RoutingSpec';
import { type TinkerableState } from './TinkerableContext';
import { acceptFilesHrefBase, parseHref, getSearchParams } from './urlUtils';
import { FilesMetadata } from './sandboxTypes';
import { applyRoutingRule } from './routing';
import { getInjectedMetadataSnapshot } from './injectedBundler';

export const getContextFromUrl = (
  routingSpec: RoutingSpec,
  outerHref: string,
  filesMetadata?: FilesMetadata,
  filesHrefBase?: unknown,
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
    filesHrefBase: acceptFilesHrefBase(filesHrefBase, outerHref),
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
  // R3-1397: the host's href base rides beside it, as its own search param.
  return () =>
    getContextFromUrl(
      routingSpec,
      searchParams['href'],
      getInjectedMetadataSnapshot() ?? undefined,
      searchParams['filesHrefBase'],
    );
};

/** Apply a host `urlchange`. Each push carries the whole truth, so a push without a
 *  `filesHrefBase` clears the base (R3-1397). */
export const updateContext = (context: TinkerableState, href: string, filesHrefBase?: unknown): TinkerableState => {
  // Validated once, so a rejected base warns once; an accepted one re-validates silently.
  const base = acceptFilesHrefBase(filesHrefBase, href);
  // No update is necessary if neither the href nor the base has changed.
  if (href === context.outerHref && base === (context.filesHrefBase ?? null)) {
    return context;
  }
  return getContextFromUrl(context.routingSpec, href, context.filesMetadata, base);
};
