// What an app may say about the provider that answered: its name, how its requests
// leave the browser, and the concrete model each tier resolves to.
//
// The rule under test is the same one `features.reasoning` established, applied to three
// fields where absence means something DIFFERENT. `reasoning` fails closed to `false`
// because "we do not know" and "does not reason" lead an app to the same correct
// behaviour. These three do not: a host that does not say which model answered must
// leave the app with nothing to render, never with a guess — so absent stays absent, and
// only an unusable value is dropped.
import {
  normalizeProviderInfo,
  type ChatModelInfo,
  type ChatProviderChoice,
  type ChatProviderInfo,
  type ChatRequest,
  type ModelKind,
} from './llm';
import type { ModelKind as ProtocolModelKind } from '@immediately-run/sandbox-protocol';

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

  it('carries a well-formed connectedProviders list through (R3-620)', () => {
    const out = normalizeProviderInfo(
      withWire({
        connectedProviders: [
          {
            providerId: 'llm.chat.anthropic',
            displayName: 'Anthropic',
            models: ['claude-opus-4-8', 'claude-sonnet-4-5'],
          },
          { providerId: 'llm.chat.openrouter', displayName: 'OpenRouter', models: ['openai/gpt-5.4'] },
        ],
      }),
    )!;
    expect(out.connectedProviders).toEqual([
      { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: ['claude-opus-4-8', 'claude-sonnet-4-5'] },
      { providerId: 'llm.chat.openrouter', displayName: 'OpenRouter', models: ['openai/gpt-5.4'] },
    ]);
  });

  it('carries a choice’s features through, normalized like the top-level ones (R3-1074)', () => {
    const out = normalizeProviderInfo(
      withWire({
        connectedProviders: [
          {
            providerId: 'llm.chat.anthropic',
            displayName: 'Anthropic',
            models: ['claude-opus-4-8'],
            features: { vision: true, tools: true, jsonMode: false, maxContextTokens: 1000000 },
          },
          // a host predating the field: the choice keeps NO features key, honestly
          { providerId: 'llm.chat.openrouter', displayName: 'OpenRouter', models: ['openai/gpt-5.4'] },
        ],
      }),
    )!;
    expect(out.connectedProviders).toEqual([
      {
        providerId: 'llm.chat.anthropic',
        displayName: 'Anthropic',
        models: ['claude-opus-4-8'],
        features: { vision: true, tools: true, jsonMode: false, reasoning: false, maxContextTokens: 1000000 },
      },
      { providerId: 'llm.chat.openrouter', displayName: 'OpenRouter', models: ['openai/gpt-5.4'] },
    ]);
  });

  it('drops a choice’s features when the wire value is not an object (R3-1074)', () => {
    const out = normalizeProviderInfo(
      withWire({
        connectedProviders: [
          { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: [], features: 'yes' },
        ],
      }),
    )!;
    expect(out.connectedProviders).toEqual([
      { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: [] },
    ]);
  });

  it('drops a choice’s features when the wire value is an array, empty, or partial (R3-1074)', () => {
    // A present half-answer must never render as fact: `typeof [] === 'object'` is the
    // classic guard hole, and an object missing a required key would emit a
    // `ChatFeatures` with `maxContextTokens: undefined` under the published type.
    const choice = (features: unknown) => ({
      providerId: 'llm.chat.anthropic',
      displayName: 'Anthropic',
      models: [],
      features,
    });
    for (const bad of [
      [],
      {},
      { vision: true },
      { vision: true, tools: true, jsonMode: false, maxContextTokens: 'big' },
    ]) {
      const out = normalizeProviderInfo(withWire({ connectedProviders: [choice(bad)] }))!;
      expect(out.connectedProviders).toEqual([
        { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: [] },
      ]);
    }
  });

  it('leaves connectedProviders ABSENT for a host that predates the field', () => {
    const out = normalizeProviderInfo(base)!;
    expect('connectedProviders' in out).toBe(false);
  });

  it('drops a non-array or empty connectedProviders, and malformed entries', () => {
    // Not a list at all → absent.
    expect('connectedProviders' in normalizeProviderInfo(withWire({ connectedProviders: 'nope' }))!).toBe(false);
    expect('connectedProviders' in normalizeProviderInfo(withWire({ connectedProviders: {} }))!).toBe(false);
    // Every entry malformed → absent (not an empty list, which would read as "you chose nothing").
    expect(
      'connectedProviders' in
        normalizeProviderInfo(withWire({ connectedProviders: [{ providerId: '', displayName: 'x', models: [] }] }))!,
    ).toBe(false);
    // A mixture keeps only the usable entries, and drops non-string model names.
    const out = normalizeProviderInfo(
      withWire({
        connectedProviders: [
          { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: ['m1', '', 7, 'm2'] },
          { providerId: '', displayName: 'Bad', models: ['x'] },
        ],
      }),
    )!;
    expect(out.connectedProviders).toEqual([
      { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: ['m1', 'm2'] },
    ]);
  });

  // R3-1127: the shape site-main#761's `connectedProviderChoices` sends for a frame holding
  // llm:model + llm:chooseModel — rows of src/editor/llm/nonChatModels.json mapped to
  // `{ id, name, dimensions? }` (maxInputs is in the overlay; the SDK carries it when sent).
  const openAiByKind = {
    embedding: [
      { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', dimensions: 1536 },
      { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', dimensions: 3072, maxInputs: 2048 },
    ],
  };

  it('carries a choice’s modelsByKind through, and leaves it absent for an older host (R3-1127)', () => {
    const out = normalizeProviderInfo(
      withWire({
        connectedProviders: [
          { providerId: 'llm.chat.openai', displayName: 'OpenAI', models: ['gpt-5.4'], modelsByKind: openAiByKind },
          // a host predating the field, or a frame without llm:model: no modelsByKind key
          { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: ['claude-opus-4-8'] },
        ],
      }),
    )!;
    expect(out.connectedProviders).toEqual([
      { providerId: 'llm.chat.openai', displayName: 'OpenAI', models: ['gpt-5.4'], modelsByKind: openAiByKind },
      { providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models: ['claude-opus-4-8'] },
    ]);
    expect('modelsByKind' in out.connectedProviders![1]).toBe(false);
  });

  it('rebuilds modelsByKind: unknown kinds, malformed entries and extra keys are dropped (R3-1127)', () => {
    const choice = (modelsByKind: unknown) =>
      normalizeProviderInfo(
        withWire({
          connectedProviders: [{ providerId: 'llm.chat.openai', displayName: 'OpenAI', models: [], modelsByKind }],
        }),
      )!.connectedProviders![0];
    expect(
      choice({
        embedding: [
          { id: 'e1', name: 'E1', dimensions: 1536, maxInputs: 2048, secret: 'k' },
          { id: '', name: 'no id' },
          { id: 'e2' },
          'e3',
          null,
          [],
          { id: 'e4', name: 'E4', dimensions: 'big', maxInputs: -1 },
        ],
        hologram: [{ id: 'h', name: 'H' }],
        image: 'not a list',
        speech: [],
      }).modelsByKind,
    ).toEqual({
      embedding: [
        { id: 'e1', name: 'E1', dimensions: 1536, maxInputs: 2048 },
        { id: 'e4', name: 'E4' },
      ],
    });
    // Nothing usable, or not a record at all → absent, never an empty map.
    for (const bad of [{}, { embedding: [] }, { hologram: [{ id: 'h', name: 'H' }] }, [], 'x', 7, null]) {
      expect('modelsByKind' in choice(bad)).toBe(false);
    }
  });

  it('keys modelsByKind by the protocol’s ModelKind (type test, R3-1127)', () => {
    // Both directions: the SDK's ModelKind is exactly the protocol's.
    const fromProtocol: ModelKind = 'reranking' as ProtocolModelKind;
    const toProtocol: ProtocolModelKind = 'embedding' as ModelKind;
    const byKind: NonNullable<ChatProviderChoice['modelsByKind']> = { embedding: [{ id: 'e', name: 'E' }] };
    // @ts-expect-error — a key outside the taxonomy is a compile error
    const unknownKind: NonNullable<ChatProviderChoice['modelsByKind']> = { hologram: [] };
    expect([fromProtocol, toProtocol, Object.keys(byKind), unknownKind]).toBeDefined();
  });
});

