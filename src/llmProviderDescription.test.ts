// What an app may say about the provider that answered: its name, how its requests
// leave the browser, and the concrete model each tier resolves to.
//
// The rule under test is the same one `features.reasoning` established, applied to three
// fields where absence means something DIFFERENT. `reasoning` fails closed to `false`
// because "we do not know" and "does not reason" lead an app to the same correct
// behaviour. These three do not: a host that does not say which model answered must
// leave the app with nothing to render, never with a guess — so absent stays absent, and
// only an unusable value is dropped.
import { normalizeProviderInfo, type ChatProviderInfo } from './llm';

const base: ChatProviderInfo = {
  providerId: 'llm.chat.openrouter',
  hostVouched: true,
  features: { vision: true, tools: true, jsonMode: true, reasoning: true, maxContextTokens: 400000 },
};

const withWire = (extra: Record<string, unknown>): ChatProviderInfo =>
  ({ ...base, ...extra } as unknown as ChatProviderInfo);

describe('the enriched provider description', () => {
  it('carries the name, the executor and both resolved models through', () => {
    const out = normalizeProviderInfo(
      withWire({
        displayName: 'OpenRouter',
        executor: 'browser-direct',
        models: { fast: 'openai/gpt-5.4-mini', smart: 'openai/gpt-5.4' },
      }),
    )!;
    expect(out.displayName).toBe('OpenRouter');
    expect(out.executor).toBe('browser-direct');
    expect(out.models).toEqual({ fast: 'openai/gpt-5.4-mini', smart: 'openai/gpt-5.4' });
  });

  it('leaves all three ABSENT for a host that predates them — not empty, not guessed', () => {
    const out = normalizeProviderInfo(base)!;
    for (const key of ['displayName', 'executor', 'models'] as const) {
      expect(key in out).toBe(false);
    }
    // The fields that were always there are untouched by their absence.
    expect(out.providerId).toBe(base.providerId);
    expect(out.features.reasoning).toBe(true);
  });

  it('drops an executor outside the union rather than passing a value nobody can branch on', () => {
    expect('executor' in normalizeProviderInfo(withWire({ executor: 'carrier-pigeon' }))!).toBe(false);
    expect('executor' in normalizeProviderInfo(withWire({ executor: 7 }))!).toBe(false);
  });

  it('drops a half-answered model pair — one tier named is not an answer', () => {
    for (const models of [
      { fast: 'f' },
      { smart: 's' },
      { fast: '', smart: 's' },
      { fast: 1, smart: 2 },
      'nope',
      null,
    ]) {
      expect('models' in normalizeProviderInfo(withWire({ models }))!).toBe(false);
    }
  });

  it('drops an empty or non-string display name', () => {
    for (const displayName of ['', 0, {}, null]) {
      expect('displayName' in normalizeProviderInfo(withWire({ displayName }))!).toBe(false);
    }
  });

  it('never invents a model from the provider id — the app is told nothing, honestly', () => {
    const out = normalizeProviderInfo(withWire({ displayName: 'OpenRouter' }))!;
    expect(out.models).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('models');
  });
});
