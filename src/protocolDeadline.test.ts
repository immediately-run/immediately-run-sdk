// R3-298 — no host protocol call may hang forever.
//
// These drive the real `withDeadline` and the real `consumeStream` against a promise /
// transport that NEVER settles, which is the scenario itself and one no live transport
// reproduces on demand. Fake timers keep them instant.
import { jest } from '@jest/globals';
import {
  ATTENDED_FIRST_FRAME_MS,
  ATTENDED_TIMEOUT_MS,
  NETWORK_TIMEOUT_MS,
  ProtocolCancelledError,
  ProtocolTimeoutError,
  STREAM_IDLE_TIMEOUT_MS,
  UNATTENDED_TIMEOUT_MS,
  attendanceOf,
  attendanceReason,
  boundsFor,
  firstFrameTimeoutFor,
  timeoutFor,
} from './protocolDeadline';
import { withDeadline } from './sandboxUtils';
import { consumeStream, StreamError, type StreamFrame, type StreamTransport } from './protocolStream';

const never = () => new Promise<never>(() => {});

/**
 * A fake host transport, installed on the §4 discovery global so the REAL host-attention
 * push channel (`hostAttention.ts`) resolves through it. Driving the real channel — rather
 * than injecting a stub source into `withDeadline` — is the point: the suspension only
 * matters if the wire, the parse, and the deadline agree, and a stub would prove none of
 * that.
 *
 * Installed ONCE, at module scope, and never swapped. The channel registers its listener
 * with whatever transport it first resolved and caches `started`, so a per-test transport
 * would be silently ignored from the second test onward — a fixture that looks like it
 * works and asserts nothing. `beforeEach` resets the VALUE instead.
 */
type HostMsg = Record<string, unknown>;
const attentionHandlers = new Set<(msg: HostMsg) => void>();
const polled: string[] = [];
(globalThis as Record<string, unknown>).__immediatelyRun__ = {
  transport: {
    sendMessage: (type: string) => polled.push(type),
    protocolRequest: () => new Promise<never>(() => {}),
    onMessage: (handler: (msg: HostMsg) => void) => {
      attentionHandlers.add(handler);
      return { dispose: () => attentionHandlers.delete(handler) };
    },
  },
};
const pushAttention = (attention: HostMsg) =>
  [...attentionHandlers].forEach((h) => h({ type: 'host-attention', attention }));
const host = {
  /** The host raises a prompt of `kind`. */
  prompt: (kind: string) => pushAttention({ awaiting: true, kind, since: Date.now() }),
  /** The prompt goes away (dismissed, answered, or cancelled). */
  clear: () => pushAttention({ awaiting: false, kind: null, since: null }),
  /** Poll types the SDK sent — proves the channel asked for a snapshot on first read. */
  polls: () => [...polled],
};

