import * as react from 'react';
import { RoutingRule, RoutingSpec } from './RoutingSpec.js';
import { FilesMetadata } from './sandboxTypes.js';

type PathState = {
    mode: string;
    namespace: string;
    provider: string;
    repository: string;
    ref: string;
    sandboxPath: string;
    pathParameters?: Record<string, string>;
    routingRule?: RoutingRule;
};
type NavigationState = PathState & {
    hash: string;
    search: string;
};
type TinkerableState = {
    outerHref: string;
    navigationState: NavigationState;
    routingSpec: RoutingSpec;
    filesMetadata: FilesMetadata;
};
declare const TinkerableContext: react.Context<TinkerableState>;

export { type NavigationState, type PathState, TinkerableContext, type TinkerableState };
