// The spaces mode's route channel and its one navigation verb (R3-708).
//
// The spaces mode runs ONE app across six frames — three activity pairs — and they must
// agree on which space, activity and bundle is selected. A reload or a pasted link has to
// land every frame on the same state, so the selection is a route the HOST owns and
// deep-links to (`SPACES_BRIEF` §3), not something the frames negotiate between
// themselves.
//
// Two halves, and the asymmetry is the point:
//
//   read   `useSpacesMode()` — the host's parsed route, pushed down.
//   write  `navigateSpaces(target)` — a request to MOVE, taking coordinates.
//
// The write half never takes a path string, now or later. An app that could spell the
// destination could open anything (`BUNDLE_EMBEDDING_SPEC` §6.1a), so the SDK offers no
// string overload and the host builds every URL from its own grammar
// (`SPACES_BRIEF` §7, "the host spells the URL"). That is also why an app reads
// `space.root` for its files rather than assuming a mount path.
import { protocolRequest } from './sandboxUtils';
import { throwOnRefusal } from './protocolRefusal';
import { createPushChannel } from './pushChannel';
import { SPACES_MODE, REQUEST_SPACES_MODE, PROTOCOL_SPACES_MODE } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** The spaces mode's four top-level activities. */
export type SpacesActivity = 'spaces' | 'inbox' | 'people' | 'settings';

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
export interface SpacesRoute {
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
export interface SpacesModeSpace {
  id: string;
  name: string;
  role: 'owner' | 'writer' | 'reader';
  kind: 'personal' | 'shared';
  root: string | null;
}

/** The host's view of this frame: where the user is, and which space that resolves to. */
export interface SpacesModeState {
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
export type SpacesTarget = SpacesRoute | { destination: 'notifications' };

/** Why the host refused to navigate.
 *
 *  - `invalid` — the target is not a route this host can build. This is also the code for
 *    a space the reader has no membership-granted view of, **deliberately**: P7 forbids an
 *    existence oracle, and `SPACES_BRIEF` §9 says a doclink into a space the reader is not
 *    a member of "renders the same not-found as a link to nothing". A distinct code here
 *    would be exactly the oracle — an app could enumerate spaceIds and read membership off
 *    the difference. Non-member and never-existed are one answer.
 *  - `forbidden` — this frame lacks the CAPABILITY to navigate at all. It is a statement
 *    about the caller, never about the target, so it discloses nothing about what exists.
 *  - `unsupported` — this host has no spaces mode wired.
 *  - `unknown` — the host refused without naming a code. */
export type NavigateSpacesErrorCode = 'invalid' | 'forbidden' | 'unsupported' | 'unknown';

export interface NavigateSpacesError extends Error {
  code: NavigateSpacesErrorCode;
}

const ACTIVITIES: readonly string[] = ['spaces', 'inbox', 'people', 'settings'];
const ROLES: readonly string[] = ['owner', 'writer', 'reader'];
const KINDS: readonly string[] = ['personal', 'shared'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A present field must be a string; an absent one is fine. Anything else fails. */
const optionalString = (v: unknown): boolean => v === undefined || typeof v === 'string';

const parseRoute = (v: unknown): SpacesRoute | undefined => {
  if (!isRecord(v)) return undefined;
  if (typeof v.activity !== 'string' || !ACTIVITIES.includes(v.activity)) return undefined;
  if (!(v.spaceId === null || typeof v.spaceId === 'string')) return undefined;
  if (!optionalString(v.path) || !optionalString(v.roomId)) return undefined;
  if (!optionalString(v.member) || !optionalString(v.section)) return undefined;
  const route: SpacesRoute = {
    spaceId: v.spaceId as string | null,
    activity: v.activity as SpacesActivity,
  };
  // Copied field by field rather than spread: a host that adds a field tomorrow must not
  // have it silently appear on an object apps treat as this version's shape.
  if (typeof v.path === 'string') route.path = v.path;
  if (typeof v.roomId === 'string') route.roomId = v.roomId;
  if (typeof v.member === 'string') route.member = v.member;
  if (typeof v.section === 'string') route.section = v.section;
  return route;
};

const parseSpace = (v: unknown): SpacesModeSpace | null | undefined => {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return undefined;
  if (typeof v.role !== 'string' || !ROLES.includes(v.role)) return undefined;
  if (typeof v.kind !== 'string' || !KINDS.includes(v.kind)) return undefined;
  if (!(v.root === null || typeof v.root === 'string')) return undefined;
  return {
    id: v.id,
    name: v.name,
    role: v.role as SpacesModeSpace['role'],
    kind: v.kind as SpacesModeSpace['kind'],
    root: v.root as string | null,
  };
};

// Tolerant parse. `undefined` means "ignore this message", so a malformed push from a
// newer or older host leaves the LAST GOOD value standing instead of flipping every frame
// to a route nobody sent. Nothing in here throws: a throw in the listener would take down
// the push loop for every channel sharing it.
const parseState = (state: unknown): SpacesModeState | null | undefined => {
  // A pushed `null` is a RETRACTION, not a malformed message, and the wire says so: the
  // channel's declared value is `SpacesModeState | null` (sandbox-protocol 0.11.0,
  // `snapshots/sdk.json`, `spaces-mode.value`). Folding it into the `isRecord` guard below
  // made it mean "ignore", which left the host with no way to say "this frame has left the
  // mode" — the last route would stand forever, and an app would keep rendering a space it
  // is no longer in. `null` here is distinct from `undefined`: it SETS the value.
  if (state === null) return null;
  if (!isRecord(state)) return undefined;
  const route = parseRoute(state.route);
  if (!route) return undefined;
  const space = parseSpace(state.space);
  if (space === undefined) return undefined;
  return { route, space };
};

// `initial: null` is the whole compatibility story, and it is deliberately NOT a synthetic
// `{ activity: 'spaces' }`: an app must be able to tell "the host has not told me anything"
// from "the host says I am on the launcher". A frame outside the mode, a standalone tab,
// `vite dev`, an older host, or a frame lacking the read capability all stay `null`, and an
// app falls back to its pre-mode UI there.
const channel = createPushChannel<SpacesModeState | null>({
  pushType: SPACES_MODE,
  requestType: REQUEST_SPACES_MODE,
  initial: null,
  // Written inline, reading `msg.state` here rather than inside the helper: the snapshot
  // gate extracts a push channel's `reads` from THIS expression, and a bare function
  // reference tells it nothing — it falls back to the parameter type and the wire shape
  // reads `Record<string, unknown>` instead of `{reads:["state"]}`.
  parse: (msg) => parseState(msg.state),
});

/**
 * The host's spaces-mode state for this frame, or `null` when this app is not running in
 * the spaces mode — a standalone tab, `vite dev`, an older host, or a frame the host does
 * not push this to.
 *
 * `null` is a real answer, not a placeholder: fall back to your own UI rather than
 * assuming a route.
 */
export const getSpacesMode = (): SpacesModeState | null => channel.get();

/**
 * Subscribe to spaces-mode changes. The listener is invoked immediately with the current
 * value, then on every change. Returns an unsubscribe function.
 */
export const onSpacesModeChange = (listener: (state: SpacesModeState | null) => void): (() => void) =>
  channel.onChange(listener);

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
export const useSpacesMode = (): SpacesModeState | null => channel.use();

/** The host's reply ENVELOPE (site-main's `SpaceResult`). A refusal is a RESOLVED
 *  `{ ok: false, code, message }` frame, not a transport-level rejection — see
 *  `protocolRefusal.ts` for which `ok` this is and why a handler must THROW
 *  `spaceError` rather than return `{ ok: false }`. R3-707's `navigate` handler must
 *  throw. */
type NavigateReply = { ok: true; data?: unknown } | { ok: false; code?: string; message?: string };

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
export async function navigateSpaces(target: SpacesTarget): Promise<void> {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_SPACES_MODE], 'navigate', [target])) as NavigateReply;
  throwOnRefusal(res, 'spaces navigation refused');
}
