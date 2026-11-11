/**
 * Pure predicate behind {@link findMount} / {@link waitForMount}: does `mount`
 * satisfy every field present on `query`? An absent query field matches anything;
 * a present one must equal the mount's value. Kept framework-free and free of the
 * injected sandbox runtime so it is unit-testable in isolation (ways_of_working
 * §5 — separate pure logic from the effectful service).
 *
 * `name` (the human-readable mount label, R3-69) is matchable alongside the
 * `type`/`id`/`path` coordinates so an app/agent can locate a mount by the name a
 * user would recognise — e.g. `findMount({ name: 'Design notes' })` — rather than
 * an opaque `/mnt/{hash}` address or a non-unique space name guessed by hand.
 */
interface MountMatchFields {
    type?: string;
    id?: string;
    path?: string;
    name?: string;
}
declare const mountMatches: (mount: MountMatchFields, query: MountMatchFields) => boolean;

export { type MountMatchFields, mountMatches };
