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
 * `code` and `message` must be STRINGS to be used. Twelve sites call this; **eleven** had
 * an inline copy it replaced (`spacesMode.ts` was written against the helper in R3-708 and
 * replaced nothing). All eleven tested for PRESENCE, in **three** shapes:
 *
 * - **seven** cast the value: `(res?.code as SomeError['code']) ?? 'unknown'` —
 *   `dnd`, `editor`, `vcs`, `mounts` (×3), `secrets`;
 * - **two** used the `in` operator: `((res && 'code' in res ? res.code : undefined) as
 *   Code) ?? 'unknown'` — `openExternal`, `openRepository`, both folded in R3-708;
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
 * throws on a string reply. Two revisions of this paragraph got that backwards — first
 * claiming the `in` form was among the shapes replaced without saying which sites, then
 * "correcting" that to say NO replaced site used it. It was two of them. Both errors came
 * from reading `main`, where R3-708 had already erased the form, instead of the tree before
 * it (`d4b07cc1^`).
 *
 * It is an ASSERTION function, not a `void` one, because the inline form it replaced
 * narrowed `res` as a side effect of its `if`/`throw`: `secrets.ts` and `mounts.ts` read
 * `res.data` on the next line and stopped compiling without it. A caller that only needs
 * the throw can ignore the narrowing; one that reads the payload gets it for free. (TS
 * requires the call target to be an explicitly-typed declared name — this is why it is a
 * `function` declaration and not an arrow const.)
 */
declare function throwOnRefusal(res: unknown, fallbackMessage: string): asserts res is {
    ok: true;
    data?: unknown;
};

export { type CodedRefusalError, throwOnRefusal };
