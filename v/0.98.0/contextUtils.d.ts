import { RoutingSpec } from './RoutingSpec.js';
import { TinkerableState } from './TinkerableContext.js';
import { FilesMetadata } from './sandboxTypes.js';
import 'react';

declare const getContextFromUrl: (routingSpec: RoutingSpec, outerHref: string, filesMetadata?: FilesMetadata, filesHrefBase?: unknown) => TinkerableState;
declare const getInitialContext: (routingSpec: RoutingSpec) => (() => TinkerableState);
/** Apply a host `urlchange`. Each push carries the whole truth, so a push without a
 *  `filesHrefBase` clears the base (R3-1397). */
declare const updateContext: (context: TinkerableState, href: string, filesHrefBase?: unknown) => TinkerableState;

export { getContextFromUrl, getInitialContext, updateContext };
