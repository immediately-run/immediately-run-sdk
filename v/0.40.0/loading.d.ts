import * as react from 'react';
import { ReactNode, CSSProperties } from 'react';

/** Loading timing constants, matching the host (LOADING_UX_SPEC §3, the 2026-06-22
 *  design bundle). Exported so authors who hand-roll still match the platform. */
declare const LOADING_TIMINGS: {
    /** Below this, NO spinner appears — a fast wait never flashes one (§6.2 floor). */
    readonly spinThresholdMs: 150;
    /** The reveal cross-fade duration the host uses. */
    readonly fadeMs: 150;
    /** One slow shimmer sweep across a placeholder. */
    readonly shimmerMs: 1900;
};
/** The in-app skeleton archetypes (the same shapes as the host §4.1 catalog). */
type SkeletonArchetype = "panel.list" | "panel.tree" | "panel.editor" | "panel.conversation" | "generic";
/** A single placeholder bar — compose these into a custom skeleton shape. */
declare function SkeletonRow({ width, height, style, }: {
    width?: number | string;
    height?: number | string;
    style?: CSSProperties;
}): react.JSX.Element;
/** A shaped, in-app skeleton matching the host archetypes — for an app's own lazy
 *  region (e.g. `<Suspense fallback={<Skeleton archetype="panel.list" />}>`).
 *  Decorative (`aria-hidden`); pair it with `aria-busy` on the region it stands in. */
declare function Skeleton({ archetype, style, }: {
    archetype?: SkeletonArchetype;
    style?: CSSProperties;
}): react.JSX.Element;
/** An indeterminate spinner for waits where a shaped skeleton doesn't fit (a pending
 *  button, a small inline fetch). Wired to the host's ~150 ms-before-spin rule: it
 *  renders nothing until the threshold, so a fast wait shows no flash. Reduced motion
 *  stills the rotation (the ring stays as a static indicator). In-app a11y only. */
declare function Spinner({ size, thresholdMs, label, }: {
    size?: number;
    thresholdMs?: number;
    label?: string;
}): react.JSX.Element | null;
/** Wrap an in-app region whose content is still loading: shows a centered spinner
 *  (past the 150 ms floor) with `aria-busy`, then reveals `children`. For a shaped
 *  wait, pass a `<Skeleton>` as `fallback` instead. App a11y only — not host chrome. */
declare function LoadingRegion({ loading, fallback, label, children, }: {
    loading: boolean;
    fallback?: ReactNode;
    label?: string;
    children?: ReactNode;
}): react.JSX.Element;

export { LOADING_TIMINGS, LoadingRegion, Skeleton, type SkeletonArchetype, SkeletonRow, Spinner };
