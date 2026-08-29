// Task invocation — apps invoking apps (UI_AS_APPS_SPEC §5.7). The
// `startActivityForResult` pattern: one app invokes another by TASK CONTRACT
// (never by app name — the user's override picks the bound app), passes typed
// params, and awaits a typed result. The callee runs in a host-owned overlay
// under ITS OWN grants — data crosses, your authority does not (§5.7).
//
// Two roles:
//  - CALLER: `invokeTask(task, params)` (Recipe B — a deferred reply the host
//    holds open until the callee finishes). Delegate a file with `capFile(...)`:
//    the host resolves it against YOUR grants and mints an attenuated chroot.
//  - CALLEE: read `useTaskInput()`, then `completeTask(result)` / `cancelTask()`.
//
// OFF-HOST (plain `vite dev`, node/jsdom tests — no sandbox, no host transport):
// importing this module is always safe (R3-421 — no subpath may throw at import
// time), and the surface degrades instead of crashing: `getTaskInput()` /
// `useTaskInput()` stay `null` forever (you are never a task callee without a
// host), `completeTask` / `cancelTask` are no-ops, and `invokeTask` rejects with
// a "no host transport" error. Under the @immediately-run/dev-fs substrate the
// transport resolves but no task ever arrives — same observable behaviour.
// The no-op is scoped to the ABSENCE of a host: when there IS one, a failed send
// throws instead of leaving the caller to hang out its deadline.
import { useEffect, useState } from 'react';
import { protocolRequest, sendMessage, addListener } from './sandboxUtils';
import { transport } from './hostTransport';
import { PROTOCOL_TASK, TASK_CANCEL, TASK_COMPLETE, TASK_INPUT } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

// ── caller side ─────────────────────────────────────────────────────────────

/** A delegated FILE capability marker for a task param (§5.7). */
export interface FileCap {
  $cap: 'file';
  mountId: string;
  relPath: string;
  mode: 'ro' | 'rw';
}

/**
 * Build a delegated file reference for a task param. The host resolves it against
 * YOUR OWN grants and mints an attenuated, task-scoped chroot for the callee — you
 * can only delegate a path you already hold (attenuation only, never escalation).
 *
 *   file: capFile({ mountId: 'space:abc', relPath: 'photos/cat.jpg' }, { mode: 'rw' })
 */
export const capFile = (ref: { mountId: string; relPath: string }, opts: { mode: 'ro' | 'rw' }): FileCap => ({
  $cap: 'file',
  mountId: ref.mountId,
  relPath: ref.relPath,
  mode: opts.mode,
});

/** A delegated DIRECTORY capability marker for a task param (D2). Like {@link FileCap}
 *  but `relPath` names a DIRECTORY: the host chroots the callee AT that directory
 *  (the whole subtree). Used for the `pick-file` `roots` — one chroot per root. */
export interface DirCap {
  $cap: 'dir';
  mountId: string;
  relPath: string;
  mode: 'ro' | 'rw';
}

/**
 * Build a delegated DIRECTORY reference for a task param (the directory analogue of
 * {@link capFile}). The host resolves it against YOUR OWN grants and mints an
 * attenuated, task-scoped chroot of that directory for the callee — you can only
 * delegate a directory you already hold (attenuation only, never escalation):
 *
 *   roots: [capDir({ mountId: 'space:abc', relPath: 'boards' }, { mode: 'rw' })]
 */
export const capDir = (ref: { mountId: string; relPath: string }, opts: { mode: 'ro' | 'rw' }): DirCap => ({
  $cap: 'dir',
  mountId: ref.mountId,
  relPath: ref.relPath,
  mode: opts.mode,
});

/**
 * Invoke another app via a task contract and await its typed result (Recipe B).
 * Rejects with a machine `.code` on refusal: `cancelled` (user dismissed the
 * overlay), `timeout` (§5.7.1 liveness), `forbidden` (missing `task:invoke`, or a
 * file delegation you don't hold), `not-declared` (the task is missing from your
 * `immediately.run.invokes`), `no-such-task` (no app is bound to that contract),
 * `task-cycle`/`task-depth-exceeded`/`task-version-mismatch`, or `invalid-params`
 * (result failed the contract schema). **Read `err.message`** — since R3-418 the host
 * says which capability, which declaration or which param was at fault; the code alone
 * does not distinguish them.
 *
 * Two things must BOTH be true before any invoke is admitted, and they are separate:
 *  1. your `package.json` `immediately.run.invokes` lists the task (else `not-declared`);
 *  2. your app holds the `task:invoke` capability — declare it in
 *     `immediately.run.capabilities` so the user can grant it (else `forbidden`).
 * Declaring the invoke does not imply the capability.
 *
 * ── `pick-file`: `roots` is required (SPACES_UI_SPEC §4.1) ───────────────────
 * ```ts
 * const mount = await requestMount();                    // the user picks a space
 * const { root, path } = await invokeTask('pick-file', {
 *   roots: [capDir({ mountId: mount.id, relPath: 'boards' }, { mode: 'ro' })],
 * });
 * ```
 * - `roots` is a NON-EMPTY `DirCap[]` of directories you **already hold**. The result
 *   names its target as `{ root, path }` where `root` INDEXES `params.roots`, so
 *   `invokeTask('pick-file', {})` can never produce a valid result and is rejected.
 *   There is no rootless "pick from any of my spaces" mode by design: enumerating the
 *   user's spaces is the host's powerbox (`requestMount()`), and composing the two —
 *   as above — is that flow. See SPACES_UI_SPEC R-SPACES-5/R-SPACES-12.
 * - Each `capDir` is attenuated against your own grant. **`{ mode: 'rw' }` over a space
 *   the user granted `ro` is refused `forbidden`** — the commonest failure, because the
 *   mount *was* granted and the path *is* inside it. Pass the mode you actually hold;
 *   `ro` is right for a plain pick.
 * - The `requestMount()` grant is DURABLE and survives a cancelled pick: the user
 *   consented to the mount in host chrome, separately from the pick (SPACES_UI_SPEC §4.1).
 *   Reuse it for later picks rather than re-requesting.
 *
 * Off-host (plain `vite dev` — no host transport) it rejects with a plain
 * "no host transport" error: there is no host to resolve the task binding.
 */
