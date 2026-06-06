// hostFetch — the app-facing side of the §5.11 parent-fetch proxy. The app calls
// `hostFetch(url, init)`; the HOST performs the fetch with its real origin, but
// only after validating `url` against your manifest's
// `requests."net:fetch".hosts` ∩ the user's consented hosts, blocking SSRF
// targets, omitting immediately.run credentials, refusing redirects, and bounding
// the response size. No raw network handle ever crosses the boundary (§8.10) —
// only the serialized response.

import { protocolRequest } from './sandboxUtils';

export interface HostFetchInit {
  method?: string;
  headers?: Record<string, string>;
  /** Request body for non-GET/HEAD methods (string). */
  body?: string;
}

export interface HostFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  /** True if the body hit the host's size cap and was truncated. */
  truncated: boolean;
}

/**
 * Fetch through the host's parent-fetch proxy (§5.11). Requires the `net:fetch`
 * capability with `url`'s origin in your effective allowlist (manifest ∩ the
 * user's consent) — both are arranged at load via the consent screen.
 *
 * A reachable server's reply (including a non-2xx status) RESOLVES — inspect
 * `.status`. A gate/SSRF/transport failure REJECTS with an {@link Error} carrying
 * a machine `.code`: `forbidden` (outside the allowlist), `blocked` (SSRF target),
 * `invalid` (bad url/scheme), `redirect` (the host refuses to follow redirects),
 * `too-large`, or `network`.
 */
export const hostFetch = async (
  url: string,
  init: HostFetchInit = {},
): Promise<HostFetchResponse> => {
  const res = (await protocolRequest('fetch', 'fetch', [
    { url, method: init.method, headers: init.headers, body: init.body },
  ])) as
    | { ok: true; data: HostFetchResponse }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'hostFetch failed') as Error & { code?: string };
    err.code = (res && 'code' in res ? res.code : undefined) ?? 'unknown';
    throw err;
  }
  return res.data;
};
