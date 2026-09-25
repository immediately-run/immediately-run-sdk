// `chat()` carries the optional per-conversation `model` choice straight through to the wire
// (R3-620, LLM_AND_AGENTS_SPEC §0). Nothing in the SDK transforms it — it is the host's job to
// validate the pair against the user's connected providers — so the assertion is that the field
// rides the request untouched while `signal` is still peeled OUT SDK-side (an AbortSignal can't
// cross the postMessage boundary).
import { chat } from './llm';

jest.mock('./catalog', () => ({
  invokeStream: jest.fn(),
}));
jest.mock('./pushChannel', () => ({
  createPushChannel: jest.fn(() => ({ get: () => null, subscribe: () => () => {} })),
}));

import { invokeStream } from './catalog';

const mockInvoke = invokeStream as jest.MockedFunction<typeof invokeStream>;

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('chat() carries the model choice (R3-620)', () => {
  it('passes a concrete model pair through untouched', () => {
    const req = {
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }],
      model: { providerId: 'llm.chat.anthropic', model: 'claude-opus-4-8' },
    };
    chat(req);
    const params = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.model).toEqual({ providerId: 'llm.chat.anthropic', model: 'claude-opus-4-8' });
    // `model` does not swallow the abstract hint contract: both may be present.
    expect(params.modelHint).toBeUndefined();
  });

  it('still passes only modelHint when no model is named', () => {
    const req = {
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }],
      modelHint: 'smart' as const,
    };
    chat(req);
    const params = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(params.modelHint).toBe('smart');
    expect(params.model).toBeUndefined();
  });

  it('peels signal out SDK-side: it is the third arg, never in the wire params', () => {
    const signal = new AbortController().signal;
    const req = {
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }],
      model: { providerId: 'llm.chat.anthropic', model: 'claude-opus-4-8' },
      signal,
    };
    chat(req);
    const [scheme, params, sig] = mockInvoke.mock.calls[0];
    expect(scheme).toBe('llm:chat');
    expect('signal' in (params as object)).toBe(false);
    expect(sig).toBe(signal);
  });
});

// R3-688 review round 1 (BLOCKING) — the line that reads the host's mark off the wire,
// `ungrantedMark = msg.ungranted === true`, was covered by nothing. The four derivation
// tests call `deriveChatProviderState` directly and prove only the pure function, so
// severing the read (`= false`) left the whole 805-test suite green — the feature's entire
// reason for existing, silently disconnected.
//
// These drive the REAL `parse` that `llm.ts` hands to `createPushChannel`, captured from
// the mock, so the wire read is exercised rather than reasoned about.
describe('the host ungranted mark is read off the wire (R3-688)', () => {
  type ParseFn = (msg: Record<string, unknown>) => unknown;

  // Load `llm.ts` fresh and hand back the `parse` it registered plus its state reader.
  const load = (): { parse: ParseFn; describeChatState: () => { status: string } } => {
    jest.resetModules();
    let parse: ParseFn | undefined;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const push = require('./pushChannel') as { createPushChannel: jest.Mock };
    push.createPushChannel.mockImplementation((opts: { parse: ParseFn }) => {
      parse = opts.parse;
      let current: unknown = null;
      return {
        get: () => current,
        subscribe: () => () => {},
        onChange: () => () => {},
        use: () => current,
        __set: (v: unknown) => {
          current = v;
        },
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./llm') as { describeChatState: () => { status: string } };
    if (!parse) throw new Error('llm.ts did not register a parse with createPushChannel');
    return { parse, describeChatState: mod.describeChatState };
  };

  it('a grantless answer CARRYING the mark reads as `ungranted`', () => {
    const { parse, describeChatState } = load();
    parse({ provider: null, ungranted: true });
    expect(describeChatState().status).toBe('ungranted');
  });

  it('a grantless answer WITHOUT the mark reads as `not-configured`, not `ungranted`', () => {
    // The other half of the pair: without it, a parse that hard-codes `true` also passes.
    const { parse, describeChatState } = load();
    parse({ provider: null });
    expect(describeChatState().status).toBe('not-configured');
  });

  it('`ungranted: false` does not mark', () => {
    const { parse, describeChatState } = load();
    parse({ provider: null, ungranted: false });
    expect(describeChatState().status).toBe('not-configured');
  });

  it('a truthy NON-BOOLEAN does not mark — the wire declares a boolean', () => {
    // `=== true`, not `!!`. Named separately because the `false` case above cannot tell
    // the two apart (`!!false === false`), so it passed under a `!!` mutation and I had
    // called it "not truthy-read" — a test named for a property it did not hold.
    const { parse, describeChatState } = load();
    parse({ provider: null, ungranted: 'yes' });
    expect(describeChatState().status).toBe('not-configured');
  });

  it('before any answer the state is `unknown`, mark or no mark', () => {
    const { describeChatState } = load();
    expect(describeChatState().status).toBe('unknown');
  });
});
