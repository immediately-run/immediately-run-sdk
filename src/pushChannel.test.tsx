/**
 * @jest-environment jsdom
 */
// `createPushChannel().use()` — the REACT layer, and only that.
//
// Scope, corrected in R3-708 round 3: `test/pushChannel.spec.ts` already holds every
// non-React property of this module — the lazy single poll, `onChange`'s unsubscribe, the
// parse-returns-`undefined` ignore path, the no-`requestType` channel and the throwing
// transport. An earlier version of this file re-tested three of those and re-implemented
// that spec's mock transport; both were duplication (R6). The transport now lives in
// `test/mockChannelTransport.ts` and is imported by both suites, and what is left here is
// the one thing that spec structurally cannot cover: it is a `.ts` file in the node
// environment, with no renderer.
//
// Honest limit, MEASURED, not assumed: `use()`'s effect CLEANUP is still not covered — by
// this file or any other. Dropping it (`useEffect(() => onChange(setValue), [])` ->
// `useEffect(() => { onChange(setValue); }, [])`) leaves the whole suite green. The leaked
// listeners are dead roots' `setValue`s, React 19 no-ops every one, and a live probe still
// renders exactly once per push, so nothing outside can distinguish them. Covering it
// needs a test-visible subscriber count on `PushChannel`, i.e. shipped API added for a
// test. Not done here; declared in the PR body.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createPushChannel } from './pushChannel';
import { mockChannelTransport } from '../test/mockChannelTransport';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeChannel = () => {
  const m = mockChannelTransport();
  const channel = createPushChannel<number>(
    { pushType: 'probe', requestType: 'request-probe', initial: 0, parse: (msg) => msg.v as number | undefined },
    m.transport,
  );
  /** React only flushes a listener-driven setState inside act(). */
  const push = (v: unknown) => act(() => m.push('probe', { v }));
  return { channel, push, sent: m.sent };
};

const renderProbe = (channel: ReturnType<typeof makeChannel>['channel']) => {
  const seen: number[] = [];
  const Probe = () => {
    seen.push(channel.use());
    return null;
  };
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  return { seen, unmount: () => act(() => root.unmount()) };
};

it('renders the current value, then RE-RENDERS on each push', () => {
  const { channel, push } = makeChannel();
  const { seen, unmount } = renderProbe(channel);
  expect(seen).toEqual([0]);

  push(1);
  push(2);

  // The re-render is the assertion: `use()` returning `get()` would leave `seen` at [0].
  expect(seen[seen.length - 1]).toBe(2);
  expect(seen.length).toBeGreaterThan(1);
  unmount();
});

it('an ignored push (parse → undefined) does not re-render', () => {
  const { channel, push } = makeChannel();
  const { seen, unmount } = renderProbe(channel);
  push(1);
  const settled = seen.length;

  push(undefined);

  expect(seen.length).toBe(settled);
  expect(seen[seen.length - 1]).toBe(1);
  unmount();
});

it('two live probes each render exactly once per push', () => {
  // A `use()` that re-subscribed on every render — `useEffect(() => onChange(setValue))`
  // with no dep array — fails this. Subscribing TWICE does not, and an earlier version of
  // this comment claimed it would: `listeners` is a Set and `setValue` is referentially
  // stable, so the second add is a no-op. Measured both ways.
  const { channel, push } = makeChannel();
  const a = renderProbe(channel);
  const b = renderProbe(channel);
  const aBefore = a.seen.length;
  const bBefore = b.seen.length;

  push(7);

  expect(a.seen.length - aBefore).toBe(1);
  expect(b.seen.length - bBefore).toBe(1);
  a.unmount();
  b.unmount();
});

it('mounting through the hook polls the host once, not once per mount', () => {
  const { channel, sent } = makeChannel();
  const a = renderProbe(channel);
  const b = renderProbe(channel);
  expect(sent).toEqual(['request-probe']);
  a.unmount();
  b.unmount();
});
