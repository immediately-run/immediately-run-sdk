// Mock host transport — the in-CI emulation harness from TESTING_AUTOMATION_SPEC §3
// (docs/specs/TESTING_AUTOMATION_SPEC.md). It implements the §4 host transport
// (`sandboxUtils`' `HostTransport`: sendMessage / protocolRequest / onMessage) and
// installs itself at the runtime-discovery global `globalThis.__immediatelyRun__`, so
// a test drives the SDK's REAL transport-resolution path (`sandboxUtils.transport()`
// → the npm-fetched §4 branch) rather than mocking `./sandboxUtils` wholesale.
//
// Higher fidelity than the per-suite `mockTransport` helpers: those mock a narrow
// interface and bypass `transport()`; this exercises the actual resolver + the
// `addListener` type-filter + `protocolRequest` round-trip end to end. That is what
// lets transport-level changes (e.g. R3-51b's metadata-update-over-the-transport
// fallback, or mounts-over-the-transport once the host emits them) be verified in CI
// without a live bundler — the gap that forced R3-51b to ship "partially verified".

/** A message pushed host → app, as it arrives on `onMessage`. */
export interface HostMessage {
  type: string;
  [k: string]: unknown;
}

/** An outbound `sendMessage` captured by the mock. */
export interface SentMessage {
  type: string;
  data: Record<string, unknown>;
}

/** An outbound `protocolRequest` captured by the mock. */
export interface ProtocolCall {
  protocol: string;
  method: string;
  params: unknown[];
}

/** Responder stub for a `protocolRequest(protocol, method, …)`. */
type ProtocolResponder = (params: unknown[]) => unknown;

/** Extra §4 discovery-global fields to publish alongside `transport` on install. */
export interface MockHostGlobalExtras {
  runtimeVersion?: string;
  protocolVersion?: string;
  appMountPath?: string;
}

interface ImmediatelyRunGlobal extends MockHostGlobalExtras {
  transport?: unknown;
}

/** The controllable mock host returned by {@link createMockHost}. */
export interface MockHost {
  /** The §4 host transport object (also published on the global by `install`). */
  transport: {
    sendMessage(type: string, data?: Record<string, unknown>): void;
    protocolRequest(protocol: string, method: string, params: unknown[]): Promise<unknown>;
    onMessage(handler: (msg: HostMessage) => void): { dispose(): void };
  };
  /** Publish the transport at `globalThis.__immediatelyRun__` (npm-fetched path). */
  install(extras?: MockHostGlobalExtras): void;
  /** Remove the discovery global (call in `afterEach`). */
  uninstall(): void;
  /** Simulate a host → app push; delivered to every live `onMessage` handler. */
  emit(msg: HostMessage): void;
  /** Register a response for a `protocolRequest`; unstubbed calls reject. */
  stubProtocol(protocol: string, method: string, responder: ProtocolResponder): void;
  /** Every `sendMessage` the SDK made, in order. */
  readonly sent: SentMessage[];
  /** Every `protocolRequest` the SDK made, in order. */
  readonly protocolCalls: ProtocolCall[];
  /** Count of live `onMessage` listeners (leak checks). */
  handlerCount(): number;
}

const GLOBAL_KEY = '__immediatelyRun__';

/** Build a controllable mock host. Nothing is global until you call `install()`. */
export function createMockHost(): MockHost {
  const handlers = new Set<(msg: HostMessage) => void>();
  const sent: SentMessage[] = [];
  const protocolCalls: ProtocolCall[] = [];
  const responders = new Map<string, ProtocolResponder>();
  const key = (protocol: string, method: string) => `${protocol}::${method}`;

  const transport: MockHost['transport'] = {
    sendMessage(type, data = {}) {
      sent.push({ type, data });
    },
    protocolRequest(protocol, method, params) {
      protocolCalls.push({ protocol, method, params });
      const responder = responders.get(key(protocol, method));
      if (!responder) {
        return Promise.reject(
          new Error(`mockHost: no stub for protocolRequest('${protocol}', '${method}')`),
        );
      }
      // Resolve async so callers observe real microtask ordering.
      return Promise.resolve().then(() => responder(params));
    },
    onMessage(handler) {
      handlers.add(handler);
      return { dispose: () => handlers.delete(handler) };
    },
  };

  const g = globalThis as { [GLOBAL_KEY]?: ImmediatelyRunGlobal };

  return {
    transport,
    install(extras = {}) {
      g[GLOBAL_KEY] = { ...extras, transport };
    },
    uninstall() {
      delete g[GLOBAL_KEY];
    },
    emit(msg) {
      // Copy so a handler that unsubscribes mid-emit doesn't mutate the live set.
      for (const handler of [...handlers]) handler(msg);
    },
    stubProtocol(protocol, method, responder) {
      responders.set(key(protocol, method), responder);
    },
    sent,
    protocolCalls,
    handlerCount: () => handlers.size,
  };
}
