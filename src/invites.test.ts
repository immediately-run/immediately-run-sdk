// R3-90 (FILE_SHARING_SPEC §6.4/§7) — the SDK invitation surface, driven against a
// mocked transport: assert each method issues the correct
// `protocolRequest('spaces', <verb>, [args])`, unwraps the host's `{ok,data}`
// envelope, and propagates an `ok:false` reply as a typed Error with `.code`.

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

import {
  inviteToSpace,
  listPendingInvites,
  revokeInvite,
  listMyInvites,
  acceptInvite,
  declineInvite,
  getInvites,
  onInvitesChange,
  type Invite,
} from './mounts';

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k];
  protocolRequest.mockReset();
});

const ok = (data: unknown) => ({ ok: true, data });
const fail = (code: string, message = code) => ({ ok: false, code, message });

const invite: Invite = {
  spaceId: 'space-1',
  uid: 'uid-of-bob',
  role: 'writer',
  owner: 'u-owner',
  invitedBy: 'u-owner',
  invitedAt: 1_700_000_000_000,
  login: 'bob',
};

describe('invites — SDK surface (§6.4/§7)', () => {
  it('inviteToSpace drives the `invite` verb (owner side, spaces:admin)', async () => {
    protocolRequest.mockResolvedValue(ok(undefined));
    await inviteToSpace('space-1', 'bob', 'writer');
    expect(protocolRequest).toHaveBeenCalledWith('spaces', 'invite', [
      { spaceId: 'space-1', login: 'bob', role: 'writer' },
    ]);
  });

  it('listPendingInvites drives `pendingInvites` and returns the host data', async () => {
    protocolRequest.mockResolvedValue(ok([invite]));
    const res = await listPendingInvites('space-1');
    expect(protocolRequest).toHaveBeenCalledWith('spaces', 'pendingInvites', [{ spaceId: 'space-1' }]);
    expect(res).toEqual([invite]);
  });

  it('revokeInvite drives `revokeInvite` with the target uid', async () => {
    protocolRequest.mockResolvedValue(ok(undefined));
    await revokeInvite('space-1', 'uid-of-bob');
    expect(protocolRequest).toHaveBeenCalledWith('spaces', 'revokeInvite', [{ spaceId: 'space-1', uid: 'uid-of-bob' }]);
  });

  it('listMyInvites drives `listInvites` (invitee inbox, spaces:user)', async () => {
    protocolRequest.mockResolvedValue(ok([invite]));
    const res = await listMyInvites();
    expect(protocolRequest).toHaveBeenCalledWith('spaces', 'listInvites', [{}]);
    expect(res).toEqual([invite]);
  });

  it('acceptInvite drives `acceptInvite` with the spaceId', async () => {
    protocolRequest.mockResolvedValue(ok(undefined));
    await acceptInvite('space-1');
    expect(protocolRequest).toHaveBeenCalledWith('spaces', 'acceptInvite', [{ spaceId: 'space-1' }]);
  });

  it('declineInvite drives `declineInvite` with the spaceId', async () => {
    protocolRequest.mockResolvedValue(ok(undefined));
    await declineInvite('space-1');
    expect(protocolRequest).toHaveBeenCalledWith('spaces', 'declineInvite', [{ spaceId: 'space-1' }]);
  });

  it('a host `forbidden` reply propagates as a typed Error (no existence oracle)', async () => {
    protocolRequest.mockResolvedValue(fail('forbidden', 'no invitation for this space'));
    await expect(acceptInvite('never-invited')).rejects.toMatchObject({
      code: 'forbidden',
      message: 'no invitation for this space',
    });
  });

  it('the live invitations channel surfaces the host-pushed inbox', () => {
    const seen: Invite[][] = [];
    onInvitesChange((i) => seen.push(i));
    // The host pushes a snapshot on the `invitations` channel.
    for (const h of listeners['invitations'] || []) h({ invites: [invite] });
    expect(getInvites()).toEqual([invite]);
    expect(seen[seen.length - 1]).toEqual([invite]);
  });
});
