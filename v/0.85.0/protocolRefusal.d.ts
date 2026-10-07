/** An error carrying a stable, host-supplied `code` the app can branch on. */
interface CodedRefusalError<C extends string = string> extends Error {
    code: C;
}
/**
 * Throw a typed, coded error unless the host's reply envelope says the call succeeded.
 *
 * `fallbackMessage` is used when the host refused without a message, and `'unknown'` is
 * the code when it refused without one — a refusal is never reported as a success just
 * because it arrived under-specified.
 *
 * `code` and `message` must be STRINGS to be used. Eighteen sites call this;
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
declare function throwOnRefusal(res: unknown, fallbackMessage: string): asserts res is {
    ok: true;
    data?: unknown;
};

export { type CodedRefusalError, throwOnRefusal };