beforeEach(() => {
  jest.useFakeTimers();
  host.clear(); // the channel outlives a test; never inherit the last one's prompt
});
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

  it('does NOT abort an attended call at the unattended deadline WHILE THE HOST IS ASKING', async () => {
    // The recorded hazard: a flat deadline aborts a passkey tap or a consent decision.
    // R3-307 narrowed the protection from "any may-prompt method, always" to "while the
    // host says a person is actually being asked" — so this test now supplies the signal.
    // Its counterpart below asserts the other half: no signal, no long wait.
    let settle: (v: string) => void = () => {};
    const p = withDeadline('secrets', 'requestSecret', () => new Promise<string>((r) => (settle = r)));
    host.prompt('passkey');
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

describe('the host-attention signal makes the attended bound a fact, not a guess (R3-307)', () => {
  it('reports a fault on the UNATTENDED bound when the grant is already held', async () => {
    // The correctness gain, half one. Nothing prompts, so nobody is being asked, so a
    // `spaces:mount` that never answers is a FAULT — and R3-298 made the caller wait ten
    // minutes to hear it, because the table could not tell this path from a first use.
    const p = withDeadline('spaces', 'mount', never);
    const assertion = expect(p).rejects.toMatchObject({
      code: 'timeout',
      call: 'spaces:mount',
      // Still classified attended — the METHOD may prompt. What changed is which of its two
      // bounds elapsed, and `bound` is how a reader tells those apart.
      attendance: 'attended',
      bound: 'idle',
      timeoutMs: UNATTENDED_TIMEOUT_MS,
    });
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS + 1);
    await assertion;
  });

  it('suspends the SAME call for as long as the first-use consent prompt is up', async () => {
    // The correctness gain, half two: same scheme, same method, opposite outcome — decided
    // by the host's live signal rather than by a table that cannot see the difference.
    let settle: (v: string) => void = () => {};
    const p = withDeadline('spaces', 'mount', () => new Promise<string>((r) => (settle = r)));
    host.prompt('consent');
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS * 8);
    host.clear();
    settle('the user allowed it');
    await expect(p).resolves.toBe('the user allowed it');
  });

  it('restarts the idle bound when the prompt clears — so a post-consent hang is still caught', async () => {
    const p = withDeadline('spaces', 'mount', never);
    const assertion = expect(p).rejects.toMatchObject({ bound: 'idle' });
    host.prompt('consent');
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS * 3); // deciding — no fault
    host.clear();
    await jest.advanceTimersByTimeAsync(UNATTENDED_TIMEOUT_MS + 1); // host went quiet — fault
    await assertion;
  });

  it('still releases an ABANDONED prompt at the absolute ceiling (criterion 3)', async () => {
    // The signal may EXTEND a deadline, never remove it. A prompt nobody ever answers must
    // not pin the caller forever, or R3-307 would have reintroduced the hang R3-298 fixed.
    const p = withDeadline('spaces', 'mount', never);
    const assertion = expect(p).rejects.toMatchObject({
      code: 'timeout',
      attendance: 'attended',
      bound: 'ceiling',
      timeoutMs: ATTENDED_TIMEOUT_MS,
    });
    host.prompt('consent'); // …and the user walks away. The prompt stays up forever.
    await jest.advanceTimersByTimeAsync(ATTENDED_TIMEOUT_MS + 1);
    await assertion;
  });

  it('names the passkey in onPending, and re-fires when the prompt appears (criterion 1)', async () => {
    // "Waiting for your passkey…" instead of a spinner is most of the user's ability to
    // act — the exact gap on the setup wizard's Test-connection step.
    const seen: Array<{ awaiting?: { kind: string | null } }> = [];
    const p = withDeadline('llm', 'chat', never, { onPending: (st) => seen.push(st) });
    const assertion = expect(p).rejects.toBeInstanceOf(ProtocolTimeoutError);

    await jest.advanceTimersByTimeAsync(5_000);
    expect(seen).toHaveLength(1);
    expect(seen[0].awaiting).toBeUndefined(); // nothing on screen yet — a generic wait

    host.prompt('passkey');
    await jest.advanceTimersByTimeAsync(1);
    expect(seen).toHaveLength(2);
    expect(seen[1].awaiting).toEqual({ kind: 'passkey', since: expect.any(Number) });

    host.clear();
    await jest.advanceTimersByTimeAsync(1);
    expect(seen[2].awaiting).toBeUndefined(); // tapped — back to a plain wait

    await jest.advanceTimersByTimeAsync(ATTENDED_FIRST_FRAME_MS + NETWORK_TIMEOUT_MS);
    await assertion;
  });

  it('polls the host for a snapshot, so a call started mid-prompt is not left guessing', async () => {
    const p = withDeadline('spaces', 'mount', never);
    const assertion = expect(p).rejects.toBeInstanceOf(ProtocolTimeoutError);
    expect(host.polls()).toContain('request-host-attention');
    await jest.advanceTimersByTimeAsync(ATTENDED_TIMEOUT_MS + 1);
    await assertion;
  });

  it('does NOT shorten a bound the signal could never cover', () => {
    // A task app's interaction and the contribute diff-approval are human-paced, but they
    // are not HOST prompts — no attention frame is ever pushed for them. Dropping them to
    // the short bound would abort a person mid-decision with no signal able to save them.
    for (const scheme of ['task', 'contribute', 'launch', 'dnd'] as const) {
      expect(boundsFor(scheme, 'anything')).toEqual({
        idleMs: ATTENDED_TIMEOUT_MS,
        ceilingMs: ATTENDED_TIMEOUT_MS,
      });
    }
    // The covered schemes DO drop — that is the whole point.
    expect(boundsFor('spaces', 'mount').idleMs).toBe(UNATTENDED_TIMEOUT_MS);
    expect(boundsFor('secrets', 'requestSecret').idleMs).toBe(UNATTENDED_TIMEOUT_MS);
    // …except llm, whose idle case is an upstream model call, not a channel round-trip.
    expect(boundsFor('llm', 'chat').idleMs).toBe(NETWORK_TIMEOUT_MS);
    // An unattended call has one bound, not two — nothing to suspend.
    expect(boundsFor('theme', 'set')).toEqual({
      idleMs: UNATTENDED_TIMEOUT_MS,
      ceilingMs: UNATTENDED_TIMEOUT_MS,
    });
  });

  it('never lets the signal stretch a bound the CALLER named', async () => {
    // An explicit `timeoutMs` is the whole bound. Silently extending it past what a caller
    // asked for would be the same class of surprise this machinery exists to remove.
    const p = withDeadline('spaces', 'mount', never, { timeoutMs: 1_000 });
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout', timeoutMs: 1_000 });
    host.prompt('consent');
    await jest.advanceTimersByTimeAsync(1_001);
    await assertion;
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
