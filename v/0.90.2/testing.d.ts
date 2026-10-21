/** A message pushed host → app, as it arrives on `onMessage`. */
interface HostMessage {
    type: string;
    [k: string]: unknown;
}
/** An outbound `sendMessage` captured by the mock. */
interface SentMessage {
    type: string;
    data: Record<string, unknown>;
}
/** An outbound `protocolRequest` captured by the mock. */
interface ProtocolCall {
    protocol: string;
    method: string;
    params: unknown[];
}
/** Responder stub for a `protocolRequest(protocol, method, …)`. */
type ProtocolResponder = (params: unknown[]) => unknown;
/** Extra §4 discovery-global fields to publish alongside `transport` on install. */
interface MockHostGlobalExtras {
    runtimeVersion?: string;
    protocolVersion?: string;
    appMountPath?: string;
}
/** The controllable mock host returned by {@link createMockHost}. */
interface MockHost {
    /** The §4 host transport object (also published on the global by `install`). */
    transport: {
        sendMessage(type: string, data?: Record<string, unknown>): void;
        protocolRequest(protocol: string, method: string, params: unknown[]): Promise<unknown>;
        onMessage(handler: (msg: HostMessage) => void): {
            dispose(): void;
        };
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
/** Build a controllable mock host. Nothing is global until you call `install()`. */
declare function createMockHost(): MockHost;

export { type HostMessage, type MockHost, type MockHostGlobalExtras, type ProtocolCall, type ProtocolResponder, type SentMessage, createMockHost };
