// The chat-slot ModelClient: the loop's Anthropic-shaped conversation maps onto
// `ChatRequest` and back — tool calls ride `tool-call` deltas, history round-trips
// as `tool-use`/`tool-result` parts, usage and stop reasons survive the mapping.
import { createChatModelClient } from './agentChatClient';
import type { AgentMessage } from './agentLoop';
import type { ChatDelta, ChatResult } from './llm';

// Script the SDK `chat()` stream without touching the wire: the client only maps.
jest.mock('./llm', () => ({
  chat: jest.fn(),
}));
import { chat } from './llm';

const mockedChat = chat as unknown as jest.Mock;

async function* streamOf(deltas: ChatDelta[], result: ChatResult): AsyncGenerator<ChatDelta, ChatResult, void> {
  for (const d of deltas) yield d;
  return result;
}

const history: AgentMessage[] = [
  { role: 'user', content: [{ type: 'text', text: 'list the entries' }] },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 't1',
        name: 'metadata:query',
        input: { where: [{ key: 'tags', op: 'contains', value: 'x' }] },
      },
    ],
  },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"rows":[]}', is_error: false }] },
];

describe('createChatModelClient', () => {
  it('maps the conversation to ChatRequest (history, tools, modelHint, signal)', async () => {
    mockedChat.mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'hi' }], { stopReason: 'end' }));
    const client = createChatModelClient();
    const onTextDelta = jest.fn();
    const res = await client.createMessage({
      system: 'sys',
      messages: history,
      tools: [{ name: 'metadata:query', description: 'd', input_schema: { type: 'object' } }],
      onTextDelta,
      signal: new AbortController().signal,
    });
    const req = mockedChat.mock.calls[0][0];
    expect(req.modelHint).toBe('smart');
    expect(req.signal).toBeInstanceOf(AbortSignal);
    expect(req.tools).toEqual([{ name: 'metadata:query', description: 'd', inputSchema: { type: 'object' } }]);
    expect(req.messages[0]).toEqual({ role: 'system', content: [{ type: 'text', text: 'sys' }] });
    expect(req.messages[2].content[0]).toEqual({
      type: 'tool-use',
      id: 't1',
      name: 'metadata:query',
      input: expect.any(Object),
    });
    expect(req.messages[3].content[0]).toEqual({ type: 'tool-result', toolCallId: 't1', content: '{"rows":[]}' });
    expect(onTextDelta).toHaveBeenCalledWith('hi');
    expect(res.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(res.stopReason).toBe('end_turn');
  });

  it('assembles streamed tool-call deltas into tool_use blocks and maps stop "tool"', async () => {
    mockedChat.mockReturnValueOnce(
      streamOf(
        [
          { type: 'text-delta', text: 'checking…' },
          { type: 'tool-call', id: 'c1', name: 'read_entry', input: { path: 'a.mdx' } },
        ],
        { stopReason: 'tool' },
      ),
    );
    const res = await createChatModelClient().createMessage({ messages: [], tools: [] });
    expect(res.stopReason).toBe('tool_use');
    expect(res.content).toContainEqual({ type: 'tool_use', id: 'c1', name: 'read_entry', input: { path: 'a.mdx' } });
  });

  it('carries usage through verbatim, including cache counters and their absence', async () => {
    mockedChat.mockReturnValueOnce(
      streamOf(
        [
          { type: 'usage', inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 1 },
          { type: 'text-delta', text: 'ok' },
        ],
        { stopReason: 'end' },
      ),
    );
    const withCache = await createChatModelClient().createMessage({ messages: [], tools: [] });
    expect(withCache.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 1 });

    mockedChat.mockReturnValueOnce(
      streamOf(
        [
          { type: 'usage', inputTokens: 1, outputTokens: 1 },
          { type: 'text-delta', text: 'x' },
        ],
        { stopReason: 'end' },
      ),
    );
    const bare = await createChatModelClient().createMessage({ messages: [], tools: [] });
    expect(bare.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
    expect('cacheReadTokens' in (bare.usage ?? {})).toBe(false);
  });

  it('maps stop "length" to the loop truncation reason and "filtered" to end_turn', async () => {
    mockedChat.mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'cut' }], { stopReason: 'length' }));
    const truncated = await createChatModelClient().createMessage({ messages: [], tools: [] });
    expect(truncated.stopReason).toBe('max_tokens');

    mockedChat.mockReturnValueOnce(streamOf([{ type: 'text-delta', text: 'no' }], { stopReason: 'filtered' }));
    const filtered = await createChatModelClient().createMessage({ messages: [], tools: [] });
    expect(filtered.stopReason).toBe('end_turn');
  });
});
