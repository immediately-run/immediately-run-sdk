// In-app dialog primitives (interaction_standards R-IX-1; the dialog half of the
// standards' delivery vehicle, R3-613).
//
// The APG dialog contract as imports: Escape dismisses the TOPMOST open dialog,
// focus moves into the dialog on open and back to the invoker on close, and Tab
// wraps inside it. Generalized from the host's own pair (site-main
// `useHostDialogDismiss`/`useHostDialogFocus`, R3-592) — the same decisions,
// renamed for an app context; site-main holds the two to identical behaviour
// with a parity test, so "generalized" is a fact and an app can swap between
// the primitives without re-litigating the contract.
//
// TRUST BOUNDARY (same rule as `./loading`): these render INSIDE the app's
// iframe, under the app's principal — presentational only, NO capability, NO
// host round-trip, no reserved landmark or host wordmark. Ordinary app a11y,
// never trusted-chrome framing; adds nothing to a grant set.
//
// The dismiss listener is a capture-phase listener on the app's OWN document,
// installed while the stack is non-empty. Capture is what makes the contract
// hold on both sides: a keystroke the app dialog claims (Escape → stopPropagation)
// never reaches an app-level bubble handler behind the dialog — and the host's
// top-document listener lives in another document entirely, so neither side's
// dismissal can suppress the other's, with no protocol between them.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** The focusable-selector constant. Deliberately NOT exported from `index.ts`:
 *  it is an implementation detail of the trap, not author surface. Includes
 *  `iframe` because a dialog whose body hosts a frame must let Tab reach it. */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])';

type Entry = { onDismiss: () => void };

// A module-level stack is the whole registry: the ONE capture-phase document
// listener is installed when the first dialog mounts and removed when the last
// unmounts. Reading `stack` fresh on each keypress makes removal-of-a-non-top-
// entry safe.
const stack: Entry[] = [];

const onDocumentKeyDown = (e: KeyboardEvent): void => {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.stopPropagation();
  top.onDismiss();
};

/**
 * Register `onDismiss` as this dialog's Escape handler. The topmost mounted
 * dialog wins: only its handler runs, and only on Escape.
 *
 * `onDismiss` is read through a ref so a new inline lambda on each render (the
 * near-universal shape of an `onClose` prop) does NOT re-register the dialog —
 * the entry is torn down and re-added only when `enabled` changes.
 */
export function useDialogDismiss(onDismiss: () => void, { enabled = true }: { enabled?: boolean } = {}): void {
  const ref = useRef(onDismiss);
  ref.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = { onDismiss: () => ref.current() };
    stack.push(entry);
    if (stack.length === 1) document.addEventListener('keydown', onDocumentKeyDown, true);
    return () => {
      // Unmounting removes THIS dialog's entry, which may not be the top — a
      // dialog closed out of stack order must not leak its entry. Splice by
      // identity, never by "pop".
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) document.removeEventListener('keydown', onDocumentKeyDown, true);
    };
  }, [enabled]);
}

/**
 * Manage focus for one dialog rooted at `ref`: on open, record the invoking
 * element and focus the first focusable descendant (falling back to `ref`
 * itself — give the root `tabIndex={-1}` for that case); on close, return
 * focus to the invoker (guarded — it may itself have unmounted); Tab /
 * Shift-Tab wrap at the ends of the focusable list, read at keydown time
 * rather than cached on mount (dialog contents change).
 */
export function useDialogFocus(
  ref: { current: HTMLElement | null },
  { enabled = true }: { enabled?: boolean } = {},
): void {
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;

    // Record the invoker BEFORE stealing focus — the element that opened the dialog.
    const invoker = document.activeElement as HTMLElement | null;
    const first = node.querySelector<HTMLElement>(FOCUSABLE) ?? node;
    first.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const list = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (list.length === 0) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node.addEventListener('keydown', onKeyDown);

    return () => {
      node.removeEventListener('keydown', onKeyDown);
      // The invoker may itself have unmounted by the time the dialog closes; the
      // optional calls are why this stays safe (and why it can never throw on teardown).
      invoker?.focus?.();
    };
  }, [enabled, ref]);
}

/** Props for {@link Dialog}. Styling is the app's — the primitive is structural. */
export interface DialogProps {
  children: ReactNode;
  /** Called on Escape (the topmost dialog wins). Click-outside/scrim handling is
   *  the app's: the scrim is app chrome, and its click handler calls the same
   *  `onDismiss`. */
  onDismiss: () => void;
  /** The accessible name — a dialog without one is unnamed to AT (4.1.2). */
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A dialog with the contract wired: `role="dialog" aria-modal="true"`, Escape
 * dismiss (topmost wins), focus in on open / back to the invoker on close, Tab
 * trapped inside. Render it when the dialog is open, with the invoker still
 * focused — the invoker is recorded at mount.
 */
export function Dialog({ children, onDismiss, className, style, ...aria }: DialogProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useDialogDismiss(onDismiss);
  useDialogFocus(ref);
  return (
    <div ref={ref} role="dialog" aria-modal="true" className={className} style={style} {...aria}>
      {children}
    </div>
  );
}
