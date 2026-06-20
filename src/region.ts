// Region-awareness (UI_AS_APPS_SPEC §4.1). The host can mount the SAME app in more
// than one chrome region — e.g. the agents activity puts one app in BOTH the panel
// slot (`panel.agent`, the conversation list) and the stage slot
// (`stage.conversation`, the selected conversation). `getRegion()` lets that one app
// tell the slots apart and render the right view.
//
// This is descriptive only: the region id is a non-secret string the host already
// knows. It grants nothing and gates nothing — it just names where the app is
// mounted. The host reports it on the §4 discovery global beside `appMountPath`.

import { useEffect, useState } from 'react';
import { getHostRuntime } from './hostRuntime';

/**
 * The chrome region this app instance is mounted in (e.g. `"panel.agent"`,
 * `"stage.conversation"`), or `null` when unknown — a standalone app, local
 * `vite dev`, or an older host that doesn't report it.
 */
export const getRegion = (): string | null => getHostRuntime()?.region ?? null;

/**
 * React hook form of {@link getRegion}. The region is fixed for an app instance's
 * lifetime, but the discovery global can arrive just after first paint, so this
 * re-reads once the host runtime's `ready` promise resolves.
 */
export const useRegion = (): string | null => {
  const [region, setRegion] = useState<string | null>(getRegion);
  useEffect(() => {
    if (region !== null) return;
    let live = true;
    void getHostRuntime()?.ready?.then(() => {
      if (live) setRegion(getRegion());
    });
    return () => {
      live = false;
    };
  }, [region]);
  return region;
};
