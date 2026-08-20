// R3-298 — no host protocol call may hang forever.
//
// These drive the real `withDeadline` and the real `consumeStream` against a promise /
// transport that NEVER settles, which is the scenario itself and one no live transport
// reproduces on demand. Fake timers keep them instant.
import { jest } from '@jest/globals';
import {
  ATTENDED_TIMEOUT_MS,
  NETWORK_TIMEOUT_MS,
  ProtocolCancelledError,
  ProtocolTimeoutError,
  STREAM_IDLE_TIMEOUT_MS,
  UNATTENDED_TIMEOUT_MS,
  attendanceOf,
  attendanceReason,
  firstFrameTimeoutFor,
  timeoutFor,
} from './protocolDeadline';
import { withDeadline } from './sandboxUtils';
import { consumeStream, StreamError, type StreamFrame, type StreamTransport } from './protocolStream';

const never = () => new Promise<never>(() => {});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the classification (R3-298 step 1)', () => {
  it('classifies pure channel round-trips as unattended', () => {
    for (const [scheme, method] of [
      ['theme', 'set'],
      ['editor', 'read'],
      ['ipc', 'post'],
      ['ipc', 'reveal'],
      ['vcs', 'refreshDiff'],
      ['fetch', 'fetch'],
    ] as const) {
      expect(attendanceOf(scheme, method)).toBe('unattended');
    }
  });

  it('classifies every human-blocking surface as attended, WITH a stated reason', () => {
    // Criterion 4 wants the classification enumerated and justified. Asserting the reason
    // is non-empty keeps the table from growing an entry nobody can explain.
    for (const [scheme, method] of [
      ['secrets', 'requestAddSecret'],
      ['secrets', 'requestSecret'],
      ['spaces', 'mount'],
      ['settings', 'open'],
      ['contribute', 'run'],
      ['task', 'invoke'],
      ['launch', 'create'],
      ['dnd', 'startDrag'],
      ['llm', 'chat'],
    ] as const) {
      expect(attendanceOf(scheme, method)).toBe('attended');
      expect(attendanceReason(scheme, method)).toBeTruthy();
    }
  });

  it('gives network calls their own bound, between the two', () => {
    expect(timeoutFor('fetch', 'fetch')).toBe(NETWORK_TIMEOUT_MS);
    expect(timeoutFor('theme', 'set')).toBe(UNATTENDED_TIMEOUT_MS);
    expect(timeoutFor('secrets', 'requestSecret')).toBe(ATTENDED_TIMEOUT_MS);
  });

  it('bounds EVERYTHING — nothing is classified as unbounded', () => {
    // "A long or absent deadline" was the licence; absent is declined, because absent is
    // the bug. This is the property the whole item buys, so it is asserted directly.
    for (const [scheme, method] of [
      ['theme', 'set'],
      ['fetch', 'fetch'],
      ['secrets', 'requestSecret'],
      ['llm', 'chat'],
      ['contribute', 'run'],
    ] as const) {
      expect(Number.isFinite(timeoutFor(scheme, method))).toBe(true);
      expect(Number.isFinite(firstFrameTimeoutFor(scheme, method))).toBe(true);
    }
  });

  it('puts the attended bound far beyond human reaction time', () => {
    // A bound that could abort someone mid-decision would be worse than none.
    expect(ATTENDED_TIMEOUT_MS).toBeGreaterThanOrEqual(5 * 60_000);
    expect(ATTENDED_TIMEOUT_MS).toBeGreaterThan(UNATTENDED_TIMEOUT_MS * 10);
  });
});

