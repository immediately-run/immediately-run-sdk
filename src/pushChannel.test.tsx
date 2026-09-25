/**
 * @jest-environment jsdom
 */
// `createPushChannel` — the subscription mechanism every push channel is built on, tested
// directly against its injectable `ChannelTransport` rather than through a consumer.
//
// This file exists because of a round-2 finding on R3-708: a test named "unmounting
// unsubscribes" could not observe unsubscribing. Deleting `use()`'s effect cleanup leaves
// every consumer test green, because React 19 no-ops a setState on an unmounted root and
// a leaked listener has no other outward effect. So the property has to be pinned where
// the listener set is reachable — here, one layer down.
//
// Honest limit, MEASURED, not assumed: `use()`'s effect cleanup is still not covered — by
// this file or any other. Dropping it (`useEffect(() => onChange(setValue), [])` ->
// `useEffect(() => { onChange(setValue); }, [])`) leaves the whole suite at 872/872. I
// expected the accumulate test below to catch it and it does not: the leaked listeners are
// dead roots' `setValue`s, React no-ops every one, and the LIVE probe still renders exactly
// once per push. There is no input that distinguishes them from outside.
//
// What this file does pin is the mechanism `use()` delegates to — `onChange`'s unsubscribe
// really removes the listener — plus the per-mount subscription count and the lazy poll.
// Covering the cleanup itself needs a test-visible subscriber count on `PushChannel`, i.e.
// shipped API added for a test. Not done here; declared in the PR body instead.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createPushChannel } from './pushChannel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (msg: Record<string, unknown>) => void;

/** A transport whose push listeners are reachable from the test. */
const makeTransport = () => {
  const handlers: Listener[] = [];
  const sent: string[] = [];
  return {
    transport: {
      sendMessage: (type: string) => {
        sent.push(type);
      },
      addListener: (_type: string, h: Listener) => {
        handlers.push(h);
        return () => {
          handlers.splice(handlers.indexOf(h), 1);
        };
      },
    },
    push: (v: unknown) => handlers.forEach((h) => h({ v })),
    sent,
  };
};

const makeChannel = () => {
  const t = makeTransport();
  const channel = createPushChannel<number>(
    { pushType: 'probe', requestType: 'request-probe', initial: 0, parse: (msg) => msg.v as number | undefined },
    t.transport,
  );
  return { channel, ...t };
};

describe('onChange — the unsubscribe `use()` returns from its effect', () => {
  it('fires immediately with the current value, then on every push', () => {
    const { channel, push } = makeChannel();
    const seen: number[] = [];
    channel.onChange((v) => seen.push(v));
    expect(seen).toEqual([0]);
    push(1);
    push(2);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('the returned function REMOVES the listener — a later push does not reach it', () => {
    const { channel, push } = makeChannel();
    const a: number[] = [];
    const b: number[] = [];
    const offA = channel.onChange((v) => a.push(v));
    channel.onChange((v) => b.push(v));

    push(1);
    offA();
    push(2);

    // a stopped at the unsubscribe; b kept going. Returning a no-op from onChange — the
    // shape a leaked cleanup produces — makes this fail.
    expect(a).toEqual([0, 1]);
    expect(b).toEqual([0, 1, 2]);
  });

  it('unsubscribing twice is harmless', () => {
    const { channel, push } = makeChannel();
    const seen: number[] = [];
    const off = channel.onChange((v) => seen.push(v));
    off();
    expect(() => off()).not.toThrow();
    push(1);
    expect(seen).toEqual([0]);
  });
});

describe('use() adds exactly one listener per mount, and does not accumulate', () => {
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

  /** React only flushes a listener-driven setState inside act(). */
  const pushActed = (push: (v: unknown) => void, v: unknown) => act(() => push(v));

  it('mounting and unmounting repeatedly leaves the same number of renders per push', () => {
    // This pins one-render-per-push for the LIVE probe, which is a real property: a
    // double-subscribing `use()` (adding the listener without `[]`, or twice) fails it.
    // It does NOT catch a leaked cleanup — measured, see the header. Keeping it named for
    // what it holds rather than what I hoped it held.
    const { channel, push } = makeChannel();

    for (let i = 0; i < 5; i++) {
      const { unmount } = renderProbe(channel);
      unmount();
    }

    const live = renderProbe(channel);
    const before = live.seen.length;
    pushActed(push, 99);
    expect(live.seen.length - before).toBe(1);
    expect(live.seen[live.seen.length - 1]).toBe(99);
    live.unmount();
  });

  it('two live probes each render once per push', () => {
    const { channel, push } = makeChannel();
    const a = renderProbe(channel);
    const b = renderProbe(channel);
    const aBefore = a.seen.length;
    const bBefore = b.seen.length;

    pushActed(push, 7);

    expect(a.seen.length - aBefore).toBe(1);
    expect(b.seen.length - bBefore).toBe(1);
    a.unmount();
    b.unmount();
  });
});

it('the channel polls once, lazily, on first read — not per subscriber', () => {
  const { channel, sent } = makeChannel();
  expect(sent).toEqual([]); // nothing until someone reads
  channel.get();
  channel.get();
  channel.onChange(() => {});
  expect(sent).toEqual(['request-probe']);
});

it('a parse returning undefined is ignored and does not notify', () => {
  const t = makeTransport();
  const channel = createPushChannel<number>(
    { pushType: 'probe', initial: 0, parse: (msg) => (typeof msg.v === 'number' ? msg.v : undefined) },
    t.transport,
  );
  const seen: number[] = [];
  channel.onChange((v) => seen.push(v));
  t.push('not a number');
  expect(seen).toEqual([0]);
  expect(channel.get()).toBe(0);
});
