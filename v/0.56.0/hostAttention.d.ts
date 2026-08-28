/**
 * What kind of host prompt is up.
 *
 * A closed set on purpose: it is the coarsest vocabulary that still lets a surface write a
 * sentence a user can act on, and adding a finer kind would start to describe the specific
 * thing being asked about — which is the disclosure this channel refuses.
 *
 * - `passkey` — a WebAuthn assertion. The user must tap their authenticator.
 * - `consent` — a capability/consent decision (mount, create, share, import, reference).
 * - `picker` — a host-drawn chooser or entry surface (the powerbox, the add-secret modal).
 * - `confirmation` — a notice or confirm the user must dismiss.
 */
type HostAttentionKind = 'passkey' | 'consent' | 'picker' | 'confirmation';
/** Whether the host is waiting on the user right now, and for what. */
interface HostAttention {
    /** `true` while a host prompt is on screen awaiting the user. */
    awaiting: boolean;
    /** The kind of prompt on screen — the innermost one, when they nest (an add-secret modal
     *  that reaches the passkey unlock reports `passkey`). `null` when not awaiting. */
    kind: HostAttentionKind | null;
    /** `Date.now()` when the current wait began — the start of the whole continuous span, not
     *  of the innermost prompt. `null` when not awaiting. */
    since: number | null;
}
/** Assumed before the host reports, and the value on a host that never pushes this channel
 *  at all: nobody is being asked. Defaulting the OTHER way would suspend every may-prompt
 *  deadline forever on an older host, which is the hang this whole line of work removes. */
declare const NO_HOST_ATTENTION: HostAttention;
/** Returns what the host is waiting for right now. Poll for a one-off read. */
declare const getHostAttention: () => HostAttention;
/**
 * Subscribe to host-attention changes. The listener is invoked immediately with the current
 * value, then again on every change. Returns an unsubscribe fn.
 */
declare const onHostAttentionChange: (listener: (attention: HostAttention) => void) => (() => void);
/** React hook returning what the host is waiting for, re-rendering on change. */
declare const useHostAttention: () => HostAttention;

export { type HostAttention, type HostAttentionKind, NO_HOST_ATTENTION, getHostAttention, onHostAttentionChange, useHostAttention };
