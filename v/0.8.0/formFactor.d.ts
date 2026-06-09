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
type Orientation = 'portrait' | 'landscape';
interface FormFactor {
    class: FormFactorClass;
    orientation: Orientation;
    width: number;
    height: number;
}
/** Returns the current form factor. Poll for a one-off read. */
declare const getFormFactor: () => FormFactor;
/**
 * Subscribe to form-factor changes. The listener is invoked immediately with
 * the current value, then again on every change. Returns an unsubscribe fn.
 */
declare const onFormFactorChange: (listener: (formFactor: FormFactor) => void) => (() => void);
/** React hook returning the current form factor, re-rendering on change. */
declare const useFormFactor: () => FormFactor;

export { type FormFactor, type FormFactorClass, type Orientation, getFormFactor, onFormFactorChange, useFormFactor };
