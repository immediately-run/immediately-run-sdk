// feedFetch — the connector's egress wrapper (D2, R3-227). The interesting assertions
// are about what does NOT go over the wire: `feedFetch` is the surface whose whole
// point is that a caller cannot name a target, so the tests check the request SHAPE
// as carefully as the reply handling.

const protocolRequest = jest.fn();
jest.mock('./sandboxUtils', () => ({ protocolRequest }));

import { feedFetch } from './feed';

const okReply = (body = '{"rows":[]}') => ({
  ok: true,
  data: { status: 200, statusText: 'OK', headers: {}, body, truncated: false },
});

beforeEach(() => protocolRequest.mockReset());

describe('feedFetch — the request carries an instance id, never a target', () => {
  it('sends `protocol-feed`.fetch with exactly {instanceId, params}', async () => {
    protocolRequest.mockResolvedValue(okReply());
    await feedFetch('fe00ff', { since: '2026-08-01T00:00:00Z', limit: 50 });
    expect(protocolRequest).toHaveBeenCalledWith('feed', 'fetch', [
      { instanceId: 'fe00ff', params: { since: '2026-08-01T00:00:00Z', limit: 50 } },
    ]);
  });

  it('the wire payload has NO url, origin, host, path, headers or body field', async () => {
    // The absence is the design, so it is asserted rather than assumed. A future
    // "convenience" parameter that reintroduced any of these would fail here.
    protocolRequest.mockResolvedValue(okReply());
    await feedFetch('fe00ff');
    const [, , params] = protocolRequest.mock.calls[0];
    const payload = (params as Record<string, unknown>[])[0];
    expect(Object.keys(payload).sort()).toEqual(['instanceId', 'params']);
    for (const forbidden of ['url', 'origin', 'host', 'path', 'headers', 'body', 'method', 'cursor']) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('omitted params send an empty object, not undefined', async () => {
    protocolRequest.mockResolvedValue(okReply());
    await feedFetch('fe00ff');
    expect(protocolRequest).toHaveBeenCalledWith('feed', 'fetch', [{ instanceId: 'fe00ff', params: {} }]);
  });

  it('resolves the serialized response, including a non-2xx status', async () => {
    protocolRequest.mockResolvedValue({
      ok: true,
      data: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '30' },
        body: '',
        truncated: false,
      },
    });
    // A reachable server that said no is a RESULT, not an error — same contract as
    // `hostFetch`, so a connector's retry logic reads `.status` rather than catching.
    await expect(feedFetch('fe00ff')).resolves.toMatchObject({ status: 429 });
  });
});

describe('feedFetch — typed refusals', () => {
  const rejectsWithCode = async (reply: unknown, code: string) => {
    protocolRequest.mockResolvedValue(reply);
    await expect(feedFetch('fe00ff')).rejects.toMatchObject({ code });
  };

  it('surfaces the host code for each refusal the surface can produce', async () => {
    // `forbidden` covers BOTH "you do not hold feed:fetch" and "that instance is not
    // yours" — deliberately indistinguishable, so the reply is not an oracle for which
    // feed instances exist.
    for (const code of ['forbidden', 'invalid-params', 'budget', 'unsupported', 'blocked', 'too-large', 'network']) {
      await rejectsWithCode({ ok: false, code, message: `${code} happened` }, code);
    }
  });

  it('a reply with no code, and a missing reply, both become `unknown` rather than silence', async () => {
    await rejectsWithCode({ ok: false }, 'unknown');
    await rejectsWithCode(undefined, 'unknown');
  });

  it('carries the host message through so a connector can log something useful', async () => {
    protocolRequest.mockResolvedValue({ ok: false, code: 'invalid-params', message: 'no slot named "page"' });
    await expect(feedFetch('fe00ff', { page: 'x' })).rejects.toThrow('no slot named "page"');
  });
});
