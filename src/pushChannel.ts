// Generic host→sandbox state channel read over the TRANSPORT
// (SDK_PACKAGING_SPEC §4, expose-transport). The host pushes a `pushType`
// message whenever the value changes and answers a `requestType` poll with the
// current value — gated per-frame by the read ACL (site-main channelBridge.ts /
// channelRouter). Historically the SDK read these values off injected sandbox
// service objects (`module.evaluation.module.bundler.auth` etc.); this caches
// the latest value SDK-side instead, so the SDK is self-contained and the
// bundler services can eventually be retired.
//
// Every state helper (formFactor, auth, editorContext, theme, catalog) is a thin
// wrapper over one of these — the get / onChange / use trio is identical.
import { useEffect, useState } from 'react';
import { sendMessage as defaultSend, addListener as defaultAddListener } from './hostTransport';

export interface PushChannel<T> {
  /** Pollable snapshot of the current value. */
  get(): T;
  /** Subscribe; invoked immediately with the current value, then on every change. Returns unsubscribe. */
  onChange(listener: (value: T) => void): () => void;
  /** React hook returning the current value, re-rendering on change. */
  use(): T;
}

/** Injectable transport — defaults to the real one; overridden in tests. */
export interface ChannelTransport {
  sendMessage: (type: string, data?: Record<string, unknown>) => void;
  addListener: (type: string, handler: (msg: Record<string, unknown>) => void) => () => void;
}

export function createPushChannel<T>(
  opts: {
    /** Host→sandbox push message type (e.g. `form-factor`). */
    pushType: string;
    /** Poll message type the SDK sends to pull the current value (e.g. `request-form-factor`). */
    requestType?: string;
    /** Value assumed before the host answers — also the value when the app may not read the channel. */
    initial: T;
    /** Extract + validate the value from a push message; return `undefined` to ignore the message. */
    parse: (msg: Record<string, unknown>) => T | undefined;
  },
  transport: ChannelTransport = { sendMessage: defaultSend, addListener: defaultAddListener },
): PushChannel<T> {
  let current = opts.initial;
  const listeners = new Set<(value: T) => void>();
  let started = false;

  // Lazily start on first read: register the push listener + send one poll, so a
  // late-mounting app still gets the current value. A channel the app may not
  // read is simply never answered → `initial` stands.
  const start = () => {
    if (started) return;
    try {
      transport.addListener(opts.pushType, (msg) => {
        const next = opts.parse(msg);
        if (next !== undefined) {
          current = next;
          listeners.forEach((l) => l(current));
        }
      });
    } catch {
      // No host transport in this realm yet (the resolver throws when neither the injected
      // bundler bus nor the §4 discovery global is present). Leave `started` false so the
      // NEXT read retries, and let `initial` stand meanwhile — which is exactly the
      // documented behaviour for a channel the host never answers. Throwing here instead
      // would make a plain `getHostTheme()` fatal outside a sandbox, and since R3-307 the
      // deadline on every host call reads a channel, so one throw would be every call.
      return;
    }
    started = true;
    if (opts.requestType) {
      try {
        transport.sendMessage(opts.requestType);
      } catch {
        /* transport not ready — a proactive push will still arrive */
      }
    }
  };

  const get = (): T => {
    start();
    return current;
  };

  const onChange = (listener: (value: T) => void): (() => void) => {
    start();
    listeners.add(listener);
    listener(current);
    return () => {
      listeners.delete(listener);
    };
  };

  const use = (): T => {
    const [value, setValue] = useState<T>(get);
    useEffect(() => onChange(setValue), []);
    return value;
  };

  return { get, onChange, use };
}
