import { BoundedCallOptions } from './protocolDeadline.js';
export { addListener, sendMessage } from './hostTransport.js';
import './hostAttention.js';

/**
 * One host protocol request, BOUNDED (R3-298).
 *
 * The bound comes from the call's classification (`protocolDeadline.ts`): an unattended
 * channel round-trip gets tens of seconds, a call that may draw host chrome and wait for a
 * person gets minutes. Nothing is unbounded — an unbounded wait is the failure this fixes.
 *
 * Since R3-307 a call whose prompts the host actually announces runs on the SHORT bound and
 * is suspended only while the host says a person is being asked, so the common
 * grant-already-held path reports a fault in seconds instead of minutes. The absolute
 * ceiling still applies: the signal may extend a deadline, never remove it.
 *
 * The host's own work is NOT cancelled by `signal` or by the deadline. The one-shot
 * transport allocates its `msgId` internally, so the SDK has no handle to send the host a
 * cancel for (streams do, and `consumeStream` uses it). What the caller gets back is
 * control: it stops waiting and gets a typed error instead of hanging. A host prompt that
 * is already on screen stays there until the user dismisses it, which is correct — the SDK
 * must not be able to tear down host chrome the user is looking at.
 */
declare const protocolRequest: (protocolName: string, method: string, params: Array<any>, opts?: BoundedCallOptions) => Promise<any>;
/**
 * Race a host call against its deadline, a caller abort, and a pending notice.
 *
 * Kept separate from the transport so it is unit-testable against a promise that simply
 * never settles — which is the whole scenario, and one no live transport reproduces on
 * demand.
 *
 * An explicit `opts.timeoutMs` is the WHOLE bound and is never suspended: a caller that
 * names a number owns the wait, and silently stretching it past what they asked for would
 * be the same class of surprise this machinery exists to remove.
 */
declare function withDeadline<T>(scheme: string, method: string, start: () => Promise<T>, opts?: BoundedCallOptions): Promise<T>;

export { protocolRequest, withDeadline };
