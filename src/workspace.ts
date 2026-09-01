import { createPushChannel } from './pushChannel';
import { WORKSPACE, REQUEST_WORKSPACE } from './generated/protocol';

/**
 * Which project the immediately.run workbench currently has open — the repository
 * the user is editing, not your app's own repository. `null` when your app is not
 * running inside an editing session at all (a standalone full-tab route, a task
 * overlay): that is a real answer, not a failure, and code here must handle it.
 *
 * ⚠ **`namespace` is not necessarily a GitHub owner.** A `local` session is
 * well-formed but not GitHub-shaped — `/edit/local/my-app-3fa9c2d1/my-app/live`
 * reads back as `{ provider: 'local', namespace: 'my-app-3fa9c2d1', repository:
 * 'my-app', ref: 'live' }`. Branch on `provider` before rendering a GitHub URL.
 *
 * Baseline capability `workspace:read` — every app may read it. It discloses
 * nothing that is not already in the session URL your app can read from
 * {@link onUrlChange} when it drives the host route; this channel exists for the
 * apps that *don't* — a self-routed panel keeps its own route, never receives
 * `urlchange`, and would otherwise have no way to learn which project it is in.
 *
 * There is deliberately no counterpart that lets an app *change* the workspace:
 * navigating the workbench stays a host action under the ordinary consent.
 *
 * ```ts
 * import { useWorkspace } from '@immediately-run/sdk';
 *
 * const workspace = useWorkspace();
 * // Scope your app's stored data to the project it belongs to.
 * const scope = workspace?.label ?? null;
 * ```
 */
export interface Workspace {
  /** Loader provider — `'github'`, `'local'`, … Branch on this, never assume. */
  provider: string;
  /** Owner/namespace segment. See the warning above: NOT always a GitHub owner. */
  namespace: string;
  /** Repository/project segment. */
  repository: string;
  /** The branch, tag, or ref-shaped segment of the session. */
  ref: string;
  /**
   * The session's display identity, `` `${namespace}/${repository}` `` — e.g.
   * `neumark-family/recipes`.
   *
   * This is the string to key durable per-project data on. It is the SAME value the
   * host labels the working-tree mount with, so an app that already scopes by that
   * mount's label needs no migration to move onto this channel.
   */
  label: string;
}

/**
 * Assumed before the host reports — and the value that stands forever on a host too
 * old to push this channel. `null` means "no project here", which is also the honest
 * answer outside an editing session, so an app written against it degrades to
 * unscoped rather than to wrong.
 */
const DEFAULT_WORKSPACE: Workspace | null = null;

const isWorkspace = (v: unknown): v is Workspace => {
  const w = v as Partial<Workspace> | null;
  return (
    !!w &&
    typeof w === 'object' &&
    typeof w.provider === 'string' &&
    typeof w.namespace === 'string' &&
    typeof w.repository === 'string' &&
    typeof w.ref === 'string' &&
    typeof w.label === 'string'
  );
};

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `workspace` and
// answers `request-workspace` (wire format: site-main channelBridge.ts).
//
// `parse` must distinguish the host SAYING `null` from a message it cannot read.
// `undefined` means "not a value for this channel" (createPushChannel ignores it and
// keeps the last known workspace), while `null` is the host reporting "no session"
// and MUST land — otherwise a frame that navigates out of a session would keep
// reporting the project it used to be in.
//
// It REBUILDS the value field by field rather than passing the host's object through.
// This channel is baseline-readable by every app, so "it carries only the session's
// coordinates" has to be a property of this code, not of the host's good manners: a
// host that pushed a token or a user id alongside them would otherwise get it into
// app-visible memory by reference.
const channel = createPushChannel<Workspace | null>({
  pushType: WORKSPACE,
  requestType: REQUEST_WORKSPACE,
  initial: DEFAULT_WORKSPACE,
  parse: (msg) => {
    if (msg.workspace === null) return null;
    if (!isWorkspace(msg.workspace)) return undefined;
    const { provider, namespace, repository, ref, label } = msg.workspace;
    return { provider, namespace, repository, ref, label };
  },
});

/** Returns the current workspace, or `null` outside an editing session. */
export const getWorkspace = (): Workspace | null => channel.get();

/**
 * Subscribe to workspace changes. The listener is invoked immediately with the
 * current value, then again on every change. Returns an unsubscribe fn.
 */
export const onWorkspaceChange = (listener: (workspace: Workspace | null) => void): (() => void) =>
  channel.onChange(listener);

/** React hook returning the current workspace, re-rendering on change. */
export const useWorkspace = (): Workspace | null => channel.use();
