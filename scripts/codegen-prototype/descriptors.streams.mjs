// PROTOTYPE — single-source descriptors for the STREAMING host methods, proving
// the §3.2 `kind:'stream'` projection (AsyncGenerator<Event, Result>).
//
// Two real streaming surfaces, transcribed from the hand-written wrappers:
//   - contribute  (src/contribute.ts  → protocolStream('protocol-contribute','run',[opts]))
//   - llm:chat    (src/llm.ts          → invokeStream('llm:chat', req))
// Both bottom out at consumeStream over the same transport; the catalog name
// `scheme:method` maps to `protocol-${scheme}` + method, so a generated
// invokeStream() wrapper is byte-equivalent to each hand-written generator.

export const types = {
  // ── contribute ──────────────────────────────────────────────────────────────
  ContributeMode: {
    description: "The save strategy. `direct` requires the first-party `contribute:direct` capability.",
    schema: { type: 'string', enum: ['pr', 'direct'] },
  },
  ContributionResult: {
    description: 'The settled outcome (the stream’s return value).',
    schema: {
      type: 'object',
      required: ['commitSha', 'treeSha', 'branchName', 'mode'],
      properties: {
        prUrl: { type: 'string' },
        prNumber: { type: 'number' },
        commitSha: { type: 'string' },
        treeSha: { type: 'string' },
        branchName: { type: 'string' },
        mode: { type: 'string', enum: ['direct-commit', 'new-branch-pr', 'extend-existing'] },
      },
    },
  },
  ContributionEvent: {
    description: 'A stage emitted as the contribution runs (progress only — never token or blobs).',
    schema: {
      oneOf: [
        obj({ stage: konst('auth-check') }),
        obj({ stage: konst('diff-compute') }),
        obj({ stage: konst('permission-check') }),
        obj({ stage: konst('install-required'), targetOwner: str(), targetRepo: str(), installUrl: str() }),
        obj({ stage: konst('conflict-check') }),
        obj({ stage: konst('fork-prepare'), forkOwner: str(), alreadyExists: bool() }),
        obj({ stage: konst('upload-blob'), path: str(), index: num(), total: num() }),
        obj({ stage: konst('create-tree') }),
        obj({ stage: konst('create-commit') }),
        obj({ stage: konst('create-branch'), branchName: str() }),
        obj({ stage: konst('create-pr') }),
        obj({ stage: konst('pr-updated'), prNumber: num(), prUrl: str(), commitSha: str() }),
        obj({ stage: konst('commit-pushed'), ref: str(), commitSha: str() }),
        obj({ stage: konst('done'), commitSha: str(), prUrl: opt(str()), prNumber: opt(num()) }),
        obj({ stage: konst('error'), message: str(), recoverable: bool() }),
      ],
    },
  },

  // ── llm:chat ────────────────────────────────────────────────────────────────
  ChatRole: { description: 'Who authored a message.', schema: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] } },
  ContentPart: {
    description: 'A part of a message.',
    schema: {
      oneOf: [
        obj({ type: konst('text'), text: str() }),
        obj({ type: konst('image'), mimeType: str(), data: str() }),
      ],
    },
  },
  ChatMessage: {
    description: 'One message in a ChatRequest.',
    schema: { type: 'object', required: ['role', 'content'], properties: { role: ref('ChatRole'), content: arr(ref('ContentPart')) } },
  },
  ToolDef: {
    description: 'A tool the model may call — honored only when `features.tools`.',
    schema: { type: 'object', required: ['name', 'inputSchema'], properties: { name: str(), description: opt(str()), inputSchema: { type: 'record' } } },
  },
  ChatDelta: {
    description: 'One streamed chunk.',
    schema: {
      oneOf: [
        obj({ type: konst('text-delta'), text: str() }),
        obj({ type: konst('tool-call'), id: str(), name: str(), input: { type: 'unknown' } }),
        obj({ type: konst('usage'), inputTokens: num(), outputTokens: num() }),
      ],
    },
  },
  ChatResult: {
    description: 'The terminal value of the chat stream.',
    schema: { type: 'object', required: ['stopReason'], properties: { stopReason: { type: 'string', enum: ['end', 'length', 'tool', 'filtered'] } } },
  },
};

const STREAM_ERRORS = ['forbidden', 'auth-required', 'invalid', 'network', 'unknown'];

export const methods = [
  {
    name: 'contribute:run',
    capability: 'contribute:self',
    kind: 'stream',
    doc:
      'Save the current working tree, streaming each stage. Yields ContributionEvents ' +
      'and returns a ContributionResult. mode "direct" needs the `contribute:direct` ' +
      'capability (a `contribute:any` app asking for it is rejected `forbidden`, T11).',
    params: {
      type: 'object',
      required: ['commitMessage'],
      properties: { commitMessage: str(), mode: ref('ContributeMode'), branchName: str() },
    },
    event: ref('ContributionEvent'),
    result: ref('ContributionResult'),
    errors: STREAM_ERRORS,
    alias: { fn: 'contribute' }, // object-arg, no positional (matches src/contribute.ts)
  },
  {
    name: 'llm:chat',
    capability: 'llm:chat',
    kind: 'stream',
    doc:
      'Stream a chat completion from whichever provider the user has configured. ' +
      'The app never names a vendor and never sees the key. No provider bound → ' +
      'the stream throws `auth-required` (the SP-7 connect-me prompt).',
    params: {
      type: 'object',
      required: ['messages'],
      properties: {
        messages: arr(ref('ChatMessage')),
        tools: arr(ref('ToolDef')),
        responseFormat: { type: 'string', enum: ['text', 'json'] },
        maxTokens: num(),
        modelHint: { type: 'string', enum: ['fast', 'smart'] },
      },
    },
    event: ref('ChatDelta'),
    result: ref('ChatResult'),
    errors: STREAM_ERRORS,
    alias: { fn: 'chat' },
  },
];

export const family = {
  scheme: 'streams',
  doc: 'Streaming host methods — contribute (UI_AS_APPS §5.1) and llm:chat (SERVICE_PROVIDERS).',
  types,
  methods,
};

// ── tiny schema builders (keep the descriptor readable) ───────────────────────
function obj(properties) {
  const required = Object.entries(properties).filter(([, v]) => !v.__opt).map(([k]) => k);
  const props = Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, strip(v)]));
  return { type: 'object', required, properties: props };
}
function konst(v) { return { type: 'string', const: v }; }
function str() { return { type: 'string' }; }
function num() { return { type: 'number' }; }
function bool() { return { type: 'boolean' }; }
function arr(items) { return { type: 'array', items }; }
function ref(name) { return { $ref: name }; }
function opt(s) { return { ...s, __opt: true }; }
function strip({ __opt, ...rest }) { return rest; }
