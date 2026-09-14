// `chat()` carries the optional per-conversation `model` choice straight through to the wire
// (R3-620, LLM_AND_AGENTS_SPEC §0). Nothing in the SDK transforms it — it is the host's job to
// validate the pair against the user's connected providers — so the assertion is that the field
// rides the request untouched while `signal` is still peeled out SDK-side (an AbortSignal can't
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
});
