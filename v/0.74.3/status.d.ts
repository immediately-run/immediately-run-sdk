import { CSSProperties, ReactNode } from 'react';

/** Props for {@link Status}. */
interface StatusProps {
    /** The current message. Change THIS to announce; do not mount/unmount the
     *  region per message — a region that mounts with content announces nothing. */
    children: ReactNode;
    /** Assertive live regions interrupt — polite never does. Opt in only for
     *  outcomes the user must hear immediately; the default is polite. */
    assertive?: boolean;
    className?: string;
    style?: CSSProperties;
}
/**
 * A polite live region (WCAG 4.1.3): content changes inside a mounted region
 * are announced without moving focus. Mount it once per surface; announce by
 * changing `children`.
 */
declare function Status({ children, assertive, className, style }: StatusProps): ReactNode;
/** Props for {@link Busy}. */
interface BusyProps {
    /** What is happening, named ("Saving…", "Connecting…") — the R-IX-2 label. */
    label: string;
    /** The flash floor: below this wait, nothing shows (LOADING_UX_SPEC §3.3 /
     *  UI_AS_APPS_SPEC §6.2 — a fast wait never flashes a busy state). Defaults to
     *  the platform floor; pass `0` to show immediately. */
    floorMs?: number;
    className?: string;
    style?: CSSProperties;
}
/**
 * The named busy state as a component: the box renders from the first frame
 * (R-IX-2 — the control is never removed and the surface is never replaced by
 * a spinner), `aria-busy` throughout, and the caller's label appears once the
 * flash floor has passed — below it, nothing shows rather than a flash.
 *
 * Render it IN PLACE of the control's resting label while the request is in
 * flight, with the control itself disabled by the caller:
 * `<button disabled>{busy ? <Busy label="Saving…" /> : "Save"}</button>`.
 */
declare function Busy({ label, floorMs, className, style }: BusyProps): ReactNode;

export { Busy, type BusyProps, Status, type StatusProps };
