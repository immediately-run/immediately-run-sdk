import { ReactNode, CSSProperties } from 'react';

/**
 * Register `onDismiss` as this dialog's Escape handler. The topmost mounted
 * dialog wins: only its handler runs, and only on Escape.
 *
 * `onDismiss` is read through a ref so a new inline lambda on each render (the
 * near-universal shape of an `onClose` prop) does NOT re-register the dialog —
 * the entry is torn down and re-added only when `enabled` changes.
 */
declare function useDialogDismiss(onDismiss: () => void, { enabled }?: {
    enabled?: boolean;
}): void;
/**
 * Manage focus for one dialog rooted at `ref`: on open, record the invoking
 * element and focus the first focusable descendant (falling back to `ref`
 * itself — give the root `tabIndex={-1}` for that case); on close, return
 * focus to the invoker (guarded — it may itself have unmounted); Tab /
 * Shift-Tab wrap at the ends of the focusable list, read at keydown time
 * rather than cached on mount (dialog contents change).
 */
declare function useDialogFocus(ref: {
    current: HTMLElement | null;
}, { enabled }?: {
    enabled?: boolean;
}): void;
/** Props for {@link Dialog}. Styling is the app's — the primitive is structural. */
interface DialogProps {
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
declare function Dialog({ children, onDismiss, className, style, ...aria }: DialogProps): ReactNode;

export { Dialog, type DialogProps, useDialogDismiss, useDialogFocus };
