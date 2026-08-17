// Inter-app messaging (UI_AS_APPS_SPEC §5.6) — L2: chrome panels/regions talk to
// each other across an edge BOTH sides declared in their bindings (sender `ipc.to`
// + the `ipc` capability; receiver `ipc.accepts`). The host enforces both halves
// and attaches an unspoofable `from`; you still treat the payload as untrusted.
import { useEffect, useState } from 'react';
import { protocolRequest, addListener } from './sandboxUtils';

/** A message delivered to this region. `from` is the SENDER's region, attached by
 *  the host (unspoofable, T19); `data` is the sender-provided payload. */
export interface RegionMessage {
  from: string;
  data: unknown;
}

/**
 * Send a message to another region. Resolves when delivered; rejects (`forbidden`)
 * if the edge isn't two-sided-consented, the target isn't mounted, or this app
 * lacks the `ipc` capability.
 */
export const postToRegion = async (region: string, data: unknown): Promise<void> => {
  const res = (await protocolRequest('ipc', 'post', [{ to: region, msg: data }])) as
    | { ok: true }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'ipc post failed') as Error & { code?: string };
    err.code = res?.code ?? 'unknown';
    throw err;
  }
};

/**
 * Ask the host to bring the user to `region` — the `reveal`-class method of
 * UI_AS_APPS_SPEC §4.1's focus model (R3-243). On mobile that is the column
 * transition (the panel's carousel advances to the main pane); on desktop a focus
 * move. Use it when a tap in your panel produces something to look at in another
 * column, right after the `postToRegion` that sends it there:
 *
 * ```ts
 * onClick={() => {                                   // a REAL user gesture
 *   void postToRegion('stage.conversation', { type: 'select-conversation', id });
 *   void revealRegion('stage.conversation');
 * }}
 * ```
 *
 * **Call it synchronously inside a user-gesture handler.** The host reads its own
 * transient user activation and refuses without one — an app flipping columns on a
 * timer is the attention-steal primitive §4.1 is written against. It reaches only
 * regions you already have a two-sided IPC edge to, and only within the active
 * activity, so it can neither jump the user into an unrelated surface nor pull
 * focus back to the caller's own column.
 *
 * Resolves once the host has *considered* the request — deliberately NOT reporting
 * whether focus actually moved. Whether the user is moved is the host's call
 * (activation, rate limit, already-there), and an app that could observe the
 * refusal would be tempted to retry, which is the behaviour the gate exists to
 * stop. Rejects only on a genuine authorization failure (`forbidden`): no `ipc`
 * capability, or no declared edge to `region`.
 */
export const revealRegion = async (region: string): Promise<void> => {
  const res = (await protocolRequest('ipc', 'reveal', [{ to: region }])) as
    | { ok: true }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'ipc reveal failed') as Error & { code?: string };
    err.code = res?.code ?? 'unknown';
    throw err;
  }
};

/** Subscribe to inbound region messages. Returns an unsubscribe fn. */
export const onRegionMessage = (listener: (msg: RegionMessage) => void): (() => void) =>
  addListener('region-message', (m: { from: string; data?: unknown }) =>
    listener({ from: m.from, data: m.data }),
  );

/** React hook: the most recent inbound region message (or `null`). */
export const useRegionMessage = (): RegionMessage | null => {
  const [msg, setMsg] = useState<RegionMessage | null>(null);
  useEffect(() => onRegionMessage(setMsg), []);
  return msg;
};
