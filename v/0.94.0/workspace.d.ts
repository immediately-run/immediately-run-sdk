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
interface Workspace {
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
/** Returns the current workspace, or `null` outside an editing session. */
declare const getWorkspace: () => Workspace | null;
/**
 * Subscribe to workspace changes. The listener is invoked immediately with the
 * current value, then again on every change. Returns an unsubscribe fn.
 */
declare const onWorkspaceChange: (listener: (workspace: Workspace | null) => void) => (() => void);
/** React hook returning the current workspace, re-rendering on change. */
declare const useWorkspace: () => Workspace | null;

export { type Workspace, getWorkspace, onWorkspaceChange, useWorkspace };
