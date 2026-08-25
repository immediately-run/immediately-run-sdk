// The host transport resolver (SDK_PACKAGING_SPEC §4, expose-transport) — the ONE place
// that answers "how do I reach the host from here".
//
// All host comms (sendMessage / protocolRequest / onMessage) go through this resolver so
// the SDK is transport-agnostic: it works whether it was INJECTED into the bundler's
// evaluation context (the current path — `module.evaluation.module.bundler.messageBus`) OR
// fetched from npm as an ordinary dependency, in which case the sandbox runtime hands it
// the transport via the §4 discovery global (`globalThis.__immediatelyRun__`).
//
// Dual-mode (§8): injection wins while it's active, so existing behaviour is byte-for-byte
// preserved; the global is the fallback the npm-fetched SDK uses. When injection is removed
// (phase 3), only the global path remains — `bundler.*` stops being API, which is the whole
// point.
//
// WHY THIS IS ITS OWN MODULE (R3-307). It was the bottom half of `sandboxUtils.ts` until
// the deadline machinery grew a dependency on the host-attention push channel. A push
// channel needs the transport, and `withDeadline` needs the channel, so leaving both in one
// module made `sandboxUtils → hostAttention → pushChannel → sandboxUtils` — a cycle, and
// this package's import graph is CI-enforced acyclic (`check:circular`; a circular SDK
// import once made the bundler infinite-loop). Splitting the *primitives* out puts
// `sandboxUtils` at the TOP of the graph instead of in the middle of it. `sandboxUtils`
// re-exports `sendMessage`/`addListener`, so every existing import site is unchanged and
// the api-snapshot entry for that module keeps all four of its names.
import { getHostRuntime } from './hostRuntime';

export interface HostTransport {
  sendMessage(type: string, data?: Record<string, any>): void;
  protocolRequest(protocolName: string, method: string, params: Array<any>): Promise<any>;
  onMessage(handler: (msg: any) => void): { dispose(): void };
}

export function transport(): HostTransport {
  // Injected bundler messageBus first — the current path, unchanged.
  try {
    // @ts-ignore - `module.evaluation` is injected by the sandbox runtime
    const injected = module?.evaluation?.module?.bundler?.messageBus;
    if (injected && typeof injected.sendMessage === 'function') return injected;
  } catch {
    /* no injection in this realm — fall through to the §4 global */
  }
  // §4 runtime-discovery transport (the npm-fetched SDK path).
  const t = getHostRuntime()?.transport as HostTransport | undefined;
  if (t && typeof t.sendMessage === 'function') return t;
  throw new Error('immediately.run: no host transport (neither injected nor __immediatelyRun__)');
}

export const sendMessage = (type: string, data: Record<string, any> = {}) => {
  transport().sendMessage(type, data);
};

export const addListener = (msgType: string, handler: (msg: any) => void, event?: any): (() => void) => {
  const onMessage = event ?? transport().onMessage;
  const disposable = onMessage((msg: any) => {
    if (msg.type === msgType) {
      handler(msg);
    }
  });
  return () => disposable.dispose();
};
