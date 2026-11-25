import { createContext } from 'react';
import { RoutingRule, RoutingSpec } from './RoutingSpec';
import { FilesMetadata } from './sandboxTypes';

export type PathState = {
  mode: string;
  namespace: string;
  provider: string;
  repository: string;
  ref: string;
  sandboxPath: string;
  pathParameters?: Record<string, string>;
  routingRule?: RoutingRule;
};

export type NavigationState = PathState & {
  hash: string;
  search: string;
};

export type TinkerableState = {
  outerHref: string;
  navigationState: NavigationState;
  routingSpec: RoutingSpec;
  filesMetadata: FilesMetadata;
  /** The host's href base for the app's `files/` space inside a bundle, or `null`
   *  (absent: an older host, or no bundle). Read it through `displayHref`. */
  filesHrefBase?: string | null;
};

export const TinkerableContext = createContext<TinkerableState>({} as TinkerableState);