describe('withDeadline — one-shot calls (criteria 1 and 2)', () => {
  it('rejects an unattended call that never resolves, with a typed timeout', async () => {
    const p = withDeadline('theme', 'set', never);
    const assertion = expect(p).rejects.toMatchObject({
      name: 'ProtocolTimeoutError',
      code: 'timeout',
      call: 'theme:set',
      attendance: 'unattended',
    });
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS + 1);
    await assertion;
  });

  it('does NOT abort an attended call at the unattended deadline (criterion 2)', async () => {
    // The recorded hazard: a flat deadline aborts a passkey tap or a consent decision.
    let settle: (v: string) => void = () => {};
    const p = withDeadline('secrets', 'requestSecret', () => new Promise<string>((r) => (settle = r)));
    // Far past the unattended bound — a human is still deciding.
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS * 5);
    settle('the user finally tapped');
    await expect(p).resolves.toBe('the user finally tapped');
  });

  it('still releases an ABANDONED attended call rather than pinning the caller forever', async () => {
    const p = withDeadline('secrets', 'requestSecret', never);
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout', attendance: 'attended' });
    await jest.advanceTimersByTimeAsync(ATTENDED_TIMEOUT_MS + 1);
    await assertion;
  });

  it('lets a resolution a moment before the deadline win', async () => {
    let settle: (v: string) => void = () => {};
    const p = withDeadline('theme', 'set', () => new Promise<string>((r) => (settle = r)));
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS - 1);
    settle('in time');
    await expect(p).resolves.toBe('in time');
  });

  it('propagates a real rejection unchanged rather than masking it as a timeout', async () => {
    const boom = new Error('forbidden');
    await expect(withDeadline('theme', 'set', () => Promise.reject(boom))).rejects.toBe(boom);
  });

  it('honours a per-call override in both directions', async () => {
    const p = withDeadline('secrets', 'requestSecret', never, { timeoutMs: 1_000 });
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout', timeoutMs: 1_000 });
    await jest.advanceTimersByTimeAsync(1_001);
    await assertion;

    // Infinity is the documented escape hatch for a caller that owns its own wait.
    const forever = withDeadline('theme', 'set', never, { timeoutMs: Infinity });
    let settled = false;
    void forever.then(
      () => (settled = true),
      () => (settled = true),
    );
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS * 100);
    expect(settled).toBe(false);
  });

  it('cancels on an AbortSignal, before and during the call', async () => {
    const ac = new AbortController();
    const p = withDeadline('theme', 'set', never, { signal: ac.signal });
    const assertion = expect(p).rejects.toBeInstanceOf(ProtocolCancelledError);
    ac.abort();
    await assertion;

    const pre = new AbortController();
    pre.abort();
    await expect(withDeadline('theme', 'set', never, { signal: pre.signal })).rejects.toMatchObject({
      code: 'cancelled',
    });
  });

  it('fires onPending with the attended REASON, so a caller renders more than a spinner', async () => {
    const seen: unknown[] = [];
    const p = withDeadline('secrets', 'requestSecret', never, { onPending: (s) => seen.push(s) });
    const assertion = expect(p).rejects.toBeInstanceOf(ProtocolTimeoutError);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ call: 'secrets:requestSecret', attendance: 'attended' });
    expect((seen[0] as { reason?: string }).reason).toMatch(/passkey|picker|key entry/i);
    await jest.advanceTimersByTimeAsync(ATTENDED_TIMEOUT_MS);
    await assertion;
  });

  it('does not let a throwing onPending break the call it describes', async () => {
    let settle: (v: string) => void = () => {};
    const p = withDeadline('theme', 'set', () => new Promise<string>((r) => (settle = r)), {
      onPending: () => {
        throw new Error('a broken render callback');
      },
    });
    await jest.advanceTimersByTimeAsync(5_000);
    settle('unaffected');
    await expect(p).resolves.toBe('unaffected');
  });
});

