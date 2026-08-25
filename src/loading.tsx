// In-app loading primitives (LOADING_UX_SPEC §9, Surface E; design brief 19).
//
// Opt-in, presentational components an app author drops in for IN-APP waits (a
// React.lazy chunk, a slow fetch, a pending action) so they match the platform's
// loading language for free. Per product_values §3 this is convenience — a plain
// app that ignores it still works.
//
// TRUST BOUNDARY (read brief 19): these render INSIDE the app's iframe, under the
// app's principal — presentational only, NO capability, NO host round-trip. They
// share the token VOCABULARY (radii, the shimmer sweep, soft placeholder fills)
// with the host skeletons, but they are deliberately NOT the host's trusted chrome:
// no reserved landmark, no wordmark, no "platform is loading" framing. They use
// ordinary app a11y (`aria-hidden` for decorative skeletons, `role="status"` for an
// indeterminate indicator) — never the host's reserved landmark/accessible name
// (that is the trusted-path control, reserved to the host). An in-app loader that
// mimicked host chrome would be a spoofing vector.
//
// Self-contained: the SDK ships no CSS pipeline, so the keyframes are injected once
// into the document and everything else is inline styles — zero config for the author.
import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';

/** Loading timing constants, matching the host (LOADING_UX_SPEC §3, the 2026-06-22
 *  design bundle). Exported so authors who hand-roll still match the platform. */
export const LOADING_TIMINGS = {
  /** Below this, NO spinner appears — a fast wait never flashes one (§6.2 floor). */
  spinThresholdMs: 150,
  /** The reveal cross-fade duration the host uses. */
  fadeMs: 150,
  /** One slow shimmer sweep across a placeholder. */
  shimmerMs: 1900,
} as const;

/** The in-app skeleton archetypes (the same shapes as the host §4.1 catalog). */
export type SkeletonArchetype = 'panel.list' | 'panel.tree' | 'panel.editor' | 'panel.conversation' | 'generic';

const STYLE_ID = 'ir-sdk-loading-styles';
const STYLE_TEXT = `
@keyframes ir-sdk-sweep{0%{transform:translateX(-130%)}60%,100%{transform:translateX(130%)}}
@keyframes ir-sdk-spin{to{transform:rotate(360deg)}}
.ir-sdk-shim{position:relative;overflow:hidden}
.ir-sdk-shim::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 28%,rgba(127,127,127,.18) 50%,transparent 72%);transform:translateX(-130%);animation:ir-sdk-sweep ${LOADING_TIMINGS.shimmerMs}ms ease-in-out infinite}
.ir-sdk-spin{animation:ir-sdk-spin .8s linear infinite}
@media (prefers-reduced-motion:reduce){.ir-sdk-shim::after{display:none}.ir-sdk-spin{animation:none}}
`;

/** Inject the shimmer/spin keyframes once (idempotent, browser-only). */
function ensureLoadingStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE_TEXT;
  document.head.appendChild(el);
}

/** Ensure the loading keyframes exist before the component paints. */
function useLoadingStyles(): void {
  useLayoutEffect(() => {
    ensureLoadingStyles();
  }, []);
}

// A soft, low-contrast placeholder fill that reads on a light OR dark app surface.
const PLACEHOLDER: CSSProperties = {
  background: 'rgba(127,127,127,0.20)',
  borderRadius: 6,
};

/** A single placeholder bar — compose these into a custom skeleton shape. */
export function SkeletonRow({
  width = '100%',
  height = 12,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  useLoadingStyles();
  return <div className="ir-sdk-shim" aria-hidden="true" style={{ ...PLACEHOLDER, width, height, ...style }} />;
}

function rows(specs: Array<CSSProperties & { key: number }>): ReactNode {
  return specs.map(({ key, ...s }) => (
    <div key={key} className="ir-sdk-shim" aria-hidden="true" style={{ ...PLACEHOLDER, ...s }} />
  ));
}

/** A shaped, in-app skeleton matching the host archetypes — for an app's own lazy
 *  region (e.g. `<Suspense fallback={<Skeleton archetype="panel.list" />}>`).
 *  Decorative (`aria-hidden`); pair it with `aria-busy` on the region it stands in. */
export function Skeleton({ archetype = 'generic', style }: { archetype?: SkeletonArchetype; style?: CSSProperties }) {
  useLoadingStyles();
  const wrap: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    width: '100%',
    boxSizing: 'border-box',
    ...style,
  };
  let body: ReactNode;
  switch (archetype) {
    case 'panel.list':
      body = rows([0, 1, 2, 3, 4].map((key) => ({ key, height: 14 })));
      break;
    case 'panel.tree':
      body = rows([0, 1, 2, 3, 4].map((key) => ({ key, height: 14, marginLeft: (key % 3) * 16 })));
      break;
    case 'panel.editor':
      body = rows([62, 88, 73, 41, 80].map((w, key) => ({ key, height: 11, width: `${w}%` })));
      break;
    case 'panel.conversation':
      body = rows(
        [0, 1, 2, 3].map((key) => ({
          key,
          height: 40,
          width: '70%',
          borderRadius: 12,
          alignSelf: key % 2 ? 'flex-end' : 'flex-start',
        })),
      );
      break;
    case 'generic':
    default:
      body = (
        <>
          <div
            className="ir-sdk-shim"
            aria-hidden="true"
            style={{ ...PLACEHOLDER, height: 16, width: '45%', borderRadius: 4 }}
          />
          {rows([0, 1].map((key) => ({ key, height: 56, borderRadius: 8 })))}
        </>
      );
  }
  return (
    <div aria-hidden="true" style={wrap}>
      {body}
    </div>
  );
}

/** Become true after `ms`, so a fast wait never flashes an indicator (§6.2 floor). */
function useDelayedFlag(ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

/** An indeterminate spinner for waits where a shaped skeleton doesn't fit (a pending
 *  button, a small inline fetch). Wired to the host's ~150 ms-before-spin rule: it
 *  renders nothing until the threshold, so a fast wait shows no flash. Reduced motion
 *  stills the rotation (the ring stays as a static indicator). In-app a11y only. */
export function Spinner({
  size = 18,
  thresholdMs = LOADING_TIMINGS.spinThresholdMs,
  label = 'Loading',
}: {
  size?: number;
  thresholdMs?: number;
  label?: string;
}) {
  useLoadingStyles();
  const show = useDelayedFlag(thresholdMs);
  if (!show) return null;
  return (
    <span
      className="ir-sdk-spin"
      role="status"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: '2px solid rgba(127,127,127,0.3)',
        borderTopColor: 'currentColor',
        borderRadius: '50%',
        boxSizing: 'border-box',
      }}
    />
  );
}

/** Wrap an in-app region whose content is still loading: shows a centered spinner
 *  (past the 150 ms floor) with `aria-busy`, then reveals `children`. For a shaped
 *  wait, pass a `<Skeleton>` as `fallback` instead. App a11y only — not host chrome. */
export function LoadingRegion({
  loading,
  fallback,
  label = 'Loading',
  children,
}: {
  loading: boolean;
  fallback?: ReactNode;
  label?: string;
  children?: ReactNode;
}) {
  useLoadingStyles();
  if (!loading) return <>{children}</>;
  return (
    <div
      aria-busy="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        minHeight: 48,
      }}
    >
      {fallback ?? <Spinner label={label} />}
    </div>
  );
}
