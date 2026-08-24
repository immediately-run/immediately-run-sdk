// The host-attention channel (R3-307) — what the host is waiting for, right now.
//
// THE GAP THIS CLOSES. R3-298 bounded every host protocol call and classified each as
// `attended` or `unattended`, but classification is per `(scheme, method)` and
// attendedness is really a property of a MOMENT: `spaces:mount` is unattended when the
// grant is already held and attended on first use, because the host raises consent INSIDE
// the request. A per-method table cannot tell those apart, so R3-298 put anything that MAY
// prompt on the long (attended) bound — which means the common grant-held path also waits
// ten minutes before it reports a fault, and a caller can only say "still waiting on
// something that may need you", never "tap your passkey".
//
// Only the HOST knows a prompt is on screen right now and what it is. So it says so, on a
// channel every app can read, and two things become possible:
//
//   1. A surface can name what it is waiting for. "Waiting for your passkey…" instead of a
//      spinner is most of a user's ability to act — especially on the provider-setup
//      wizard's Test-connection step, whose whole purpose is to prove setup worked.
//   2. The attended bounds become a fact rather than a guess. A may-prompt call runs on the
//      SHORT bound and is suspended only while the host says a person is being asked
//      (`protocolDeadline.ts`, `sandboxUtils.withDeadline`).
//
// WHAT IT DELIBERATELY DOES NOT CARRY. No secret value, no secret id, no app key, no
// capability, no resource name — nothing from which a held grant could be inferred. It is
// readable by every app at the baseline principal, so it says only that the HOST is busy
// and with what KIND of prompt. That is information the user is already looking at: a host
// modal is visible chrome. (The residual it does leave — one app observing that some prompt
// is up while another app's call is in flight — is the accepted low-bandwidth L0 signalling
// class of the threat model §7.6, and carries no identifying detail to signal WITH.)
import { createPushChannel } from './pushChannel';
import { HOST_ATTENTION, REQUEST_HOST_ATTENTION } from './generated/protocol';

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
export type HostAttentionKind = 'passkey' | 'consent' | 'picker' | 'confirmation';

/** Whether the host is waiting on the user right now, and for what. */
export interface HostAttention {
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
export const NO_HOST_ATTENTION: HostAttention = { awaiting: false, kind: null, since: null };

const KINDS: ReadonlySet<string> = new Set(['passkey', 'consent', 'picker', 'confirmation']);

/** Tolerant parse: a host that pushes a malformed payload is ignored, not believed. An
 *  `awaiting` frame with no valid `kind` still counts as awaiting — the wait is the
 *  load-bearing bit and the copy can fall back to a generic sentence. */
const parseHostAttention = (value: unknown): HostAttention | undefined => {
  const a = value as Partial<HostAttention> | null | undefined;
  if (!a || typeof a !== 'object' || typeof a.awaiting !== 'boolean') return undefined;
  if (!a.awaiting) return NO_HOST_ATTENTION;
  return {
    awaiting: true,
    kind: typeof a.kind === 'string' && KINDS.has(a.kind) ? (a.kind as HostAttentionKind) : null,
    since: typeof a.since === 'number' ? a.since : null,
  };
};

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `host-attention` and
// answers `request-host-attention` (wire format: site-main channelBridge.ts). Read
// DEFENSIVELY — a host that does not yet push it simply never answers, `initial` stands,
// and every caller behaves exactly as it did before this channel existed.
const channel = createPushChannel<HostAttention>({
  pushType: HOST_ATTENTION,
  requestType: REQUEST_HOST_ATTENTION,
  initial: NO_HOST_ATTENTION,
  parse: (msg) => parseHostAttention(msg.attention),
});

/** Returns what the host is waiting for right now. Poll for a one-off read. */
export const getHostAttention = (): HostAttention => channel.get();

/**
 * Subscribe to host-attention changes. The listener is invoked immediately with the current
 * value, then again on every change. Returns an unsubscribe fn.
 */
export const onHostAttentionChange = (listener: (attention: HostAttention) => void): (() => void) =>
  channel.onChange(listener);

/** React hook returning what the host is waiting for, re-rendering on change. */
export const useHostAttention = (): HostAttention => channel.use();
