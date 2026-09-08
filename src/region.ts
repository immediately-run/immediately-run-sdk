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
import { createPushChannel } from './pushChannel';
import { REGION_VISIBILITY, REQUEST_REGION_VISIBILITY } from './generated/protocol';

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

// --- region visibility (R3-562) ---------------------------------------------
//
// The host can keep a region MOUNTED and merely hide it, so switching the workbench
// to another activity does not reboot this app's iframe and destroy whatever it was
// doing (`AGENT_RUN_DURABILITY_SPEC` §7 R-ARD-20). Hiding stops the frame PAINTING,
// not executing — which is the problem this read exists to solve.
//
// An app that is doing something the user is meant to WATCH must stop while hidden.
// The case that forced it is an agent loop: `LLM_AND_AGENTS_SPEC` §3.3's loop
// observability contract requires a streaming transcript, an ordered tool-call log
// and a reachable stop button, and none of those survives a `display:none` + `inert`
// subtree. So the loop pauses at its next turn boundary and continues on reveal —
// nothing is torn down, nothing is lost, and nothing runs where nobody can stop it
// (R-ARD-20a).
//
// Like `getRegion()` above, this is DESCRIPTIVE ONLY: it grants nothing, gates
// nothing, and names no resource. It is one boolean about the host's own chrome —
// which is why the host answers it for every frame regardless of capabilities.
//
// An app that ignores it behaves exactly as it did before, and so does an app running
// anywhere the host never pushes it (a standalone tab, `vite dev`, an older host):
// `initial` is `false` — VISIBLE — because the alternative is an app that pauses
// forever wherever nobody is telling it anything.

const visibility = createPushChannel<boolean>({
  pushType: REGION_VISIBILITY,
  requestType: REQUEST_REGION_VISIBILITY,
  initial: false,
  // Tolerant parse: `undefined` means "ignore this message", so a malformed push from
  // some future/older host leaves the last good value standing rather than flipping
  // the app to a value nobody sent.
  parse: (msg) => (typeof msg.hidden === 'boolean' ? msg.hidden : undefined),
});

/**
 * Whether the host has hidden this app's region — it is still mounted and running,
 * but off screen and `inert`, so the user can neither see it nor interact with it.
 *
 * `false` when the host says nothing (a standalone app, `vite dev`, an older host).
 */
export const isRegionHidden = (): boolean => visibility.get();

/**
 * Subscribe to this region's visibility. The listener is invoked immediately with the
 * current value, then on every change. Returns an unsubscribe fn.
 *
 * Use it to STOP doing what the user is supposed to be watching, at your own safe
 * boundary — never mid-operation. An agent loop pauses between turns, so every
 * `tool_use` still has its `tool_result`; a poller stops polling; an animation stops
 * animating. Do not use it to hide UI: the host has already done that.
 */
export const onRegionVisibilityChange = (listener: (hidden: boolean) => void): (() => void) =>
  visibility.onChange(listener);

/** React hook form of {@link isRegionHidden}, re-rendering on change. */
export const useRegionHidden = (): boolean => visibility.use();
