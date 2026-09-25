// The one place the SDK turns a host reply into a typed, coded rejection (R6).
//
// This was written out verbatim in `openExternal.ts`, `openRepository.ts` and — on the
// R3-708 branch — `spacesMode.ts`. Three copies of a six-line unwrap is where R6 stops
// being advice, and `check:clones` cannot see it (minLines 6, minTokens 50, and it does
// not normalise identifiers, so three blocks differing only in type names read as
// distinct). So it lives here, once.
//
// ---------------------------------------------------------------------------
// WHICH `ok` THIS READS, AND WHY IT MATTERS
// ---------------------------------------------------------------------------
//
// It reads the DISPATCHER ENVELOPE's `ok` — the host's answer to "did this call
// succeed", not a handler's own return value. site-main declares that envelope
// (`src/editor/requestDispatcher.ts`):
//
//     type SpaceResult =
//       | { ok: true; data: unknown }
//       | { ok: false; code: string; message: string };
//
// and the sandbox resolves it to the SDK unmodified (`src/protocol/iframe.ts`,
// `resolve(msg.result)`). So a refusal reaches us as `{ok:false, code, message}` — which
// is exactly what this function unwraps — and the host produces that frame by THROWING
// `spaceError(code, message)`. The dispatcher's `.catch` turns the throw into the frame.
//
// **A handler that RETURNS `{ok:false, code}` instead of throwing does not produce a
// refusal.** The dispatcher wraps a return value as `result: {ok: true, data: <return>}`,
// so the envelope says the call succeeded and the refusal is buried one level down, where
// nothing looks. This is not hypothetical and not new: `handleOpenRepository` RETURNS
// `{ok:false, code:'invalid'}` and `{ok:false, code:'no-activation'}` today. Driven
// against the built SDK with each reply shape:
//
//     thrown    -> threw, code=no-activation
//     returned  -> RESOLVED (the app believes the tab opened)
//
// That is a live defect in site-main's handler, not here — the envelope is the contract
// and this reads the contract. It is filed separately. It is written down here because
// this is the file a host author will be pointed at when they ask what shape to reply
// with, and the answer is: **throw `spaceError`; never return `{ok:false}`.**
//
// Deliberately NOT done: sniffing `res.data?.ok === false` as a second refusal shape.
// It would make a double-enveloped reply work, and in doing so bless the shape that
// causes the bug, leaving two contracts where the spec names one.

/** An error carrying a stable, host-supplied `code` the app can branch on. */
export interface CodedRefusalError<C extends string = string> extends Error {
  code: C;
}

/**
 * Throw a typed, coded error unless the host's reply envelope says the call succeeded.
 *
 * `fallbackMessage` is used when the host refused without a message, and `'unknown'` is
 * the code when it refused without one — a refusal is never reported as a success just
 * because it arrived under-specified.
 */
export function throwOnRefusal(res: unknown, fallbackMessage: string): void {
  const r = res as { ok?: unknown; code?: unknown; message?: unknown } | null | undefined;
  if (r && r.ok === true) return;
  const err = new Error(typeof r?.message === 'string' ? r.message : fallbackMessage) as CodedRefusalError;
  err.code = typeof r?.code === 'string' ? r.code : 'unknown';
  throw err;
}
