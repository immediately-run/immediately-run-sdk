/** A delegated FILE capability marker for a task param (§5.7). */
interface FileCap {
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
declare const capFile: (ref: {
    mountId: string;
    relPath: string;
}, opts: {
    mode: "ro" | "rw";
}) => FileCap;
/** A delegated DIRECTORY capability marker for a task param (D2). Like {@link FileCap}
 *  but `relPath` names a DIRECTORY: the host chroots the callee AT that directory
 *  (the whole subtree). Used for the `pick-file` `roots` — one chroot per root. */
interface DirCap {
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
declare const capDir: (ref: {
    mountId: string;
    relPath: string;
}, opts: {
    mode: "ro" | "rw";
}) => DirCap;
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
 * import { invokeTask, capDir, requestMount } from '@immediately-run/sdk';
 *
 * const mount = await requestMount();                    // the user picks a space
 * // `invokeTask` returns `unknown` — name the result type, or the destructuring
 * // below does not compile.
 * const { root, path } = await invokeTask<{ root: number; path: string }>('pick-file', {
 *   // `SandboxMount.id` is optional (absent on the primary repo mount) — fall back to
 *   // `path`, which is always present and is what the host resolves against.
 *   roots: [capDir({ mountId: mount.id ?? mount.path, relPath: 'boards' }, { mode: 'ro' })],
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
declare const invokeTask: <R = unknown>(task: string, params?: Record<string, unknown>) => Promise<R>;
/** Bytes captured by the host, as `capturePhoto()` / `captureAudio()` return them.
 *  `bytes` is a transferable `ArrayBuffer` — write it to a space, decode it, upload
 *  it. You never receive a `MediaStream` or a `MediaStreamTrack`, and that is not an
 *  omission: a track cannot be transferred into an app frame at all
 *  (`DataCloneError`), and the frame's opaque origin cannot open a device itself
 *  (`getUserMedia` throws `SecurityError: Invalid security origin`). */
interface CaptureResult {
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
interface CaptureOptions {
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
 * import { capturePhoto, requestMount, openFs } from '@immediately-run/sdk';
 *
 * try {
 *   const { bytes, mimeType } = await capturePhoto({ facing: 'environment' });
 *   const mount = await requestMount();          // the user picks a space to save into
 *   const fs = openFs(mount);                    // writeFile is a METHOD on the MountFs
 *   await fs.mkdir('photos', { recursive: true }); // writeFile does not create parents
 *   await fs.writeFile(`photos/latest.${mimeType === 'image/png' ? 'png' : 'jpg'}`, new Uint8Array(bytes));
 * } catch (e) {
 *   if ((e as { code?: string }).code === 'cancelled') return; // the user said no
 *   throw e;
 * }
 * ```
 * (The extension follows `mimeType` because the HOST chooses the format — do not assume
 * JPEG. `openAppFs()` is the variant that writes to your own app space with no pick.)
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
declare const capturePhoto: (options?: CaptureOptions) => Promise<CaptureResult>;
/** Record one audio clip through the host's capture UI. See {@link capturePhoto} —
 *  every rule there applies verbatim, with `device:microphone` and `capture-audio`. */
declare const captureAudio: (options?: CaptureOptions) => Promise<CaptureResult>;
/** The params this app was invoked with as a task callee. */
interface TaskInput {
    task: string;
    params: Record<string, unknown>;
}
/** The task params this app was invoked with, or null if it isn't a task callee.
 *  Off-host (plain `vite dev`) this is always `null` — there is no host to invoke
 *  this app as a callee. */
declare const getTaskInput: () => TaskInput | null;
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
declare const completeTask: (result: unknown) => void;
/** Abort the task; the caller's `invokeTask` rejects with `cancelled`.
 *  Off-host (plain `vite dev` — no host transport) this is a no-op; on-host a failed
 *  send throws rather than leaving the caller waiting, exactly as {@link completeTask}. */
declare const cancelTask: () => void;
/** React hook: the task input for this callee, re-rendering when it arrives.
 *  Off-host (plain `vite dev`) it stays `null` forever — render the non-callee
 *  state rather than waiting on it. */
declare const useTaskInput: () => TaskInput | null;

export { type CaptureOptions, type CaptureResult, type DirCap, type FileCap, type TaskInput, cancelTask, capDir, capFile, captureAudio, capturePhoto, completeTask, getTaskInput, invokeTask, useTaskInput };
