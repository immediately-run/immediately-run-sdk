// In-app status primitives (interaction_standards R-IX-2/R-IX-3; the status half
// of the standards' delivery vehicle, R3-613).
//
// `Status` is the live region: mount it ONCE per surface and change its content —
// a content change inside a mounted `role="status"` region announces without
// stealing focus (WCAG 4.1.3). `Busy` is R-IX-2's write face as a component: the
// pending control keeps its box and names what is happening, carrying `aria-busy`.
//
// TRUST BOUNDARY (same rule as `./loading` and `./dialog`): presentational only,
// NO capability, NO host round-trip, no reserved landmark or host wordmark.
//
// TIMING: no constant is minted here. The flash floor below is LOADING_TIMINGS'
// spinThresholdMs — §9-2's token clause, one timing language for both modules.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { LOADING_TIMINGS } from './loading';

/** Props for {@link Status}. */
export interface StatusProps {
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
export function Status({ children, assertive = false, className, style }: StatusProps): ReactNode {
  return (
    <div role="status" aria-live={assertive ? 'assertive' : 'polite'} className={className} style={style}>
      {children}
    </div>
  );
}

/** Props for {@link Busy}. */
export interface BusyProps {
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
export function Busy({ label, floorMs = LOADING_TIMINGS.spinThresholdMs, className, style }: BusyProps): ReactNode {
  const [show, setShow] = useState(floorMs <= 0);
  useEffect(() => {
    if (floorMs <= 0) {
      setShow(true);
      return;
    }
    const t = setTimeout(() => setShow(true), floorMs);
    return () => clearTimeout(t);
  }, [floorMs, label]);

  return (
    <span aria-busy="true" className={className} style={style}>
      {show ? label : ''}
    </span>
  );
}
