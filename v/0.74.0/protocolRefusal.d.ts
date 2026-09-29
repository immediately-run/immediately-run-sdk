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
declare function throwOnRefusal(res: unknown, fallbackMessage: string): asserts res is {
    ok: true;
    data?: unknown;
};

export { type CodedRefusalError, throwOnRefusal };
