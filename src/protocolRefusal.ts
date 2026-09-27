// The one place the SDK turns a host reply envelope into a typed, coded rejection (R6).
//
// ---------------------------------------------------------------------------
// THE CENSUS — miscounted four times. COUNT THE GREP, and say which unit.
// ---------------------------------------------------------------------------
//
// R3-708's review said three copies, then five, then "ten across eight files". This file
// then said ten while the list beneath it summed to twelve, and a fourth reviewer caught
// that. The count is:
//
//   **twelve CALL SITES across nine FILES** — `grep -n 'throwOnRefusal(' src/*.ts`, minus
//   the declaration here and minus `*.test.*`:
//
//   dnd.ts · editor.ts · ipc.ts (×2) · mounts.ts (×3) · openExternal.ts ·
//   openRepository.ts · secrets.ts · spacesMode.ts · vcs.ts
//
// Every miscount came from the same two mistakes: reading files instead of counting the
// grep, and never saying which unit was being counted. `mounts.ts` has three separate
// request helpers, each with its own copy; R3-780 touched five FILES and seven SITES.
// "Ten" was neither.
//
// Not folded, deliberately, and the reason is NOT that they are all unalike — that was the
// previous excuse and it was false for three of them:
//
//   · `catalog.ts`, `recents.ts`, `tasks.ts` are pure copies of the shape `ipc.ts` had
//     until R3-780 folded it — same untyped `Error & { code?: string }`, same
//     `res?.code ?? 'unknown'`. They are foldable and nothing here argues otherwise;
//   · `feed.ts`, `netFetch.ts` and `theme.ts` (×3) read `res && 'code' in res`, which
//     THROWS `TypeError: Cannot use 'in' operator` on a string reply. Folding them fixes
//     that, so it is a behaviour change — an improvement, but not an extraction;
//   · `launch.ts` folds `!res.data?.launchId` into the same condition and RETURNS
//     `{ ok: false, code }` instead of throwing. Different control flow entirely.
//
// So the remaining work is two items, not one, and they are not the same size.
//
// `check:clones` cannot help with any of this: minLines 6, minTokens 50, and no identifier
// normalisation, so blocks differing only in type names read as distinct.
//
// ---------------------------------------------------------------------------
// THIS FILE'S OWN TEST IS LOAD-BEARING FOR ALL TWELVE SITES
// ---------------------------------------------------------------------------
//
// Measured: changing the guard to `r.ok !== false` compiles clean AND leaves nine of the
// twelve sites' suites green — `dnd`, `editor`, `ipc`, `mounts` and `vcs` all stub an
// explicit `{ ok: false }`, so they pin "throws on a refusal envelope" and nothing about a
// malformed or absent reply. Only `openExternal`, `openRepository` and
// `protocolRefusal.test.ts` catch it.
//
// Each inline form this replaced carried its own `!res ||` guard, visible at the call site.
// That guarantee now lives here alone. Do not weaken `protocolRefusal.test.ts` on the
// grounds that "the consumers cover it" — they do not, and twelve near-duplicate malformed
// -reply tests would be the duplication this extraction exists to remove.
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
// nothing looks. Two shipped handlers do this today (site-main; audited round 2):
//
//   `handleOpenRepository`  returns `invalid`, `no-activation`
//   `handleOpenLink`        returns `invalid`, `no-activation`, **`declined`**
//
// `declined` is the user pressing "no" on the host's confirmation dialog, and
// `openExternal()` reports that to the app as a successful open. Driven against the built
// SDK with each reply shape:
//
//     thrown    -> threw, code=no-activation
//     returned  -> RESOLVED (the app believes the tab opened)
//
// That is a live defect in site-main's handlers, not here — the envelope is the contract
// and this reads the contract. Filed as R3-778. It is written down here because this is
// the file a host author will be pointed at when they ask what shape to reply with, and
// the answer is: **throw `spaceError`; never return `{ok:false}`.**
//
// Deliberately NOT done: sniffing `res.data?.ok === false` as a second refusal shape. On a
// SUCCESS, `data` is whatever the handler returned — so a handler whose legitimate payload
// happens to carry `ok: false` would be turned into a refusal. It would bless the broken
// shape and create a second contract where the spec names one.

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
 *
 * `code` and `message` must be STRINGS to be used. The five call sites this replaced
 * tested for PRESENCE (`'code' in res`, `res?.message ?? …`), so a host sending
 * `code: 42` surfaced `err.code === 42` on a field the type declares `string`, and
 * `message: 42` became the string `"42"`. Both now fall back. That is a deliberate
 * tightening, pinned by tests, not an accident of the rewrite.
 *
 * It is an ASSERTION function, not a `void` one, because the inline form it replaced
 * narrowed `res` as a side effect of its `if`/`throw`: `secrets.ts` and `mounts.ts` read
 * `res.data` on the next line and stopped compiling without it. A caller that only needs
 * the throw can ignore the narrowing; one that reads the payload gets it for free. (TS
 * requires the call target to be an explicitly-typed declared name — this is why it is a
 * `function` declaration and not an arrow const.)
 */
export function throwOnRefusal(res: unknown, fallbackMessage: string): asserts res is { ok: true; data?: unknown } {
  const r = res as { ok?: unknown; code?: unknown; message?: unknown } | null | undefined;
  if (r && r.ok === true) return;
  const err = new Error(typeof r?.message === 'string' ? r.message : fallbackMessage) as CodedRefusalError;
  err.code = typeof r?.code === 'string' ? r.code : 'unknown';
  throw err;
}
