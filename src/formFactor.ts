import { createPushChannel } from './pushChannel';

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
export type FormFactorClass = 'mobile' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';

export interface FormFactor {
  class: FormFactorClass;
  orientation: Orientation;
  width: number;
  height: number;
}

/** Assumed before the host reports — a reasonable desktop default. */
const DEFAULT_FORM_FACTOR: FormFactor = {
  class: 'desktop',
  orientation: 'landscape',
  width: 1280,
  height: 800,
};

const isFormFactor = (v: unknown): v is FormFactor => {
  const f = v as Partial<FormFactor> | null;
  return (
    !!f &&
    (f.class === 'mobile' || f.class === 'tablet' || f.class === 'desktop') &&
    (f.orientation === 'portrait' || f.orientation === 'landscape') &&
    typeof f.width === 'number' &&
    typeof f.height === 'number'
  );
};

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `form-factor`
// and answers `request-form-factor` (wire format: site-main channelBridge.ts).
const channel = createPushChannel<FormFactor>({
  pushType: 'form-factor',
  requestType: 'request-form-factor',
  initial: DEFAULT_FORM_FACTOR,
  parse: (msg) => (isFormFactor(msg.formFactor) ? (msg.formFactor as FormFactor) : undefined),
});

/** Returns the current form factor. Poll for a one-off read. */
export const getFormFactor = (): FormFactor => channel.get();

/**
 * Subscribe to form-factor changes. The listener is invoked immediately with
 * the current value, then again on every change. Returns an unsubscribe fn.
 */
export const onFormFactorChange = (listener: (formFactor: FormFactor) => void): (() => void) =>
  channel.onChange(listener);

/** React hook returning the current form factor, re-rendering on change. */
export const useFormFactor = (): FormFactor => channel.use();
