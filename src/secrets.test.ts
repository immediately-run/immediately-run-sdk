// SDK secret-store surface (SECRETS_SPEC §4/§5, P1.E). Driven against a mocked
// transport: assert the protocol method/param shape, the {ok,data} unwrap + typed
// SecretError, and that the metadata channel never surfaces a value.

type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const protocolRequest = jest.fn();

jest.mock('./sandboxUtils', () => ({
  protocolRequest: (...args: unknown[]) => protocolRequest(...args),
  sendMessage: jest.fn(),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

// R3-307 moved the transport primitives to `hostTransport`, which is what `pushChannel`
// now reads — so the push-channel legs are mocked THERE while `protocolRequest` stays here.
jest.mock('./hostTransport', () => ({
  sendMessage: jest.fn(),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

import { requestAddSecret, requestSecret, revokeSecret, getSecrets, onSecretsChange, type SecretView } from './secrets';

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k];
  protocolRequest.mockReset();
});

const ok = (data: unknown) => ({ ok: true, data });
const fail = (code: string, message = code) => ({ ok: false, code, message });

const view: SecretView = {
  id: 's_1',
  type: 'api-key',
  family: 'anthropic',
  description: 'My Anthropic key',
  boundOrigin: 'https://api.anthropic.com',
  lastUsedAt: null,
};

describe('secrets — app-facing surface (§4/§5)', () => {
  it('requestAddSecret sends hints to protocol-secrets.add and returns metadata', async () => {
    protocolRequest.mockResolvedValue(ok(view));
    const res = await requestAddSecret({ family: 'anthropic', type: 'api-key' });
    expect(protocolRequest).toHaveBeenCalledWith('secrets', 'add', [{ family: 'anthropic', type: 'api-key' }]);
    expect(res).toEqual(view);
    expect(res).not.toHaveProperty('value');
  });

  it('requestSecret returns a grant handle + metadata, never a value', async () => {
    protocolRequest.mockResolvedValue(ok({ grantId: 'g_1', secret: view }));
    const grant = await requestSecret({ family: 'anthropic' });
    expect(protocolRequest).toHaveBeenCalledWith('secrets', 'request', [{ family: 'anthropic' }]);
    expect(grant.grantId).toBe('g_1');
    expect(grant.secret).toEqual(view);
    expect(grant.secret).not.toHaveProperty('value');
  });

  it('maps a host refusal to a typed SecretError (cancelled == no oracle)', async () => {
    protocolRequest.mockResolvedValue(fail('cancelled', 'user dismissed'));
    await expect(requestSecret({ type: 'api-key' })).rejects.toMatchObject({
      code: 'cancelled',
      message: 'user dismissed',
    });
  });

  it('revokeSecret calls protocol-secrets.revoke with the id', async () => {
    protocolRequest.mockResolvedValue(ok(undefined));
    await revokeSecret('s_1');
    expect(protocolRequest).toHaveBeenCalledWith('secrets', 'revoke', [{ id: 's_1' }]);
  });

  it('the secrets-metadata channel surfaces metadata only (never a value)', () => {
    const seen: SecretView[][] = [];
    onSecretsChange((s) => seen.push(s));
    // host pushes a metadata snapshot
    for (const h of listeners['secrets-metadata'] || []) h({ secrets: [view] });
    expect(getSecrets()).toEqual([view]);
    expect(seen[seen.length - 1]).toEqual([view]);
    expect(getSecrets()[0]).not.toHaveProperty('value');
  });
});
