// Cross-app drag-out (FILE_EXPLORER_SPEC §7; UI_AS_APPS_SPEC §2 host-mediated).
//
// Native HTML5 drag-and-drop does NOT cross the sandboxed cross-origin iframe
// boundary, and pointer events inside one app's iframe never reach the host or a
// sibling. So a drag that STARTS in one app (the file explorer) and ENDS over
// another (the previewed app) can only be mediated by the host (the TCB). This
// module is the SDK surface for that one net-new platform primitive:
//
//  - SOURCE side (the file explorer, needs the first-party `dnd:source` cap):
//    `startItemDrag(item)` asks the host to begin a host-mediated drag carrying a
//    file/dir reference (+ optional inlined bytes for a small file). The host draws
//    the trusted drag ghost, tracks the pointer across regions, and on drop over the
//    preview delivers the item to that app. `cancelItemDrag()` aborts.
//  - RECEIVER side (the previewed app, NO new grant — it opts in by subscribing):
//    `onItemDrop(cb)` / `useDroppedItem()` deliver the dropped item with host-attached,
//    unspoofable provenance (`from` = source region id) and the drop position.
//
// The payload is UNTRUSTED app data (CLAUDE.md §5): the host attaches `from`; the app
// validates everything else. v1 inlines bytes only for small files (the source can
// only relay data it can already read — no new read authority is minted).
import { useEffect, useState } from 'react';
import { protocolRequest, sendMessage, addListener } from './sandboxUtils';
import { DND_CANCEL, DROPPED_ITEM, PROTOCOL_DND } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** A file/dir being dragged out of an app. `bytes` is present only for a small file
 *  the source chose to inline (transferred zero-copy); a dir or an over-cap file
 *  carries the reference only (`kind`/`name`/`mountId`/`relPath`). */
export interface DraggableItem {
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
export interface DroppedItem {
  /** The dragged item (`bytes` present iff the source inlined them). */
  item: DraggableItem;
  /** Host-attached source region id — unspoofable (T19), like an `ipc` `from`. */
  from: string;
  /** Drop point in this app's viewport. */
  position: { x: number; y: number };
}

/** An error from {@link startItemDrag}, carrying a machine-readable `.code`. */
export interface ItemDragError extends Error {
  code:
    | 'forbidden' // the frame lacks the first-party `dnd:source` capability
    | 'invalid-params' // the item was malformed (empty path / `..` / URI / bad kind)
    | 'too-large' // inlined `bytes` exceed the host's size limit
    | 'rate-limited' // too many drags started too fast (capacity-class, fail-open)
    | 'unknown';
}

/**
 * Begin a host-mediated drag of `item` out of this app. Resolves once the host has
 * taken over the drag (drawn the ghost, installed the pointer-capture layer); rejects
 * with an {@link ItemDragError} if this app may not initiate drags (`forbidden`) or the
 * item is invalid. Only a first-party chrome app holding `dnd:source` may call this — a
 * previewed/third-party app is refused at the gate (it must not synthesize drags into
 * sibling apps).
 */
export const startItemDrag = async (item: DraggableItem): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_DND], 'startDrag', [item])) as
    | { ok: true }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'dnd startDrag failed') as ItemDragError;
    err.code = (res?.code as ItemDragError['code']) ?? 'unknown';
    throw err;
  }
};

/** Abort an in-progress host-mediated drag this app started (e.g. the user pressed
 *  Escape, or the gesture was cancelled). Best-effort and fire-and-forget. */
export const cancelItemDrag = (): void => {
  sendMessage(DND_CANCEL, {});
};

/** Subscribe to items dropped onto this app by a host-mediated cross-app drag.
 *  Returns an unsubscribe fn. Subscribing is the opt-in: an app that never subscribes
 *  receives nothing (the host shows a "not accepted" cue and the drop is a no-op). */
export const onItemDrop = (listener: (d: DroppedItem) => void): (() => void) =>
  addListener(DROPPED_ITEM, (m: { item: DraggableItem; from: string; position: { x: number; y: number } }) =>
    listener({ item: m.item, from: m.from, position: m.position }),
  );

/** React hook: the most recently dropped item (or `null`). */
export const useDroppedItem = (): DroppedItem | null => {
  const [dropped, setDropped] = useState<DroppedItem | null>(null);
  useEffect(() => onItemDrop(setDropped), []);
  return dropped;
};
