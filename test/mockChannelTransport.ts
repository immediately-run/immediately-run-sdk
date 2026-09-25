// A controllable `ChannelTransport` for push-channel tests: capture sent messages, and
// let a test fire pushes.
//
// This was a local function in `pushChannel.spec.ts` until R3-708 round 3, when a second
// suite (`src/pushChannel.test.tsx`, the React `use()` layer) re-implemented it and the
// review gate called the duplicate under R6. It cannot be imported FROM the spec, because
// importing a spec file runs its `describe` blocks, so it lives here — a plain module,
// not matched by jest's default `*.spec|test` patterns, so it is not collected as a suite.
import type { ChannelTransport } from '../src/pushChannel';

export function mockChannelTransport() {
  const sent: string[] = [];
  const handlers = new Map<string, (msg: Record<string, unknown>) => void>();
  const transport: ChannelTransport = {
    sendMessage: (type) => {
      sent.push(type);
    },
    addListener: (type, handler) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    },
  };
  const push = (type: string, msg: Record<string, unknown>) => handlers.get(type)?.(msg);
  return { transport, sent, handlers, push };
}
