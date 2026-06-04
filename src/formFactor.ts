import { useEffect, useState } from 'react';

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

interface FormFactorService {
  getFormFactor(): FormFactor;
  onChange(listener: (formFactor: FormFactor) => void): { dispose(): void };
}

const formFactorService = (): FormFactorService => {
  // @ts-ignore - injected by the sandbox runtime
  return module.evaluation.module.bundler.formFactor;
};

/** Returns the current form factor. Poll for a one-off read. */
export const getFormFactor = (): FormFactor =>
  formFactorService().getFormFactor();

/**
 * Subscribe to form-factor changes. The listener is invoked immediately with
 * the current value, then again on every change. Returns an unsubscribe fn.
 */
export const onFormFactorChange = (
  listener: (formFactor: FormFactor) => void,
): (() => void) => {
  const disposable = formFactorService().onChange(listener);
  return () => disposable.dispose();
};

/** React hook returning the current form factor, re-rendering on change. */
export const useFormFactor = (): FormFactor => {
  const [ff, setFf] = useState<FormFactor>(getFormFactor);
  useEffect(() => onFormFactorChange(setFf), []);
  return ff;
};