export const invokeTask = async <R = unknown>(task: string, params: Record<string, unknown> = {}): Promise<R> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_TASK], 'invoke', [{ task, params }])) as
    | { ok: true; data: R }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `task '${task}' failed`) as Error & { code?: string };
    err.code = res?.code ?? 'unknown';
    throw err;
  }
  return res.data;
};

// ── the host-provided CAPTURE contracts (R3-425) ────────────────────────────

/** Bytes captured by the host, as `capturePhoto()` / `captureAudio()` return them.
 *  `bytes` is a transferable `ArrayBuffer` — write it to a space, decode it, upload
 *  it. You never receive a `MediaStream` or a `MediaStreamTrack`, and that is not an
 *  omission: a track cannot be transferred into an app frame at all
 *  (`DataCloneError`), and the frame's opaque origin cannot open a device itself
 *  (`getUserMedia` throws `SecurityError: Invalid security origin`). */
export interface CaptureResult {
  bytes: ArrayBuffer;
  /** e.g. `image/jpeg`, `audio/webm`. Chosen by the HOST, not by you. */
  mimeType: string;
  /** How long the device was open, in ms. */
  durationMs: number;
}

/** Optional hints for a capture. They deliberately name NOTHING — no device id, no
 *  camera index — because the host chooses everything about how the capture is
 *  performed. That is what lets the grant be a plain on/off instead of a per-call
 *  target list the way `net:fetch` needs. */
export interface CaptureOptions {
  /** Which way the camera should face, if the device has a choice. A HINT: the host
   *  may ignore it. Ignored for audio. */
  facing?: 'user' | 'environment';
}

/**
 * Take one photo, or record one audio clip, through the HOST's capture UI
 * (`BROWSER_CAPABILITIES_SPEC` §3 grade 1).
 *
 * The host opens the device at its own origin, draws the viewfinder, and hands you
 * the bytes when the user presses Done. **You are never in the loop while the device
 * is live** — that is the point of the design, not a limitation of it:
 *
 * - The capture UI is drawn by the host, so a user can trust it the way they trust
 *   the sign-in dialog. Do not build a lookalike; imitating host chrome is spoofing.
 * - While the device is open the host shows a persistent "camera on" / "microphone
 *   on" indicator in its own chrome, for the whole session. You cannot hide it and
 *   should not try to.
 * - If the user cancels, this rejects `cancelled` and **nothing was recorded**. There
 *   is no partial result — do not write error handling that hopes for one.
 *
 * ```ts
 * import { capturePhoto } from '@immediately-run/sdk';
 *
 * try {
 *   const { bytes, mimeType } = await capturePhoto({ facing: 'environment' });
 *   await writeFile('photos/latest.jpg', new Uint8Array(bytes));
 * } catch (e) {
 *   if ((e as { code?: string }).code === 'cancelled') return; // the user said no
 *   throw e;
 * }
 * ```
 *
 * Two things must BOTH be true, exactly as for any other task:
 *  1. `immediately.run.invokes` lists `capture-photo` (or `capture-audio`);
 *  2. your app holds `task:invoke` **and** `device:camera` (or `device:microphone`)
 *     — declare them in `immediately.run.capabilities` so the user can grant them.
 *
 * Rejects with `.code`: `cancelled` (the user dismissed the capture — nothing was
 * recorded), `forbidden` (you lack the capability; `message: 'browser-denied'` means
 * the BROWSER refused immediately.run itself, which your consent cannot fix),
 * `unavailable` (no such device on this machine, or it would not start),
 * `unsupported` (this host cannot capture), `not-declared`, `timeout`.
 *
 * *Zero-platform alternative, still worth knowing:* `<input type="file"
 * accept="image/*" capture="environment">` opens the OS camera from inside the
 * sandbox (file choosers are not permission-gated). It needs no capability and no
 * host support; it also gives you no indicator and no host-drawn surface.
 */
