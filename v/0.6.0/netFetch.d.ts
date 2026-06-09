interface HostFetchInit {
    method?: string;
    headers?: Record<string, string>;
    /** Request body for non-GET/HEAD methods (string). */
    body?: string;
}
interface HostFetchResponse {
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
declare const hostFetch: (url: string, init?: HostFetchInit) => Promise<HostFetchResponse>;

export { type HostFetchInit, type HostFetchResponse, hostFetch };
