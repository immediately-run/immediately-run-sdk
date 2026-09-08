// R3-562 — the region-visibility read (`region.ts`), the app-side half of
// AGENT_RUN_DURABILITY_SPEC §7 R-ARD-20a.
//
// The host can keep a region mounted and merely hide it, so an activity switch does not
// reboot the app's iframe. Hiding stops the frame PAINTING, not executing — so an agent
// loop behind it would keep running where LLM_AND_AGENTS_SPEC §3.3's stop button and
// tool-call log are unreachable. Everything below is about that one boolean arriving
// correctly, and about the DEFAULT, which is the only thing an app running outside the
// workbench will ever see.
// `export {}` makes this file a MODULE: without it TypeScript treats a test with no
// top-level import/export as a script, and its `listeners`/`sendMessage` helpers collide
// with the identically-shaped ones in `debug.test.ts` (TS2451, tsc only — jest is fine).
export {};

type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const sendMessage = jest.fn();

jest.mock('./hostTransport', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

type Mod = typeof import('./region');
let mod: Mod;
const push = (msg: Record<string, unknown>) => (listeners['region-visibility'] || []).forEach((l) => l(msg));

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('./region');
});

it('assumes VISIBLE until the host says otherwise', () => {
  // The default is the whole compatibility story. A standalone tab, `vite dev`, an older
  // host and a fork of the workbench that never pushes this all land here — and defaulting
  // to hidden would pause every such app forever, waiting for a message nobody sends.
  expect(mod.isRegionHidden()).toBe(false);
});

it('polls on first read, so an app that mounted while hidden is not left guessing', () => {
  mod.isRegionHidden();
  expect(sendMessage).toHaveBeenCalledWith('request-region-visibility');
});

it('replays the current value, then fires on every change, and stops on unsubscribe', () => {
  const seen: boolean[] = [];
  const off = mod.onRegionVisibilityChange((h) => seen.push(h));
  expect(seen).toEqual([false]); // immediate replay
  push({ hidden: true });
  push({ hidden: false });
  expect(seen).toEqual([false, true, false]);
  off();
  push({ hidden: true });
  expect(seen).toEqual([false, true, false]);
});

it('keeps the last good value when the host pushes something malformed', () => {
  // `parse` returning `undefined` means "ignore this message" — so a garbled push leaves
  // the app on the value the host last actually sent, rather than flipping it to one
  // nobody chose. Flipping to visible would resume a run behind the user's back; flipping
  // to hidden would stall a run nobody asked to stall.
  mod.onRegionVisibilityChange(() => {});
  push({ hidden: true });
  expect(mod.isRegionHidden()).toBe(true);
  push({ hidden: 'yes' });
  push({});
  push({ hidden: null });
  expect(mod.isRegionHidden()).toBe(true);
});

it('reads back through the pollable getter, not only through a subscription', () => {
  // An agent loop checks this at a turn boundary rather than holding a subscription open,
  // so the poll path has to carry the same value the push path delivered.
  push({ hidden: true });
  expect(mod.isRegionHidden()).toBe(false); // no listener registered yet: nothing was received
  mod.onRegionVisibilityChange(() => {});
  push({ hidden: true });
  expect(mod.isRegionHidden()).toBe(true);
});

it('does not disturb getRegion — the two reads are independent', () => {
  expect(mod.getRegion()).toBeNull();
  push({ hidden: true });
  expect(mod.getRegion()).toBeNull();
});
