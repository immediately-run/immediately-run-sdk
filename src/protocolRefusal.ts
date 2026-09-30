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
//   **seventeen CALL SITES across twelve FILES** — `grep -n 'throwOnRefusal(' src/*.ts`,
//   minus the declaration here and minus `*.test.*`:
//
//   dnd.ts · editor.ts · feed.ts · ipc.ts (×2) · mounts.ts (×3) · netFetch.ts ·
//   openExternal.ts · openRepository.ts · secrets.ts · spacesMode.ts · theme.ts (×3) ·
//   vcs.ts
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
//     until R3-780 folded it — untyped `Error & { code?: string }`, `res?.code ??
//     'unknown'`. (`recents.ts` casts `code` as required rather than optional; immaterial,
//     the cast erases.) They are foldable and nothing here argues otherwise;
//   · `feed.ts`, `netFetch.ts` and `theme.ts` (×3) read `res && 'code' in res`, which
//     THREW `TypeError: Cannot use 'in' operator` on a string reply — FOLDED in R3-817
//     (0.74.3), a behaviour change reviewed as its own item, exactly as this bullet
//     prescribed;
//   · `launch.ts` folds `!res.data?.launchId` into the same condition and RETURNS
//     `{ ok: false, code }` instead of throwing. Different control flow entirely.
//
// So the remaining work is two items, not one, and they are not the same size.
//
// `check:clones` cannot help with any of this: minLines 6, minTokens 50, and no identifier
// normalisation, so blocks differing only in type names read as distinct.
//
// ---------------------------------------------------------------------------
// THIS FILE'S OWN TEST IS LOAD-BEARING FOR ALL SEVENTEEN SITES
// ---------------------------------------------------------------------------
//
// Measured: changing the guard to `r.ok !== false` compiles clean and leaves **ten of the
// seventeen SITES** green — seven of the twelve files: `dnd`, `editor`, `ipc`, `mounts`,
// `secrets`, `spacesMode` and `vcs`. Every one of them stubs an explicit `{ ok: false }`,
// so they pin "throws on a refusal envelope" and nothing about a malformed or absent
// reply. The catchers: `openExternal`, `openRepository`, the five R3-817 sites (whose
// string-reply tests reject on a non-envelope — the mutation never throws), plus
// `protocolRefusal.test.ts`. (Re-run 2026-09-30 on the post-fold tree: suites red —
// feed, netFetch, theme, openExternal, openRepository, protocolRefusal; the seven
// families green.)
//
// (An earlier version of this paragraph said "nine of the twelve sites' suites", which
// mixes sites with suites — the exact mistake the census block above is headed about —
// and omitted `secrets` and `spacesMode` from the green list.)
//
// Each inline form this replaced carried its own `!res ||` guard, visible at the call site.
// That guarantee now lives here alone. Do not weaken `protocolRefusal.test.ts` on the
// grounds that "the consumers cover it" — they do not, and seventeen near-duplicate malformed
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
// nothing looks. Two shipped handlers did this until R3-778 closed it (site-main; audited sdk#184 round 2, 2026-09-25; fixed 2026-09-28 — both now throw, and a dispatcher assertion reddens on the shape):
//
//   `handleOpenRepository`  returns `invalid`, `no-activation`
//   `handleOpenLink`        returns `invalid`, `no-activation`, **`declined`**
//
// `declined` is the user pressing "no" on the host's confirmation dialog, and
// `openExternal()` reported that to the app as a successful open, until R3-778 closed it. Driven against the built
// SDK with each reply shape:
//
//     thrown    -> threw, code=no-activation
//     returned  -> RESOLVED (the app believes the tab opened)
//
// That was a live defect in site-main's handlers until R3-778 closed it (2026-09-28), not here — the envelope is the contract
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
 * `code` and `message` must be STRINGS to be used. Seventeen sites call this;
 * **sixteen** had an inline copy it replaced (`spacesMode.ts` was written against the
 * helper in R3-708 and replaced nothing). All sixteen tested for PRESENCE, in **three**
 * shapes:
 *
 * - **seven** cast the value: `(res?.code as SomeError['code']) ?? 'unknown'` —
 *   `dnd`, `editor`, `vcs`, `mounts` (×3), `secrets`;
 * - **seven** used the `in` operator — `openExternal`, `openRepository` (with the cast;
 *   folded in R3-708) and `feed`, `netFetch`, `theme` ×3 (without it; folded in R3-817,
 *   the TypeError fix disclosed above);
 * - **two** used a bare `res?.code ?? 'unknown'` onto `Error & { code?: string }` —
 *   `ipc.ts`.
 *
 * Every one of them let a host sending `code: 42` surface `err.code === 42` on a field
 * declared `string`, and turned `message: 42` into the string `"42"`. Both now fall back,
 * to `'unknown'` and `fallbackMessage`. A deliberate tightening, pinned by
 * `protocolRefusal.test.ts` — and since this package ships no changelog, this paragraph is
 * where a consumer learns of it.
 *
 * The `ipc.ts` pair changed one more thing: their anonymous type declared `code` OPTIONAL
 * and `CodedRefusalError` requires it. No runtime difference for a missing code — the old
 * code assigned `'unknown'` exactly when the new one does (a non-string `code` falls back
 * too, as the paragraph above discloses) — but a consumer narrowing on `'code' in err`
 * can stop.
 *
 * Folding the two `in`-operator sites also removed a latent `TypeError`: `'code' in res`
 * throws on a string reply.
 *
 * ONE revision of this paragraph got that backwards, and this is the fourth attempt to
 * describe it accurately. The original text was right FOR ITS REFERENT — it named
 * `'code' in res` as a shape replaced, without saying which sites, and at the time the
 * sites it referred to were R3-708's four, two of which used that form. R3-780 then folded
 * five DIFFERENT files and inherited the sentence unchanged, so it became false in place
 * without anyone editing it. That silent shift is the likeliest reason the next revision
 * "corrected" it to say NO replaced site used it — which is false the other way:
 * `openExternal` and `openRepository` did.
 *
 * The mechanism is worth more than the correction, because it is repeatable. `'code' in
 * res` is **gone from `main`** since R3-817 (0.74.3) folded the last five — a reviewer who
 * greps `main` finds nothing, and this paragraph is the record of where it lived and why
 * it misread twice before. What a grep of `main` cannot show is that the
 * form was ALSO at two sites R3-708 folded. The tree that answers the question is the one
 * before the fold, `d4b07cc1^`. Read that before rewriting this paragraph again.
 *
 * It is an ASSERTION function, not a `void` one, because the inline form it replaced
 * narrowed `res` as a side effect of its `if`/`throw`: `secrets.ts` and `mounts.ts` read
 * `res.data` on the next line and stopped compiling without it. A caller that only needs
 * the throw can ignore the narrowing; one that reads the payload gets it for free. (TS
 * requires the call target to be an explicitly-typed declared name — this is why it is a
 * `function` declaration and not an arrow const.)
 *
 * R3-817 (0.74.3): the five remaining inline copies (`feed.ts`, `netFetch.ts`,
 * `theme.ts` ×3) folded onto this — removing a latent defect with them: their
 * `res && 'code' in res` guard threw `TypeError: Cannot use 'in' operator` on a
 * bare-STRING reply (a proxy error page, a relay), escaping past every `err.code`
 * branch an app wrote. This function reads `typeof r?.code === 'string'` and
 * cannot throw on any input; the TypeError path no longer exists.
 */
export function throwOnRefusal(res: unknown, fallbackMessage: string): asserts res is { ok: true; data?: unknown } {
  const r = res as { ok?: unknown; code?: unknown; message?: unknown } | null | undefined;
  if (r && r.ok === true) return;
  const err = new Error(typeof r?.message === 'string' ? r.message : fallbackMessage) as CodedRefusalError;
  err.code = typeof r?.code === 'string' ? r.code : 'unknown';
  throw err;
}