describe('consumeStream — bounded by SILENCE, not duration (the dogfood hang)', () => {
  /** A transport that sends nothing back unless the test pushes a frame. */
  const stalled = () => {
    const handlers: ((m: { msgId?: number; stream?: StreamFrame }) => void)[] = [];
    const cancels: unknown[] = [];
    const transport: StreamTransport = {
      send: () => {},
      subscribe: (_type, h) => {
        handlers.push(h);
        return () => {};
      },
      cancel: (m) => cancels.push(m),
    };
    return {
      transport,
      cancels,
      push: (msgId: number, frame: StreamFrame) => handlers.forEach((h) => h({ msgId, stream: frame })),
    };
  };

  const drain = async (gen: AsyncGenerator<unknown, unknown, void>) => {
    const out: unknown[] = [];
    for await (const v of gen) out.push(v);
    return out;
  };

  it('reproduces the hang: chat() with no first frame now REJECTS instead of waiting forever', async () => {
    // The GLM dogfood failure — the first chat() of a session parks on a WebAuthn unseal
    // that never completes, and the surface simply waits, with no error and no cancel.
    const t = stalled();
    const gen = consumeStream(t.transport, 'protocol-llm', 'chat', [{}], 7);
    const assertion = expect(drain(gen)).rejects.toMatchObject({
      code: 'timeout',
      call: 'llm:chat',
      attendance: 'attended',
    });
    await jest.advanceTimersByTimeAsync(firstFrameTimeoutFor('llm', 'chat') + 1);
    await assertion;
  });

  it('sends the host a REAL cancel when it gives up — so generation and billing stop', async () => {
    // Streams own their msgId, so unlike a one-shot call this cancel actually reaches the
    // host's in-flight generator (R3-224's frame). Abandoning the app-side iterator alone
    // would leave the upstream provider streaming and BILLING.
    const t = stalled();
    const gen = consumeStream(t.transport, 'protocol-llm', 'chat', [{}], 42);
    const assertion = expect(drain(gen)).rejects.toMatchObject({ code: 'timeout' });
    await jest.advanceTimersByTimeAsync(firstFrameTimeoutFor('llm', 'chat') + 1);
    await assertion;
    expect(t.cancels).toEqual([{ type: 'protocol-llm', msgId: 42, cancel: true }]);
  });

  it('does NOT kill a long stream that is still producing — the bound is silence, not duration', async () => {
    // The bug a total-duration deadline would introduce: a healthy long generation aborted
    // mid-flight. This streams for far longer than any bound, one frame at a time.
    const t = stalled();
    const gen = consumeStream(t.transport, 'protocol-llm', 'chat', [{}], 1);
    const collected: unknown[] = [];
    const run = (async () => {
      for await (const v of gen) collected.push(v);
    })();

    for (let i = 0; i < 30; i++) {
      await jest.advanceTimersByTimeAsync(30_000); // 15 minutes total, well past every bound
      t.push(1, { kind: 'event', value: i });
      await Promise.resolve();
    }
    t.push(1, { kind: 'done', value: undefined });
    await run;
    expect(collected).toHaveLength(30);
    expect(t.cancels).toHaveLength(0);
  });

  it('bounds an idle GAP once frames are flowing', async () => {
    const t = stalled();
    const gen = consumeStream(t.transport, 'protocol-llm', 'chat', [{}], 2);
    const collected: unknown[] = [];
    const run = (async () => {
      for await (const v of gen) collected.push(v);
    })();
    t.push(2, { kind: 'event', value: 'first' });
    await Promise.resolve();
    const assertion = expect(run).rejects.toMatchObject({ code: 'timeout' });
    // The stream started, then went silent — wedged, not slow.
    await jest.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 1);
    await assertion;
    expect(collected).toEqual(['first']);
  });

  it('gives a caller a visible waiting state before it gives up', async () => {
    const seen: unknown[] = [];
    const t = stalled();
    const gen = consumeStream(t.transport, 'protocol-llm', 'chat', [{}], 3, undefined, {
      onPending: (s) => seen.push(s),
    });
    const assertion = expect(drain(gen)).rejects.toMatchObject({ code: 'timeout' });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ call: 'llm:chat', attendance: 'attended' });
    await jest.advanceTimersByTimeAsync(firstFrameTimeoutFor('llm', 'chat'));
    await assertion;
  });

  it('still honours an explicit AbortSignal, unchanged', async () => {
    const t = stalled();
    const ac = new AbortController();
    const gen = consumeStream(t.transport, 'protocol-llm', 'chat', [{}], 4, ac.signal);
    const assertion = expect(drain(gen)).rejects.toBeInstanceOf(StreamError);
    ac.abort();
    await jest.advanceTimersByTimeAsync(1);
    await assertion;
    expect(t.cancels).toEqual([{ type: 'protocol-llm', msgId: 4, cancel: true }]);
  });

  it('does not cancel a stream that ended normally', async () => {
    const t = stalled();
    const gen = consumeStream(t.transport, 'protocol-llm', 'chat', [{}], 5);
    const run = drain(gen);
    t.push(5, { kind: 'event', value: 'a' });
    await Promise.resolve();
    t.push(5, { kind: 'done', value: undefined });
    await run;
    expect(t.cancels).toHaveLength(0);
  });
});
