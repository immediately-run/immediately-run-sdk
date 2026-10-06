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

  // R3-659 (CONTRIBUTE_TRANSCRIPT_SPEC §4): the agentSession gate facts ride
  // the vcs channel to the contribute apps — whitelisted fields only, never
  // transcript bytes (R-CT-6); absent unless qualifying (R-CT-3).
  it('passes a well-formed agentSession through, whitelisted fields only', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({
      ...sample,
      agentSession: {
        repo: 'acme/notes',
        conversationId: 'c1',
        messageCount: 3,
        running: false,
        updatedAt: 1727000000000,
        transcript: 'evil-bytes', // never forwarded
      },
    });
    expect(got!.agentSession).toEqual({
      repo: 'acme/notes',
      conversationId: 'c1',
      messageCount: 3,
      running: false,
      updatedAt: 1727000000000,
    });
    expect(JSON.stringify(got)).not.toContain('evil-bytes');
  });

  it('a malformed agentSession reads as NO session (fail-closed, R-CT-1) — the snapshot still lands', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({ ...sample, agentSession: { repo: 'acme/notes', messageCount: 'three' } });
    expect(got).not.toHaveProperty('agentSession');
    expect(got!.changes).toHaveLength(2);
    // Structured clone carries non-finite numbers: NaN is a number to typeof
    // and must not conjure the fact either (mirrors the producer's parser).
    push({ ...sample, agentSession: { repo: 'acme/notes', conversationId: 'c1', messageCount: NaN, running: false } });
    expect(got).not.toHaveProperty('agentSession');
  });

  it('no agentSession key when the push carries none (absent, never null-rendered)', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push(sample);
    expect(got).not.toHaveProperty('agentSession');
  });
});

// R3-964 / R3-986 / R3-987: the facts the contribute forms render from. Each is
// optional and fails to ABSENT field by field, so an old host or a malformed value
// leaves the app on its old behaviour and never conjures a fact.
describe('vcs read channel — the save-form facts (R3-964/986/987)', () => {
  const facts = {
    target: {
      namespace: 'acme',
      repository: 'site',
      ref: 'v1.2',
      refKind: 'tag',
      commitSha: 'abc123',
      defaultBranch: 'main',
    },
    canPushUpstream: false,
    manifestMissing: false,
    diffError: 'diff failed: timeout',
    diffWarnings: ['3 files over 1 MB'],
    excludedPhantoms: ['.immediately-run/state.json'],
    manifestTruncated: true,
  };

  it('passes every well-typed fact through, openPR and defaultSaveMode included', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({ ...sample, ...facts, openPR: { number: 7, url: 'https://x/pr/7' }, defaultSaveMode: 'direct' });
    expect(got).toMatchObject({ ...facts, openPR: { number: 7, url: 'https://x/pr/7' }, defaultSaveMode: 'direct' });
  });

  it('keeps null where the host says "known: none" or "not known yet"', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({
      ...sample,
      target: null,
      canPushUpstream: null,
      diffError: null,
      openPR: null,
    });
    expect(got!.target).toBeNull();
    expect(got!.canPushUpstream).toBeNull();
    expect(got!.diffError).toBeNull();
    expect(got!.openPR).toBeNull();
  });

  it('an old-host push carries none of the new keys', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push(sample);
    for (const k of [
      'target',
      'canPushUpstream',
      'manifestMissing',
      'diffError',
      'diffWarnings',
      'excludedPhantoms',
      'manifestTruncated',
    ]) {
      expect(got).not.toHaveProperty(k);
    }
    expect(got!.branch).not.toHaveProperty('openPR');
    expect(got!.branch).not.toHaveProperty('defaultSaveMode');
  });

  it.each([
    ['target with an unknown refKind', { target: { ...facts.target, refKind: 'pr' } }, 'target'],
    ['target missing commitSha', { target: { ...facts.target, commitSha: undefined } }, 'target'],
    ['canPushUpstream as a string', { canPushUpstream: 'yes' }, 'canPushUpstream'],
    ['manifestMissing as 1', { manifestMissing: 1 }, 'manifestMissing'],
    ['diffError as an object', { diffError: { message: 'x' } }, 'diffError'],
    ['diffWarnings with a number', { diffWarnings: ['ok', 3] }, 'diffWarnings'],
    ['excludedPhantoms not an array', { excludedPhantoms: 'a.json' }, 'excludedPhantoms'],
    ['manifestTruncated as "true"', { manifestTruncated: 'true' }, 'manifestTruncated'],
  ])('drops %s, and the snapshot still lands', (_label, bad, key) => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({ ...sample, ...bad });
    expect(got).not.toHaveProperty(key);
    expect(got!.changes).toHaveLength(2);
  });

  it.each([
    ['openPR with a non-finite number', { openPR: { number: NaN, url: 'u' } }, 'openPR'],
    ['openPR without a url', { openPR: { number: 7 } }, 'openPR'],
    ['defaultSaveMode outside the two modes', { defaultSaveMode: 'force' }, 'defaultSaveMode'],
  ])('drops %s', (_label, bad, key) => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({ ...sample, ...bad });
    expect(got).not.toHaveProperty(key);
    expect(got!.branch!.name).toBe('my-edit');
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
