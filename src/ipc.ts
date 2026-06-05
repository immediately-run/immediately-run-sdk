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

/** Subscribe to inbound region messages. Returns an unsubscribe fn. */
export const onRegionMessage = (listener: (msg: RegionMessage) => void): (() => void) =>
  addListener('region-message', (m: { from: string; data: unknown }) =>
    listener({ from: m.from, data: m.data }),
  );

/** React hook: the most recent inbound region message (or `null`). */
export const useRegionMessage = (): RegionMessage | null => {
  const [msg, setMsg] = useState<RegionMessage | null>(null);
  useEffect(() => onRegionMessage(setMsg), []);
  return msg;
};
