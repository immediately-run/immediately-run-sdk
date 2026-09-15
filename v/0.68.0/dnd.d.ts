/** A file/dir being dragged out of an app. `bytes` is present only for a small file
 *  the source chose to inline (transferred zero-copy); a dir or an over-cap file
 *  carries the reference only (`kind`/`name`/`mountId`/`relPath`). */
interface DraggableItem {
    kind: 'file' | 'dir';
    /** Basename — display only. */
    name: string;
    /** Which mounted filesystem the item lives in. */
    mountId: string;
    /** Path within that mount (leading slash, no `..`). */
    relPath: string;
    /** Optional inlined content for a small file. */
    bytes?: Uint8Array;
}
/** An item dropped onto THIS app by a host-mediated cross-app drag. */
interface DroppedItem {
    /** The dragged item (`bytes` present iff the source inlined them). */
    item: DraggableItem;
    /** Host-attached source region id — unspoofable (T19), like an `ipc` `from`. */
    from: string;
    /** Drop point in this app's viewport. */
    position: {
        x: number;
        y: number;
    };
}
/** An error from {@link startItemDrag}, carrying a machine-readable `.code`. */
interface ItemDragError extends Error {
    code: 'forbidden' | 'invalid-params' | 'too-large' | 'rate-limited' | 'unknown';
}
/**
 * Begin a host-mediated drag of `item` out of this app. Resolves once the host has
 * taken over the drag (drawn the ghost, installed the pointer-capture layer); rejects
 * with an {@link ItemDragError} if this app may not initiate drags (`forbidden`) or the
 * item is invalid. Only a first-party chrome app holding `dnd:source` may call this — a
 * previewed/third-party app is refused at the gate (it must not synthesize drags into
 * sibling apps).
 */
declare const startItemDrag: (item: DraggableItem) => Promise<void>;
/** Abort an in-progress host-mediated drag this app started (e.g. the user pressed
 *  Escape, or the gesture was cancelled). Best-effort and fire-and-forget. */
declare const cancelItemDrag: () => void;
/** Subscribe to items dropped onto this app by a host-mediated cross-app drag.
 *  Returns an unsubscribe fn. Subscribing is the opt-in: an app that never subscribes
 *  receives nothing (the host shows a "not accepted" cue and the drop is a no-op). */
declare const onItemDrop: (listener: (d: DroppedItem) => void) => (() => void);
/** React hook: the most recently dropped item (or `null`). */
declare const useDroppedItem: () => DroppedItem | null;

export { type DraggableItem, type DroppedItem, type ItemDragError, cancelItemDrag, onItemDrop, startItemDrag, useDroppedItem };
