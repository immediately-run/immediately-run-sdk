/** A geometry sample of the scroller, plus how the attempt is going. */
interface RestoreSample {
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
type RestoreAction = 'apply' | 'wait' | 'abandon';
/** How long to keep waiting for the content to grow before giving up. Matches the
 *  give-up window `ScrollAfterNavigation` already uses for fragments, so the two
 *  navigation-scroll behaviours settle on the same timescale. */
declare const RESTORE_DEADLINE_MS = 900;
/** How close counts as arrived. Sub-pixel differences and fractional device pixels
 *  must not keep a restore looping. */
declare const RESTORE_EPSILON_PX = 2;
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
declare const nextRestoreAction: (sample: RestoreSample) => RestoreAction;

export { RESTORE_DEADLINE_MS, RESTORE_EPSILON_PX, type RestoreAction, type RestoreSample, nextRestoreAction };
