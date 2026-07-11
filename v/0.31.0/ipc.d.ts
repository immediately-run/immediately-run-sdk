/** A message delivered to this region. `from` is the SENDER's region, attached by
 *  the host (unspoofable, T19); `data` is the sender-provided payload. */
interface RegionMessage {
    from: string;
    data: unknown;
}
/**
 * Send a message to another region. Resolves when delivered; rejects (`forbidden`)
 * if the edge isn't two-sided-consented, the target isn't mounted, or this app
 * lacks the `ipc` capability.
 */
declare const postToRegion: (region: string, data: unknown) => Promise<void>;
/** Subscribe to inbound region messages. Returns an unsubscribe fn. */
declare const onRegionMessage: (listener: (msg: RegionMessage) => void) => (() => void);
/** React hook: the most recent inbound region message (or `null`). */
declare const useRegionMessage: () => RegionMessage | null;

export { type RegionMessage, onRegionMessage, postToRegion, useRegionMessage };
