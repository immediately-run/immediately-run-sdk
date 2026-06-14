import * as react_jsx_runtime from 'react/jsx-runtime';
import { FC } from 'react';
import { RoutingSpec } from './RoutingSpec.js';

type BootProps = {
    mdxComponents?: Record<string, FC>;
    routingSpec?: RoutingSpec;
};
declare const TinkerableApp: ({ routingSpec }: {
    routingSpec: RoutingSpec;
}) => react_jsx_runtime.JSX.Element;
declare const DEFAULT_ROUTING_SPEC: RoutingSpec;
declare const boot: ({ mdxComponents, routingSpec, }?: BootProps) => void;

export { type BootProps, DEFAULT_ROUTING_SPEC, TinkerableApp, boot };
