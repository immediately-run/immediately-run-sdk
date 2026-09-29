/** The spaces mode's four top-level activities. */
type SpacesActivity = 'spaces' | 'inbox' | 'people' | 'settings';
/**
 * Where the user is inside the spaces mode, as the host parsed it.
 *
 * `spaceId` is `null` on a route that names no space, which is TWO routes, not one: the
 * launcher (`activity: 'spaces'`) and the **cross-space inbox** (`activity: 'inbox'` —
 * `/spaces/-/inbox`, every room across every space). Branch on the pair, not on `spaceId`
 * alone.
 *
 * The `-` in that URL is the host's reserved segment and never reaches here: it is not an
 * id, and an app must not send `spaceId: '-'` hoping to mean "all spaces" — say
 * `{ spaceId: null, activity: 'inbox' }`. The host spells the URL (`SPACES_BRIEF` §7); the
 * SDK never sees that grammar.
 *
 * The optional fields are the per-activity tail: `path` a bundle-relative file, `roomId` a
 * conversation, `member` the uid of `/spaces/<id>/people/<uid>`, `section` a settings pane.
 */
interface SpacesRoute {
    spaceId: string | null;
    activity: SpacesActivity;
    path?: string;
    roomId?: string;
    member?: string;
    section?: string;
}
/**
 * The selected space, as the host resolved it for THIS frame.
 *
 * `root` is the path the host mounted the space at in this frame, at the reader's role —
 * or `null` in every frame the host did not mount it into. Read files under `root`; never
 * assume a mount path.
 *
 * `name` is untrusted display text supplied by whoever named the space. React escapes it
 * on render and the SDK does not sanitise it — treat it as content, not markup.
 *
 * `kind` (not `mode`) matches site-main's `SpaceKind`: one noun for the personal/shared
 * axis (R-IX-6).
 *
 * **None of this is a grant.** The object describes what the host chose to tell this
 * frame; it confers nothing. `role` is a label for deciding which affordances to *show* —
 * it is not permission to act, and an app that branches on `role === 'owner'` to skip
 * asking has only skipped its own UI, not the check. What IS enforced host-side is the
 * mount: `root` is mounted at the reader's role, so a reader's frame cannot write through
 * it (`site-main` `filesystem/liveRevocation.ts` derives the mount mode from the role, and
 * `editor/spaceHandler.ts` re-checks `role` on the owner-only paths).
 *
 * What is NOT enforced, and must not be read into the above: per-APP authority.
 * `UI_AS_APPS_SPEC` §8's audited gap is explicit that `mount` "accepts an arbitrary
 * `spaceId` and enforces only user membership … every app currently inherits the user's
 * full authority". So the host answers "may the USER do this", not "may this app", and a
 * frame holding this object is no more constrained than the reader is. Treat it as a
 * description of the reader's position, never as a sandbox around the app.
 *
 * A frame the host does not push to reads `null` — an absence of information, not a
 * denial, and equally not a reason to assume access.
 */
interface SpacesModeSpace {
    id: string;
    name: string;
    role: 'owner' | 'writer' | 'reader';
    kind: 'personal' | 'shared';
    root: string | null;
}
/** The host's view of this frame: where the user is, and which space that resolves to. */
interface SpacesModeState {
    route: SpacesRoute;
    space: SpacesModeSpace | null;
}
/**
 * Where to move to.
 *
 * Either a route inside the mode, or the one host destination outside it —
 * `{ destination: 'notifications' }`, which the inventory panel's line pointing at pending
 * invitations uses so the app never spells a mode path itself.
 */
type SpacesTarget = SpacesRoute | {
    destination: 'notifications';
};
/** Why the host refused to navigate.
 *
 *  - `invalid` — the target is not a route this host can build. This is also the code for
 *    a space the reader has no membership-granted view of, **deliberately**: P7 forbids an
 *    existence oracle, and `SPACES_BRIEF` §7 says a doclink into a space the reader is not
 *    a member of "renders the same not-found as a link to nothing". A distinct code here
 *    would be exactly the oracle — an app could enumerate spaceIds and read membership off
 *    the difference. Non-member and never-existed are one answer.
 *  - `forbidden` — this frame lacks the CAPABILITY to navigate at all. It is a statement
 *    about the caller, never about the target, so it discloses nothing about what exists.
 *  - `unsupported` — this host has no spaces mode wired.
 *  - `unknown` — the host refused without naming a code.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. These are the
 *  `.code` VALUES the host sends; the union was always a cast and is not enforced at
 *  runtime, so treat an unlisted code as possible and `instanceof Error` as the only
 *  reliable test. */
type NavigateSpacesErrorCode = 'invalid' | 'forbidden' | 'unsupported' | 'unknown';
interface NavigateSpacesError extends Error {
    code: NavigateSpacesErrorCode;
}
/**
 * The host's spaces-mode state for this frame, or `null` when this app is not running in
 * the spaces mode — a standalone tab, `vite dev`, an older host, or a frame the host does
 * not push this to.
 *
 * `null` is a real answer, not a placeholder: fall back to your own UI rather than
 * assuming a route.
 */
declare const getSpacesMode: () => SpacesModeState | null;
/**
 * Subscribe to spaces-mode changes. The listener is invoked immediately with the current
 * value, then on every change. Returns an unsubscribe function.
 */
declare const onSpacesModeChange: (listener: (state: SpacesModeState | null) => void) => (() => void);
/**
 * React hook form of {@link getSpacesMode} — re-renders when the host's route changes.
 *
 * ```tsx
 * const mode = useSpacesMode();
 * if (!mode) return <MyStandaloneUI />;            // not in the spaces mode
 * if (!mode.space) return <Launcher />;            // no space selected
 * if (!mode.space.root) return <NotMountedHere />; // selected, but not mounted into THIS
 * return <Files root={mode.space.root} />;         // never assume a mount path
 * ```
 *
 * The third guard is not defensive padding: `root` is `null` in every frame the host did
 * not mount the space into, which is every frame but the launcher's. Passing it through
 * unchecked is the mistake this example exists to prevent.
 */
declare const useSpacesMode: () => SpacesModeState | null;
/**
 * Ask the host to move the spaces mode to `target`.
 *
 * Resolves once the host has navigated. Rejects with a typed {@link NavigateSpacesError}
 * carrying `code` when the host refuses.
 *
 * The target is always structured coordinates — there is no path-string form, because an
 * app that could spell the destination could open anything. To leave the mode for the one
 * host destination outside it, pass `{ destination: 'notifications' }`.
 *
 * ```ts
 * await navigateSpaces({ spaceId: 'abc', activity: 'spaces', path: 'notes/today.mdx' });
 * await navigateSpaces({ destination: 'notifications' });
 * ```
 */
declare function navigateSpaces(target: SpacesTarget): Promise<void>;

export { type NavigateSpacesError, type NavigateSpacesErrorCode, type SpacesActivity, type SpacesModeSpace, type SpacesModeState, type SpacesRoute, type SpacesTarget, getSpacesMode, navigateSpaces, onSpacesModeChange, useSpacesMode };
