// R3-335 — the reasoning surface on the `llm.chat@1` slot.
//
// Two things are worth a test here and the rest is types: that a host predating
// `features.reasoning` cannot make an app think a provider reasons (fail closed),
// and that a reasoning block round-trips through `ContentPart` with its signature —
// the field whose loss is the silent, degrade-not-error failure this item exists to
// prevent.
import { normalizeProviderInfo, type ChatDelta, type ChatProviderInfo, type ContentPart } from './llm';

describe('features.reasoning normalization', () => {
  it('defaults to false when a host predating the field omits it', () => {
    const legacy = {
      providerId: 'llm.chat.openrouter',
      hostVouched: true,
      features: { vision: true, tools: true, jsonMode: true, maxContextTokens: 400000 },
    } as unknown as ChatProviderInfo;
    const out = normalizeProviderInfo(legacy)!;
    expect(out.features.reasoning).toBe(false);
    // `'reasoning' in features` must agree with the value — the whole point.
    expect('reasoning' in out.features).toBe(true);
  });

  it('preserves an explicit true, and leaves the other features alone', () => {
    const info: ChatProviderInfo = {
      providerId: 'llm.chat.anthropic',
      hostVouched: true,
      features: { vision: true, tools: true, jsonMode: false, reasoning: true, maxContextTokens: 1000000 },
    };
    const out = normalizeProviderInfo(info)!;
    expect(out.features).toEqual(info.features);
  });

  it('passes an unbound provider through as null', () => {
    expect(normalizeProviderInfo(null)).toBeNull();
  });
});

describe('the reasoning wire shapes', () => {
  it('carries the signature a provider may require on the echo', () => {
    const delta: ChatDelta = { type: 'reasoning', text: 'let me check the imports', signature: 'sig-abc' };
    const part: ContentPart =
      delta.type === 'reasoning'
        ? { type: 'reasoning', text: delta.text, signature: delta.signature }
        : { type: 'text', text: '' };
    expect(part).toEqual({ type: 'reasoning', text: 'let me check the imports', signature: 'sig-abc' });
  });

  it('represents redacted reasoning as opaque bytes with no text to render', () => {
    const part: ContentPart = { type: 'reasoning-redacted', data: 'AAAA' };
    expect('text' in part).toBe(false);
  });

  it('streams incrementally and terminally, so a caller can render live and echo whole', () => {
    const stream: ChatDelta[] = [
      { type: 'reasoning-delta', text: 'let me ' },
      { type: 'reasoning-delta', text: 'check' },
      { type: 'reasoning', text: 'let me check', signature: 's' },
      { type: 'text-delta', text: 'Done.' },
    ];
    const live = stream
      .filter((d) => d.type === 'reasoning-delta')
      .map((d) => (d as { text: string }).text)
      .join('');
    const whole = stream.find((d) => d.type === 'reasoning') as { text: string } | undefined;
    expect(live).toBe('let me check');
    expect(whole?.text).toBe(live);
  });
});
