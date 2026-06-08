import * as react from 'react';
import { NavigationState } from './TinkerableContext.js';
import { RoutingRule, RoutingSpec } from './RoutingSpec.js';
import './sandboxTypes.js';

type AppliedRoutingRule = {
    routingRule: RoutingRule;
    pathParameters?: Record<string, string>;
};
declare const useTinkerableLink: (newSandboxLocation: string) => string;
declare const applyRoutingRule: (routingSpec: RoutingSpec, navigationState: NavigationState) => AppliedRoutingRule | undefined;
declare const Router: () => react.ReactNode;
declare const navigate: (target: string) => void;

export { type AppliedRoutingRule, Router, applyRoutingRule, navigate, useTinkerableLink };