export const capturePhoto = (options: CaptureOptions = {}): Promise<CaptureResult> =>
  invokeTask<CaptureResult>('capture-photo', { ...options });

/** Record one audio clip through the host's capture UI. See {@link capturePhoto} —
 *  every rule there applies verbatim, with `device:microphone` and `capture-audio`. */
export const captureAudio = (options: CaptureOptions = {}): Promise<CaptureResult> =>
  invokeTask<CaptureResult>('capture-audio', { ...options });

// ── callee side ─────────────────────────────────────────────────────────────

/** The params this app was invoked with as a task callee. */
export interface TaskInput {
  task: string;
  params: Record<string, unknown>;
}

let latestInput: TaskInput | null = null;
const inputListeners = new Set<(i: TaskInput) => void>();
let inputListenerRegistered = false;

// Register the `task-input` listener IF a host transport is reachable; otherwise do
// nothing (and let the next call retry — the same pattern as pushChannel's `start`).
// Split out so both the module-eval attempt below and the first-use call sites share
// one idempotent path.
const ensureInputListener = (): void => {
  if (inputListenerRegistered) return;
  try {
    addListener(TASK_INPUT, (m: { task: string; params?: Record<string, unknown> }) => {
      latestInput = { task: m.task, params: m.params ?? {} };
      inputListeners.forEach((l) => l(latestInput!));
    });
  } catch {
    return; // off-host: the transport resolver threw — no host to listen on
  }
  inputListenerRegistered = true;
};

// The host delivers a `task-input` message to the callee's iframe right after it
// mounts the overlay (the §5.7 "params via the region's mount event"). That wire
// message is a plain one-shot host→app message with NO replay/poll counterpart —
// the contract (`@immediately-run/sandbox-protocol/sdk`) marks replayable state as
// "push … polled with request-*" (mounts, theme, auth-state, …) and `task-input`
// is not one of them — so a listener registered only on first use could miss an
// input delivered between module evaluation and the app's first render. Hence:
// register EAGERLY when a host transport is already present at module eval
// (on-host, byte-for-byte the pre-R3-421 behaviour), and lazily-on-first-use
// otherwise, so importing this module off-host (plain `vite dev`) never throws.
ensureInputListener();

/** The task params this app was invoked with, or null if it isn't a task callee.
 *  Off-host (plain `vite dev`) this is always `null` — there is no host to invoke
 *  this app as a callee. */
export const getTaskInput = (): TaskInput | null => {
  ensureInputListener();
  return latestInput;
};

/**
 * Is a host transport reachable from this realm at all?
 *
 * The R3-421 off-host no-op below must mean EXACTLY "there is nobody to answer" —
 * plain `vite dev`, node, jsdom. A blanket try/catch around the send meant it also
 * swallowed a genuine failure against a REAL host (`DataCloneError` because the
 * result holds a DOM node, a function or a live class instance, being the usual
 * one): the host was then never told the task finished, and the caller's
 * `invokeTask` hung to its deadline with no diagnostic anywhere. Absence is
 * therefore decided BEFORE the send, and the send itself is left to throw.
 */
const hostReachable = (): boolean => {
  try {
    transport();
    return true;
  } catch {
    return false; // no injected bundler bus and no §4 discovery global — off-host
  }
};

/**
 * Finish the task, returning a result to the caller. The host validates it against
 * the contract's result schema before resolving the caller (`invalid-params` on
 * violation), then tears down this overlay.
 *
 * `result` must be STRUCTURED-CLONEABLE — it crosses a frame boundary. A DOM node, a
 * function, a class instance with methods, a `MediaStreamTrack`: all `DataCloneError`.
 * **That throws**, deliberately and loudly: the alternative is a caller left hanging to
 * its `invokeTask` deadline while this app believes it answered.
 *
 * Off-host (plain `vite dev` — no host transport) this is a no-op: there is no caller
 * to answer. That case, and only that case, is silent.
 */
export const completeTask = (result: unknown): void => {
  if (!hostReachable()) return; // off-host: no caller to answer — documented no-op
  // On-host, a failure here is REAL and the caller is waiting on this exact message.
  sendMessage(TASK_COMPLETE, { result });
};

/** Abort the task; the caller's `invokeTask` rejects with `cancelled`.
 *  Off-host (plain `vite dev` — no host transport) this is a no-op; on-host a failed
 *  send throws rather than leaving the caller waiting, exactly as {@link completeTask}. */
export const cancelTask = (): void => {
  if (!hostReachable()) return; // off-host: no caller to answer — documented no-op
  sendMessage(TASK_CANCEL, {});
};

/** React hook: the task input for this callee, re-rendering when it arrives.
 *  Off-host (plain `vite dev`) it stays `null` forever — render the non-callee
 *  state rather than waiting on it. */
export const useTaskInput = (): TaskInput | null => {
  const [input, setInput] = useState<TaskInput | null>(getTaskInput);
  useEffect(() => {
    const l = (i: TaskInput) => setInput(i);
    inputListeners.add(l);
    if (latestInput) setInput(latestInput);
    return () => {
      inputListeners.delete(l);
    };
  }, []);
  return input;
};
