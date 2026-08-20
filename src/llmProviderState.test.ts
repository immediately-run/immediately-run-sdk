// The `llm-provider` describe channel's THREE states (R3-300).
//
// Two states was the bug: `describeChat()` returned `null` both when no provider was
// configured and when the channel had never answered, so a consuming app could not tell
// "you need a key" from "ask again in a moment" — and grove's embedded agent rendered a
// "connect a key" banner at a user who had one.
import { jest } from '@jest/globals';
import { createPushChannel, type ChannelTransport } from './pushChannel';

/** Rebuild the channel over a fake transport so pushes can be driven frame by frame. */
const harness = () => {
  const handlers: Record<string, (m: Record<string, unknown>) => void> = {};
  const polls: string[] = [];
  const transport: ChannelTransport = {
    sendMessage: (type) => polls.push(type),
    addListener: (type, h) => {
      handlers[type] = h;
      return () => delete handlers[type];
    },
  };
  type State =
    | { status: 'unknown' }
    | { status: 'not-configured' }
    | { status: 'configured'; provider: { providerId: string } };
  const channel = createPushChannel<State>(
    {
      pushType: 'llm-provider',
      requestType: 'request-llm-provider',
      initial: { status: 'unknown' },
      parse: (msg) => {
        if (!('provider' in msg)) return undefined;
        const p = msg.provider as { providerId: string } | null;
        return p ? { status: 'configured', provider: p } : { status: 'not-configured' };
      },
    },
    transport,
  );
  return { channel, polls, push: (m: Record<string, unknown>) => handlers['llm-provider']?.(m) };
};

describe('the three states', () => {
  it('starts UNKNOWN — the host has not answered, which is not "no provider"', () => {
    const h = harness();
    expect(h.channel.get()).toEqual({ status: 'unknown' });
  });

  it('polls the host on first read, so a late-mounting app is not stuck at unknown', () => {
    const h = harness();
    h.channel.get();
    expect(h.polls).toEqual(['request-llm-provider']);
  });

  it('distinguishes NOT-CONFIGURED from unknown (exit criterion 2)', () => {
    const h = harness();
    expect(h.channel.get().status).toBe('unknown');
    h.push({ provider: null });
    expect(h.channel.get()).toEqual({ status: 'not-configured' });
  });

  it('reports CONFIGURED with the provider', () => {
    const h = harness();
    h.channel.get(); // the channel starts lazily on first read — see the test below
    h.push({ provider: { providerId: 'llm.chat.anthropic' } });
    expect(h.channel.get()).toEqual({
      status: 'configured',
      provider: { providerId: 'llm.chat.anthropic' },
    });
  });

  it('ignores a message with no `provider` key rather than resetting state', () => {
    const h = harness();
    h.channel.get();
    h.push({ provider: { providerId: 'p' } });
    h.push({ somethingElse: true });
    expect(h.channel.get().status).toBe('configured');
  });

  it('updates live when the default provider changes (exit criterion 3)', () => {
    const h = harness();
    const seen: string[] = [];
    h.channel.onChange((s) => seen.push(s.status === 'configured' ? s.provider.providerId : s.status));
    h.push({ provider: { providerId: 'llm.chat.openrouter' } });
    h.push({ provider: { providerId: 'llm.chat.anthropic' } });
    h.push({ provider: null });
    expect(seen).toEqual(['unknown', 'llm.chat.openrouter', 'llm.chat.anthropic', 'not-configured']);
  });
});

describe('lazy start', () => {
  it('drops a push that arrives before the first read, and recovers it by polling', () => {
    // Worth pinning: the channel does not subscribe until something reads it, so a host
    // push during app boot can be missed. The `request-*` poll on first read is what makes
    // that safe — without it a late-mounting app would sit at `unknown` forever.
    const h = harness();
    h.push({ provider: { providerId: 'missed' } });
    expect(h.channel.get()).toEqual({ status: 'unknown' });
    expect(h.polls).toEqual(['request-llm-provider']);
    h.push({ provider: { providerId: 'answered' } });
    expect(h.channel.get()).toMatchObject({ status: 'configured' });
  });
});

describe('the compatibility collapse', () => {
  it('maps both unknown and not-configured to null, as the old surface did', () => {
    // `describeChat()` keeps its shape so an app written against it still compiles
    // (ways_of_working §6). The point of the new surface is that it no longer has to.
    const h = harness();
    h.channel.get();
    const asOld = () => {
      const s = h.channel.get();
      return s.status === 'configured' ? s.provider : null;
    };
    expect(asOld()).toBeNull();
    h.push({ provider: null });
    expect(asOld()).toBeNull();
    h.push({ provider: { providerId: 'p' } });
    expect(asOld()).toEqual({ providerId: 'p' });
  });
});
