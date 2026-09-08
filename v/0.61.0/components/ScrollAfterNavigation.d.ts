/**
 * Deep-linking Capability C (MARKDOWN_SYNTAX_SPEC §13.5): after an in-app navigation
 * whose URL carries a `#fragment`, scroll the target section into view.
 *
 * In-app navigation swaps the rendered file **asynchronously** — the destination
 * file's tree mounts *after* the route change — so the element the fragment
 * addresses does not exist at click time. This effect records the pending fragment
 * and retries until the target appears: an immediate attempt, a `MutationObserver`
 * over late-mounting subtrees, and a few timed retries (the `[120, 300, 600]ms`
 * cadence `grove/src/components/Toc.tsx` proves for late-mounting prose). If the
 * target never appears within the window it degrades to top-of-page — a missing
 * fragment is never a hard failure.
 *
 * It re-runs when the destination page **or** the fragment changes, so a fresh click
 * on the same target re-scrolls. Mounted once inside the navigation provider (see
 * `boot`'s `TinkerableApp`) so it is uniform for **every** MDX app — the SDK router
 * owns cross-page anchor navigation, not any one consumer (Grove).
 */
declare const useScrollAfterNavigation: () => void;
/** Null-rendering mount point for {@link useScrollAfterNavigation} inside the
 *  navigation provider. */
declare const ScrollAfterNavigation: () => null;

export { ScrollAfterNavigation, useScrollAfterNavigation };
