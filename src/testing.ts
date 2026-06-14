// Public testing utility — `@immediately-run/sdk/testing` (TESTING_AUTOMATION_SPEC
// §3/§7). A mock host transport so apps built on this SDK can unit-test their host
// interaction in CI, with no live bundler/host: drive the SDK's REAL transport path
// by installing this at the §4 discovery global, then `emit()` host→app pushes and
// assert your app reacts.
//
//   import { createMockHost } from '@immediately-run/sdk/testing';
//   const host = createMockHost();
//   host.install();                       // SDK now resolves this transport
//   host.stubProtocol('spaces', 'list', () => ({ ok: true, data: [] }));
//   // …render your app / call SDK functions…
//   host.emit({ type: 'mount-add', mount: { path: '/spaces/a', type: 'firestore', id: 'a' } });
//   expect(host.sent).toContainEqual({ type: 'request-mounts', data: {} });
//   host.uninstall();
//
// It implements the `sandboxUtils` host transport (sendMessage / protocolRequest /
// onMessage), so tests exercise the actual `transport()` resolution, the
// `addListener` type-filter, and `protocolRequest` round-trips — higher fidelity
// than mocking `./sandboxUtils` wholesale.

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
export type ProtocolResponder = (params: unknown[]) => unknown;

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