// R3-1122: per-model descriptions. The wire carries them as object entries of a choice's
// `models`; the ids an app passes to chat() stay in `models: string[]` on the SDK side.
describe('per-model descriptions on a connected provider (R3-1122)', () => {
  const features = { vision: true, tools: true, jsonMode: true, reasoning: true, maxContextTokens: 200000 };
  const complete: ChatModelInfo = {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    features,
    contextTokens: 200000,
    outputTokens: 64000,
    inputModalities: ['text', 'image', 'pdf'],
    outputModalities: ['text'],
    thinking: { levels: ['off', 'low', 'medium', 'high'], default: 'off' },
    pricing: { inputPerMTok: 3, outputPerMTok: 15, unit: 'USD' },
  };
  const choiceOf = (models: unknown, extra: Record<string, unknown> = {}): ChatProviderChoice =>
    normalizeProviderInfo(
      withWire({
        connectedProviders: [{ providerId: 'llm.chat.anthropic', displayName: 'Anthropic', models, ...extra }],
      }),
    )!.connectedProviders![0];

  it('the wire site-main sends today — ids only — reads as ids with no descriptions', () => {
    // Recorded from site-main main's `connectedProviderChoices` (src/editor/llm/describeProvider.ts):
    // `{ providerId, displayName, models: [...new Set(tier models + chosen)], features: entry.features }`
    // for the OpenRouter row of providerCatalogue.json.
    const wire = {
      providerId: 'llm.chat.openrouter',
      displayName: 'OpenRouter',
      models: ['openai/gpt-5.4-mini', 'openai/gpt-5.4'],
      features: { vision: true, tools: true, jsonMode: true, reasoning: true, maxContextTokens: 400000 },
    };
    const out = normalizeProviderInfo(withWire({ connectedProviders: [wire] }))!;
    expect(out.connectedProviders).toEqual([wire]);
    expect('modelInfo' in out.connectedProviders![0]).toBe(false);
  });

  it('carries a complete entry through, and its id into models', () => {
    const out = choiceOf([complete]);
    expect(out.modelInfo).toEqual([complete]);
    expect(out.models).toEqual(['claude-sonnet-5']);
  });

  it('keeps a model with no thinking knob: empty levels, default naming nothing', () => {
    const plain = { ...complete, id: 'm', thinking: { levels: [], default: '' } };
    expect(choiceOf([plain]).modelInfo).toEqual([plain]);
  });

  it('drops a half-described entry from modelInfo but keeps its id', () => {
    const { thinking: _t, ...noThinking } = complete;
    const halfFeatures = { ...complete, id: 'b', features: { vision: true, tools: true } };
    const { contextTokens: _c, ...noContext } = { ...complete, id: 'c' };
    const out = choiceOf([noThinking, halfFeatures, noContext]);
    expect('modelInfo' in out).toBe(false);
    expect(out.models).toEqual(['claude-sonnet-5', 'b', 'c']);
  });

  it('partitions a mixed list per entry: every complete entry and every id survives', () => {
    const other = { ...complete, id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' };
    const out = choiceOf([complete, 'stray', 7, null, ['x'], other, '', 'stray']);
    expect(out.modelInfo).toEqual([complete, other]);
    expect(out.models).toEqual(['claude-sonnet-5', 'stray', 'claude-haiku-4-5']);
  });

  it('rebuilds a hostile entry: wrong types drop it, extra keys never cross, reasoning closes', () => {
    for (const bad of [
      { ...complete, contextTokens: 'huge' },
      { ...complete, outputTokens: -1 },
      { ...complete, name: 7 },
      { ...complete, inputModalities: 'text' },
      { ...complete, outputModalities: ['text', 3] },
      { ...complete, thinking: { levels: ['low', 'high'], default: 'max' } },
      { ...complete, thinking: { levels: 'low', default: 'low' } },
      { ...complete, features: [] },
    ]) {
      const out = choiceOf([bad]);
      expect('modelInfo' in out).toBe(false);
      expect(out.models).toEqual(['claude-sonnet-5']);
    }
    const out = choiceOf([
      {
        ...complete,
        secret: 'k',
        apiKey: 'sk-ant-x',
        features: { ...features, reasoning: 'yes', extra: 1 },
        thinking: { levels: ['off', 'high'], default: 'high', budget: 9 },
        pricing: 'free',
      },
    ]);
    const { pricing: _p, ...noPricing } = complete;
    expect(out.modelInfo).toEqual([
      {
        ...noPricing,
        features: { ...features, reasoning: false },
        thinking: { levels: ['off', 'high'], default: 'high' },
      },
    ]);
    expect(JSON.stringify(out)).not.toContain('sk-ant');
    // A malformed pricing block costs only itself.
    expect(
      choiceOf([{ ...complete, pricing: { inputPerMTok: 3, outputPerMTok: 'x', unit: 'USD' } }]).modelInfo![0],
    ).not.toHaveProperty('pricing');
  });

  it('prefers a wire modelIds over the ids in models, and falls back when it is unusable', () => {
    expect(choiceOf([complete], { modelIds: ['claude-sonnet-5', 'claude-opus-4-8'] }).models).toEqual([
      'claude-sonnet-5',
      'claude-opus-4-8',
    ]);
    // An empty models list with a modelIds list loses nothing.
    expect(choiceOf([], { modelIds: ['a', '', 3, 'b'] }).models).toEqual(['a', 'b']);
    for (const modelIds of ['a', [], [3], null]) {
      expect(choiceOf([complete, 'x'], { modelIds }).models).toEqual(['claude-sonnet-5', 'x']);
    }
  });

  it('types ChatRequest.thinking as an optional string (type test)', () => {
    const withLevel: ChatRequest = { messages: [], thinking: 'high' };
    const without: ChatRequest = { messages: [] };
    // @ts-expect-error — a level is a string, never a number or a budget object
    const wrong: ChatRequest = { messages: [], thinking: 2048 };
    // @ts-expect-error — ChatModelInfo.thinking is required: a description always says
    const noThinking: ChatModelInfo = { ...complete, thinking: undefined };
    expect([withLevel.thinking, without.thinking, wrong, noThinking]).toBeDefined();
  });
});
