// The one place the SDK turns a host reply envelope into a typed, coded rejection (R6).
//
// ---------------------------------------------------------------------------
// THE CENSUS — counted wrong twice, so here is how to re-derive it
// ---------------------------------------------------------------------------
//
// Review round 1 found three copies of this block and this file said "three". Round 2
// found five. Round 3 counted the grep and found the TYPED family is **ten**, across
// eight files — `mounts.ts` alone has three separate request helpers, each with its own
// copy, which round 2 read as one helper reached from three call sites.
//
// All ten now call this:
//
//   openExternal.ts · openRepository.ts · spacesMode.ts · secrets.ts
//   mounts.ts (×3) · editor.ts · vcs.ts · dnd.ts · ipc.ts (×2)
//
// Five landed in R3-708, which is where this file came from. The other five — `mounts.ts`'s
// `settingsRequest` and `localStoreRequest`, `editor.ts`, `vcs.ts`, `dnd.ts` and `ipc.ts` —
// were folded there too, then SPLIT BACK OUT because they landed after that PR's last
// review round and nothing had looked at them. This is that split: R3-780.
//
// Not folded at all, deliberately: the UNTYPED family — `catalog.ts`, `feed.ts`,
// `netFetch.ts`, `recents.ts`, `tasks.ts`, `theme.ts` (three sites) and `launch.ts`. They
// are not alike: `launch.ts` folds an extra `!res.data?.launchId` into the same condition,
// and the rest build their errors differently. Folding them is a behaviour change, not an
// extraction.
//
// **Do not trust any list above; re-derive it.** `grep -n 'ok !== true' src/ | grep -v
// '\.test\.'` is the whole population, and both miscounts came from reading files instead
// of counting the grep. `check:clones` cannot help: minLines 6, minTokens 50, and no
// identifier normalisation, so blocks differing only in type names read as distinct.
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
