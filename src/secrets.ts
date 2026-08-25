// The host-owned secret store — app-facing surface (SECRETS_SPEC §4/§5).
//
// An app can ASK the user to store a secret (`requestAddSecret`), be GRANTED the
// right to USE a specific secret (`requestSecret`, the powerbox flow), LIST
// secret METADATA (`getSecrets`/`useSecrets`, never values), and REVOKE one
// (`revokeSecret`). The secret VALUE never crosses this boundary: it is read
// host-side, once, at the `net:fetch` injection point (SECRETS_SPEC §6). These
// functions move only hints, metadata, and grant handles.
//
// Resolves LLM_AND_AGENTS_SPEC D2 — the host-mediated BYOK key store. Inert until
// the host implements `protocol-secrets` + the `secrets-metadata` channel
// (SECRETS_SPEC §3/§6 host work, roadmap P1.E); the contract is shipped here so
// apps (e.g. the in-browser coding agent, P3-73) can be written against it.
import { protocolRequest } from './sandboxUtils';
import { createPushChannel } from './pushChannel';
import { PROTOCOL_SECRETS, REQUEST_SECRETS_METADATA, SECRETS_METADATA } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** The closed secret-type vocabulary (SECRETS_SPEC §2). `api-key` is always
 *  origin-bound; `oauth-refresh` is reserved (no substitution in v1). */
export type SecretType = 'api-key' | 'bearer-token' | 'oauth-refresh';

/**
 * The metadata-only projection of a stored secret (SECRETS_SPEC §2/§4) — exactly
 * what `secrets:list` and the powerbox return. **There is no `value` field by
 * design**: the plaintext is never part of any record an app receives.
 */
export interface SecretView {
  id: string;
  type: SecretType;
  family?: string;
  description: string;
  /** Required for `type:'api-key'` — the one https origin it may be sent to. */
  boundOrigin?: string;
  /** ISO-8601, or null if never used (drives the §8.15 90-day expiry). */
  lastUsedAt: string | null;
}

/** Hints for the host's "add secret" modal (SECRETS_SPEC §4 `secrets:add`). The
 *  app supplies only hints; the user types the value into host chrome. */
export interface SecretHints {
  type?: SecretType;
  family?: string;
  /** Pre-fill the bound origin (e.g. `https://api.anthropic.com`). */
  suggestedOrigin?: string;
  description?: string;
}

/** What `requestSecret()` matches against in the powerbox picker (SECRETS_SPEC §5). */
export interface SecretQuery {
  type?: SecretType;
  family?: string;
}

/**
 * The result of a granted `requestSecret()` — a durable `(appKey, secretId)` use
 * grant plus the secret's metadata. **Never the value.** Hold onto nothing but
 * this; the host substitutes the value into matching `net:fetch` requests.
 */
export interface SecretGrant {
  /** Opaque handle for the minted `(appKey, secretId)` grant. */
  grantId: string;
  /** Metadata of the bound secret (no value). */
  secret: SecretView;
}

/** An error from a secret operation, carrying a machine-readable `code`. */
export interface SecretError extends Error {
  code: 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'invalid-params' | 'unknown';
}

type SecretResult = { ok: true; data: unknown } | { ok: false; code: string; message: string };

// Issue a `protocol-secrets` request, unwrapping the host's {ok,data} envelope
// and throwing a typed SecretError on failure (mirrors mounts.ts `request`).
const request = async <T = unknown>(method: string, query: object = {}): Promise<T> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_SECRETS], method, [query])) as SecretResult;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'secret request failed') as SecretError;
    err.code = (res?.code as SecretError['code']) ?? 'unknown';
    throw err;
  }
  return res.data as T;
};

/**
 * Ask the user to store a new secret (SECRETS_SPEC §4 `secrets:add`). Opens a
 * **host-drawn** modal (the value is typed into host chrome, never via the app);
 * resolves with the new secret's {@link SecretView} metadata, or rejects with a
 * {@link SecretError} (`cancelled` if the user dismisses the modal). Requires the
 * `secrets:add` capability.
 */
export const requestAddSecret = (hints: SecretHints = {}): Promise<SecretView> => request<SecretView>('add', hints);

/**
 * Ask the user to bind one of their stored secrets to this app (SECRETS_SPEC §5,
 * the powerbox flow — modeled on `requestSpace()`). The host draws a picker of
 * **only the user's matching secrets**; the user picks, declines, or creates one.
 * On success the host records a durable `(appKey, secretId)` grant and resolves
 * with a {@link SecretGrant} (handle + metadata, **never the value**).
 *
 * **No existence oracle (T20/T27):** a decline, an ungranted secret, and a
 * nonexistent secret are indistinguishable — all reject with a {@link SecretError}
 * `cancelled`; the app never sees the list it chose from.
 */
export const requestSecret = (query: SecretQuery = {}): Promise<SecretGrant> => request<SecretGrant>('request', query);

/**
 * Delete a stored secret and tombstone every dependent per-app use grant
 * (SECRETS_SPEC §4 `secrets:revoke`, §8.15 cascade). Requires `secrets:revoke`.
 */
export const revokeSecret = async (id: string): Promise<void> => {
  await request('revoke', { id });
};

// The metadata-only `secrets-metadata` channel (Recipe A): the host pushes the
// current secret metadata on change and replays it on register-frame; gated by
// `secrets:list`. NEVER carries a value (SECRETS_SPEC §4).
const channel = createPushChannel<SecretView[]>({
  pushType: SECRETS_METADATA,
  requestType: REQUEST_SECRETS_METADATA,
  initial: [],
  parse: (msg) => (Array.isArray(msg.secrets) ? (msg.secrets as SecretView[]) : undefined),
});

/** The metadata of the user's stored secrets (never values), `secrets:list`. Poll
 *  for a one-off read; use {@link onSecretsChange}/{@link useSecrets} to react. */
export const getSecrets = (): SecretView[] => channel.get();

/** Subscribe to secret-metadata changes (added/revoked). Invoked immediately with
 *  the current list, then on every change. Returns an unsubscribe fn. */
export const onSecretsChange = (listener: (secrets: SecretView[]) => void): (() => void) => channel.onChange(listener);

/** React hook returning the user's secret metadata (never values), re-rendering
 *  on change. For the Settings app (SECRETS_SPEC §7). */
export const useSecrets = (): SecretView[] => channel.use();
