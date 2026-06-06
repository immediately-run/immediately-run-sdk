import { ReactNode } from 'react';

type RoutingRule = {
    name?: string;
    pattern: string | RegExp;
    reactNode: ReactNode | string;
};
type RoutingSpec = {
    routes: RoutingRule[];
};

export type { RoutingRule, RoutingSpec };
