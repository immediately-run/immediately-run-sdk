/**
 * The form factor of the surface your app is rendered into, mirrored from the
 * immediately.run host (UI_AS_APPS_SPEC §5.4.1). Read this to lay out
 * responsively — a narrow chrome panel, a full preview, or a mobile carousel
 * pane all report their box here. The host is the source of truth (it owns the
 * region); you cannot reliably measure your own viewport across the sandbox
 * boundary.
 *
 * Baseline capability `formFactor:read` — every app may read it.
 */
type FormFactorClass = 'mobile' | 'tablet' | 'desktop';
/** Whether the rendered surface is taller than wide (`portrait`) or wider (`landscape`). */
type Orientation = 'portrait' | 'landscape';
/** The host-reported size class, orientation, and pixel box of your app's surface. */
interface FormFactor {
    class: FormFactorClass;
    orientation: Orientation;
    width: number;
    height: number;
}
/** Returns the current form factor. Poll for a one-off read.
 *
 *  Off-host (plain `vite dev` — no host to report the region's box) this stays at
 *  the default forever: `{ class: 'desktop', orientation: 'landscape', width: 1280,
 *  height: 800 }`. Don't mistake it for a measurement — locally, size your layout
 *  from the DOM if you need the real viewport. */
declare const getFormFactor: () => FormFactor;
/**
 * Subscribe to form-factor changes. The listener is invoked immediately with
 * the current value, then again on every change. Returns an unsubscribe fn.
 */
declare const onFormFactorChange: (listener: (formFactor: FormFactor) => void) => (() => void);
/** React hook returning the current form factor, re-rendering on change.
 *
 *  Off-host (plain `vite dev`) it returns the desktop default (`desktop`,
 *  `landscape`, 1280×800) forever — the host never reports, so no re-render ever
 *  arrives. See {@link getFormFactor}. */
declare const useFormFactor: () => FormFactor;

export { type FormFactor, type FormFactorClass, type Orientation, getFormFactor, onFormFactorChange, useFormFactor };
