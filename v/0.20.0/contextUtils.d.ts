import { RoutingSpec } from './RoutingSpec.js';
import { TinkerableState } from './TinkerableContext.js';
import { FilesMetadata } from './sandboxTypes.js';
import 'react';

declare const getContextFromUrl: (routingSpec: RoutingSpec, outerHref: string, filesMetadata?: FilesMetadata) => TinkerableState;
declare const getInitialContext: (routingSpec: RoutingSpec) => (() => TinkerableState);
declare const updateContext: (context: TinkerableState, href: string) => TinkerableState;

export { getContextFromUrl, getInitialContext, updateContext };
