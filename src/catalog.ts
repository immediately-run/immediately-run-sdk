// The method catalog (UI_AS_APPS_SPEC §5.5) — the app's own grant-filtered RPC
// surface, and a generic way to call it. The host advertises exactly the methods
// this app may invoke (MCP-tool-shaped); `invoke()` calls one by its catalog name.
// Handing the catalog to an embedded agent as its tool list confines the agent to
// the app's authority (agent sandboxing falls out of the capability model, §5.9).
import { useEffect, useState } from 'react';
import { protocolRequest } from './sandboxUtils';
import type { StreamFrame } from './protocolStream';
import { consumeStream } from './protocolStream';

/** One advertised method, as the host generated it from its gate table. */
export interface ApiMethod {
  /** Catalog name, `protocol-` stripped — e.g. `spaces:share`, `contribute:run`. */
  name: string;
  /** The capability this method requires (already held — it's in your catalog). */
  capability: string;
  /** True when the method STREAMS (use {@link invokeStream}) vs. single-reply. */
  stream?: boolean;
}

// `scheme:method` → ['scheme', 'method'] (the wire protocol is `protocol-scheme`).
const split = (name: string): [string, string] => {
  const i = name.indexOf(':');
  if (i <= 0) throw new Error(`invalid catalog method name: ${name}`);
  return [name.slice(0, i), name.slice(i + 1)];
};

/**
 * Call a catalog method by name — `invoke('spaces:share', { spaceId, login, role })`.
 * A thin generic over the host protocol: the host validates params and gates the
 * call (an un-granted method → `forbidden`, even if you name it directly). For a
 * STREAMING method (`ApiMethod.stream`), use {@link invokeStream}.
 */
export const invoke = <T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<T> => {
  const [scheme, method] = split(name);
  return protocolRequest(scheme, method, [params]) as Promise<T>;
};

const bundlerTransport = {
  send: (msg: { type: string; method: string; params: unknown[]; msgId: number; stream: true }) =>
    // @ts-ignore - injected by the sandbox runtime
    module.evaluation.module.bundler.messageBus.sendMessage(msg.type, msg),
  subscribe: (type: string, handler: (msg: { msgId?: number; stream?: StreamFrame }) => void) => {
    // @ts-ignore - injected by the sandbox runtime
    const d = module.evaluation.module.bundler.messageBus.onMessage((m: { type?: string }) => {
      if (m && m.type === type) handler(m as { msgId?: number; stream?: StreamFrame });
    });
    return () => d.dispose();
  },
};

/** Call a STREAMING catalog method by name, yielding its events. */
export function invokeStream<T = unknown, R = unknown>(
  name: string,
  params: Record<string, unknown> = {},
): AsyncGenerator<T, R, void> {
  const [scheme, method] = split(name);
  return consumeStream<T, R>(bundlerTransport, `protocol-${scheme}`, method, [params]);
}

interface CatalogService {
  getCatalog(): ApiMethod[];
  onChange(listener: (catalog: ApiMethod[]) => void): { dispose(): void };
}

// `module.evaluation.module.bundler.catalog` — injected by the sandbox runtime.
const catalogService = (): CatalogService => {
  // @ts-ignore - injected by the sandbox runtime
  return module.evaluation.module.bundler.catalog;
};

/** The methods this app may call (grant-filtered, §5.5). Poll for a one-off read;
 *  use {@link onCatalogChange} / {@link useCatalog} to react. */
export const getCatalog = (): ApiMethod[] => catalogService().getCatalog();

/** Subscribe to catalog changes (e.g. a grant added/revoked). Invoked immediately
 *  with the current catalog, then on every change. Returns an unsubscribe fn. */
export const onCatalogChange = (listener: (catalog: ApiMethod[]) => void): (() => void) => {
  const disposable = catalogService().onChange(listener);
  return () => disposable.dispose();
};

/** React hook returning this app's method catalog, re-rendering on change. Hand
 *  it to an embedded agent as its tool list to confine the agent to the app's
 *  authority (§5.9). */
export const useCatalog = (): ApiMethod[] => {
  const [catalog, setCatalog] = useState<ApiMethod[]>(getCatalog);
  useEffect(() => onCatalogChange(setCatalog), []);
  return catalog;
};
