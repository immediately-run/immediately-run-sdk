import { createPushChannel, type ChannelTransport } from '../src/pushChannel';

// A controllable mock transport: capture sent messages, and let tests fire pushes.
function mockTransport() {
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

interface FF {
  width: number;
}
const makeFF = (m: ReturnType<typeof mockTransport>) =>
  createPushChannel<FF>(
    {
      pushType: 'form-factor',
      requestType: 'request-form-factor',
      initial: { width: 0 },
      parse: (msg) =>
        msg.formFactor && typeof (msg.formFactor as FF).width === 'number' ? (msg.formFactor as FF) : undefined,
    },
    m.transport,
  );

describe('createPushChannel', () => {
  it('returns the initial value and sends one poll on first read', () => {
    const m = mockTransport();
    const ch = makeFF(m);
    expect(ch.get()).toEqual({ width: 0 });
    expect(m.sent).toEqual(['request-form-factor']);
  });

  it('does not re-register or re-poll on subsequent reads (lazy, once)', () => {
    const m = mockTransport();
    const ch = makeFF(m);
    ch.get();
    ch.get();
    ch.onChange(() => {});
    expect(m.sent).toEqual(['request-form-factor']); // exactly one poll
    expect(m.handlers.size).toBe(1); // one listener registered
  });

  it('updates the cached value and notifies listeners on a push', () => {
    const m = mockTransport();
    const ch = makeFF(m);
    const seen: FF[] = [];
    ch.onChange((v) => seen.push(v));
    expect(seen).toEqual([{ width: 0 }]); // immediate current value
    m.push('form-factor', { type: 'form-factor', formFactor: { width: 1280 } });
    expect(ch.get()).toEqual({ width: 1280 });
    expect(seen).toEqual([{ width: 0 }, { width: 1280 }]);
  });

  it('ignores a push that fails validation (parse → undefined)', () => {
    const m = mockTransport();
    const ch = makeFF(m);
    ch.get();
    m.push('form-factor', { type: 'form-factor', formFactor: { nope: true } });
    expect(ch.get()).toEqual({ width: 0 }); // unchanged
  });

  it('stops notifying after unsubscribe', () => {
    const m = mockTransport();
    const ch = makeFF(m);
    const seen: FF[] = [];
    const off = ch.onChange((v) => seen.push(v));
    off();
    m.push('form-factor', { type: 'form-factor', formFactor: { width: 800 } });
    expect(seen).toEqual([{ width: 0 }]); // only the immediate value
  });

  it('works without a requestType (push-only channel) — no poll sent', () => {
    const m = mockTransport();
    const ch = createPushChannel<{ url: string }>(
      {
        pushType: 'urlchange',
        initial: { url: '' },
        parse: (msg) => (typeof msg.url === 'string' ? { url: msg.url } : undefined),
      },
      m.transport,
    );
    expect(ch.get()).toEqual({ url: '' });
    expect(m.sent).toEqual([]); // no poll
    m.push('urlchange', { type: 'urlchange', url: '/x' });
    expect(ch.get()).toEqual({ url: '/x' });
  });

  it('survives a throwing sendMessage (transport not ready)', () => {
    const m = mockTransport();
    m.transport.sendMessage = () => {
      throw new Error('not ready');
    };
    const ch = makeFF(m);
    expect(() => ch.get()).not.toThrow();
    // a later push still updates
    m.push('form-factor', { type: 'form-factor', formFactor: { width: 42 } });
    expect(ch.get()).toEqual({ width: 42 });
  });
});
