// R3-52 / migrate-sidebars Phase 05 — the `vcs:read`/`vcs:reset` SDK surface.
// Read side: assert the get/onChange/use trio, the poll on first read, the parse
// (require a well-formed `changes` array, tolerate absent branch/prs), and that a
// malformed push leaves the last good snapshot standing. Action side: assert each
// wrapper maps to the right `protocol-vcs` method + params and that a host
// `{ ok:false, code }` surfaces as a typed throw. The channel is a module
// singleton, so each test resets modules + re-requires for a fresh channel.
type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const sendMessage = jest.fn();
const protocolRequest = jest.fn();

jest.mock('./sandboxUtils', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  protocolRequest: (...args: unknown[]) => protocolRequest(...args),
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
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));


import type { VcsState } from './vcs';

type VcsMod = typeof import('./vcs');
let mod: VcsMod;
const push = (msg: Record<string, unknown>) => (listeners['vcs-state'] || []).forEach((l) => l(msg));

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  protocolRequest.mockReset();
  protocolRequest.mockResolvedValue({ ok: true, data: undefined });
  mod = require('./vcs');
});

const sample = {
  changes: [
    { path: '/src/App.tsx', status: 'modified' },
    { path: '/src/new.ts', status: 'created' },
  ],
  branch: {
    name: 'my-edit',
    parentRepo: 'immediately-run/contribute-test',
    parentRef: 'main',
    parentCommitSha: 'abc123',
    upstreamPushable: true,
  },
  prs: [{ number: 7, url: 'https://x/pr/7', title: 'Fix', state: 'open', draft: false }],
  diffLoading: false,
};

describe('vcs read channel', () => {
  it('polls request-vcs-state on first read and starts empty', () => {
    expect(mod.getVcsState()).toEqual({ changes: [], branch: null, prs: [], diffLoading: false });
    expect(sendMessage).toHaveBeenCalledWith('request-vcs-state');
  });

  it('onVcsStateChange replays current then fires on each push, parsing fully', () => {
    const seen: VcsState[] = [];
    const off = mod.onVcsStateChange((s) => seen.push(s));
    expect(seen).toHaveLength(1); // immediate replay of the empty initial
    push(sample);
    expect(seen[1].changes).toHaveLength(2);
    expect(seen[1].branch?.name).toBe('my-edit');
    expect(seen[1].prs[0]).toEqual({ number: 7, url: 'https://x/pr/7', title: 'Fix', state: 'open', draft: false });
    off();
    push(sample); // unsubscribed → no further calls
    expect(seen).toHaveLength(2);
  });

  it('tolerates an absent branch/prs (branch null, prs empty)', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({ changes: [], diffLoading: true });
    expect(got!.branch).toBeNull();
    expect(got!.prs).toEqual([]);
    expect(got!.diffLoading).toBe(true);
  });

  it('ignores a malformed push (changes not an array) — last good snapshot stands', () => {
    const seen: VcsState[] = [];
    mod.onVcsStateChange((s) => seen.push(s));
    push(sample);
    const goodLen = seen.length;
    push({ changes: 'nope' }); // malformed → ignored
    expect(seen).toHaveLength(goodLen);
    expect(mod.getVcsState().changes).toHaveLength(2);
  });
});

describe('vcs actions — request shape', () => {
  it.each([
    ['refreshDiff', () => mod.refreshDiff(), 'refreshDiff', {}],
    ['refreshPRs', () => mod.refreshPRs(), 'refreshPRs', {}],
    ['resetWorkingTree', () => mod.resetWorkingTree(), 'reset', { confirm: true }],
  ])('%s → protocol-vcs %s', async (_name, call, method, arg) => {
    await call();
    expect(protocolRequest).toHaveBeenCalledWith('vcs', method, [arg]);
  });
});

describe('vcs actions — typed errors', () => {
  it('surfaces forbidden on resetWorkingTree (fork lacks vcs:reset)', async () => {
    protocolRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'no vcs:reset' });
    await expect(mod.resetWorkingTree()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('surfaces forbidden on refreshDiff (lacks vcs:read)', async () => {
    protocolRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'no vcs:read' });
    await expect(mod.refreshDiff()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('defaults to unknown when the host returns no code', async () => {
    protocolRequest.mockResolvedValue({ ok: false });
    const err = await mod.refreshPRs().catch((e) => e);
    expect(err.code).toBe('unknown');
  });
});
