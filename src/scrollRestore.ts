// Deciding WHEN a remembered scroll offset may be applied after a back/forward
// traversal (R3-627). Pure: no DOM, no React, no timers — the caller samples the
// geometry and this says what to do with the sample.
//
// The failure this exists to prevent: an app's document grows as it renders, so an
// offset applied on arrival is clamped to whatever height exists at that instant and
// the reader lands near the top — the very defect the feature is meant to remove. So
// the restore waits until the content is tall enough to hold the offset, and gives up
// rather than fighting either the clock or the reader.

/** A geometry sample of the scroller, plus how the attempt is going. */
export interface RestoreSample {
  /** The remembered offset we are trying to reach. */
  target: number;
  /** The scroller's full scrollable height right now. */
  scrollHeight: number;
  /** The scroller's visible height right now. */
  clientHeight: number;
  /** Where the scroller is right now. */
  current: number;
  /** Milliseconds since the restore began. */
  elapsedMs: number;
  /** Whether the reader has scrolled since the restore began. */
  userScrolled: boolean;
}

/** What the caller should do with this sample. */
export type RestoreAction = 'apply' | 'wait' | 'abandon';

/** How long to keep waiting for the content to grow before giving up. Matches the
 *  give-up window `ScrollAfterNavigation` already uses for fragments, so the two
 *  navigation-scroll behaviours settle on the same timescale. */
export const RESTORE_DEADLINE_MS = 900;

/** How close counts as arrived. Sub-pixel differences and fractional device pixels
 *  must not keep a restore looping. */
export const RESTORE_EPSILON_PX = 2;

/**
 * The one decision, given a sample.
 *
 * - `abandon` — the reader has taken over, or the deadline passed. Never fight a
 *   user, and never scroll a page they have already started reading.
 * - `apply` — the content can hold the offset (or the offset is already reached,
 *   within {@link RESTORE_EPSILON_PX}); scroll and finish.
 * - `wait` — the content is still too short; sample again.
 *
 * A non-finite or negative target is treated as nothing to restore (`abandon`), so a
 * corrupt scratch value can never move the page.
 */
export const nextRestoreAction = (sample: RestoreSample): RestoreAction => {
  const { target, scrollHeight, clientHeight, current, elapsedMs, userScrolled } = sample;
  if (!Number.isFinite(target) || target <= 0) return 'abandon';
  if (userScrolled) return 'abandon';
  if (Math.abs(current - target) <= RESTORE_EPSILON_PX) return 'apply';
  if (elapsedMs >= RESTORE_DEADLINE_MS) return 'abandon';
  // The furthest this scroller can currently reach. Applying before the content is
  // this tall is what clamps the reader to the top.
  const reachable = Math.max(0, scrollHeight - clientHeight);
  return reachable >= target ? 'apply' : 'wait';
};
