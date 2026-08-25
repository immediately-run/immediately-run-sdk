// hostFetchStream — the app-facing streaming net:fetch wrapper (P3-71 Half A,
// LLM_AND_AGENTS_SPEC §2.2). It delegates to the shipped `protocolStream`
// primitive over the bundler transport, so we drive it by mocking the transport
// (`./sandboxUtils`) the way the host would, and assert the request shape + the
// chunk-reassembly / terminal-metadata / error contract.

import type { StreamFrame } from './protocolStream';

type Listener = (msg: { msgId?: number; stream?: StreamFrame }) => void;
const listeners: Record<string, Listener[]> = {};
const sent: Array<Record<string, unknown>> = [];

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  sendMessage: (type: string, data: Record<string, unknown>) => sent.push({ type, ...data }),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

import { hostFetchStream } from './netFetch';

const emit = (type: string, msgId: number, stream: StreamFrame) => {
  for (const h of listeners[type] || []) h({ msgId, stream });
};

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k];
  sent.length = 0;
});

describe('hostFetchStream — streaming net:fetch consumer (§2.2 / P3-71)', () => {
  it('sends a protocol-fetch fetchStream request with the right param shape', async () => {
    const it = hostFetchStream('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'sk-test' },
      body: '{"model":"…"}',
    });
    const first = it.next(); // triggers the send

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'protocol-fetch',
      method: 'fetchStream',
      stream: true,
      params: [
        {
          url: 'https://api.anthropic.com/v1/messages',
          method: 'POST',
          headers: { 'x-api-key': 'sk-test' },
          body: '{"model":"…"}',
        },
      ],
    });

    // finish the stream so the generator settles
    const msgId = sent[0].msgId as number;
    emit('protocol-fetch', msgId, { kind: 'done', value: doneResult() });
    await first;
    await it.return(undefined as never);
  });

  it('yields body chunks and returns the terminal metadata', async () => {
    const it = hostFetchStream('https://api.openai.com/v1/chat/completions');
    const collected: string[] = [];
    const pump = (async () => {
      let r = await it.next();
      while (!r.done) {
        collected.push(r.value.chunk);
        r = await it.next();
      }
      return r.value;
    })();

    const msgId = sent[0].msgId as number;
    emit('protocol-fetch', msgId, { kind: 'event', value: { chunk: 'data: {"delta":"He' } });
    emit('protocol-fetch', msgId, { kind: 'event', value: { chunk: 'llo"}\n\n' } });
    emit('protocol-fetch', msgId, { kind: 'done', value: doneResult({ bytes: 24 }) });

    const result = await pump;
    expect(collected.join('')).toBe('data: {"delta":"Hello"}\n\n');
    expect(result).toMatchObject({ status: 200, truncated: false, bytes: 24 });
  });

  it('throws the host StreamError (code + message) on a gate/SSRF/bound failure', async () => {
    const it = hostFetchStream('https://api.anthropic.com/v1/messages');
    const step = it.next();
    const msgId = sent[0].msgId as number;
    emit('protocol-fetch', msgId, {
      kind: 'error',
      code: 'idle-timeout',
      message: 'no bytes for 30000ms',
    });
    await expect(step).rejects.toMatchObject({
      name: 'StreamError',
      code: 'idle-timeout',
    });
  });
});

function doneResult(over: Partial<Record<string, unknown>> = {}) {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/event-stream' },
    truncated: false,
    bytes: 0,
    ...over,
  };
}
