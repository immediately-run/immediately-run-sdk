/** The closed secret-type vocabulary (SECRETS_SPEC §2). `api-key` is always
 *  origin-bound; `oauth-refresh` is reserved (no substitution in v1). */
type SecretType = 'api-key' | 'bearer-token' | 'oauth-refresh';
/**
 * The metadata-only projection of a stored secret (SECRETS_SPEC §2/§4) — exactly
 * what `secrets:list` and the powerbox return. **There is no `value` field by
 * design**: the plaintext is never part of any record an app receives.
 */
interface SecretView {
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
interface SecretHints {
    type?: SecretType;
    family?: string;
    /** Pre-fill the bound origin (e.g. `https://api.anthropic.com`). */
    suggestedOrigin?: string;
    description?: string;
}
/** What `requestSecret()` matches against in the powerbox picker (SECRETS_SPEC §5). */
interface SecretQuery {
    type?: SecretType;
    family?: string;
}
/**
 * The result of a granted `requestSecret()` — a durable `(appKey, secretId)` use
 * grant plus the secret's metadata. **Never the value.** Hold onto nothing but
 * this; the host substitutes the value into matching `net:fetch` requests.
 */
interface SecretGrant {
    /** Opaque handle for the minted `(appKey, secretId)` grant. */
    grantId: string;
    /** Metadata of the bound secret (no value). */
    secret: SecretView;
}
/** An error from a secret operation, carrying a machine-readable `code`. */
interface SecretError extends Error {
    code: 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'invalid-params' | 'unknown';
}
/**
 * Ask the user to store a new secret (SECRETS_SPEC §4 `secrets:add`). Opens a
 * **host-drawn** modal (the value is typed into host chrome, never via the app);
 * resolves with the new secret's {@link SecretView} metadata, or rejects with a
 * {@link SecretError} (`cancelled` if the user dismisses the modal). Requires the
 * `secrets:add` capability.
 */
declare const requestAddSecret: (hints?: SecretHints) => Promise<SecretView>;
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
declare const requestSecret: (query?: SecretQuery) => Promise<SecretGrant>;
/**
 * Delete a stored secret and tombstone every dependent per-app use grant
 * (SECRETS_SPEC §4 `secrets:revoke`, §8.15 cascade). Requires `secrets:revoke`.
 */
declare const revokeSecret: (id: string) => Promise<void>;
/** The metadata of the user's stored secrets (never values), `secrets:list`. Poll
 *  for a one-off read; use {@link onSecretsChange}/{@link useSecrets} to react. */
declare const getSecrets: () => SecretView[];
/** Subscribe to secret-metadata changes (added/revoked). Invoked immediately with
 *  the current list, then on every change. Returns an unsubscribe fn. */
declare const onSecretsChange: (listener: (secrets: SecretView[]) => void) => (() => void);
/** React hook returning the user's secret metadata (never values), re-rendering
 *  on change. For the Settings app (SECRETS_SPEC §7). */
declare const useSecrets: () => SecretView[];

export { type SecretError, type SecretGrant, type SecretHints, type SecretQuery, type SecretType, type SecretView, getSecrets, onSecretsChange, requestAddSecret, requestSecret, revokeSecret, useSecrets };
