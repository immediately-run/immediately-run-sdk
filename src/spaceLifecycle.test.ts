// R3-723 (FILE_SHARING_SPEC §6.2/§9.7) — the space lifecycle wrappers, driven
// against a mocked transport. The load-bearing assertion is the INJECTED
// `confirm: true`: the host gate's requireSpaceIdAndConfirm demands it (T22
// belt-and-braces), and the generator's `constParams` is what puts it on the
// wire — so each verb's params shape is pinned here, not just its name.

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

jest.mock('./hostTransport', () => ({
  sendMessage: jest.fn(),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

import { deleteSpace, restoreSpace, leaveSpace, renameSpace, convertSpaceToShared } from './mounts';

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k];
  protocolRequest.mockReset();
});

const ok = (data: unknown) => ({ ok: true, data });
const fail = (code: string, message = code) => ({ ok: false, code, message });

describe('R3-723 — the space lifecycle wrappers', () => {
  it('deleteSpace / restoreSpace / leaveSpace / convertSpaceToShared inject confirm: true', async () => {
    protocolRequest.mockResolvedValue(ok(undefined));
    await deleteSpace('space-1');
    expect(protocolRequest).toHaveBeenLastCalledWith('spaces', 'delete', [{ spaceId: 'space-1', confirm: true }]);
    await restoreSpace('space-1');
    expect(protocolRequest).toHaveBeenLastCalledWith('spaces', 'restore', [{ spaceId: 'space-1', confirm: true }]);
    await leaveSpace('space-1');
    expect(protocolRequest).toHaveBeenLastCalledWith('spaces', 'leave', [{ spaceId: 'space-1', confirm: true }]);
    await convertSpaceToShared('space-1');
    expect(protocolRequest).toHaveBeenLastCalledWith('spaces', 'convertToShared', [
      { spaceId: 'space-1', confirm: true },
    ]);
  });

  it('renameSpace sends the name and NO confirm (the gate validates spaceId + name only)', async () => {
    protocolRequest.mockResolvedValue(ok(undefined));
    await renameSpace('space-1', 'Finance team');
    expect(protocolRequest).toHaveBeenLastCalledWith('spaces', 'rename', [
      { spaceId: 'space-1', name: 'Finance team' },
    ]);
  });

  it('the .try form returns a Result instead of throwing (leave on the anchor owner → owner-lockout)', async () => {
    protocolRequest.mockResolvedValue(
      fail('owner-lockout', 'the anchor owner cannot leave — delete the space instead'),
    );
    const res = await leaveSpace.try('space-1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('owner-lockout');
  });

  it('a host forbidden on delete propagates as a typed Error', async () => {
    protocolRequest.mockResolvedValue(fail('forbidden', 'only the owner may delete a space'));
    await expect(deleteSpace('space-1')).rejects.toMatchObject({
      code: 'forbidden',
      message: 'only the owner may delete a space',
    });
  });
});
