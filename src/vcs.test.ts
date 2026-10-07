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
    diffWarnings: [{ kind: 'large-file', path: 'big.bin', message: 'big.bin is over 1 MB' }],
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

  it('keeps a target whose manifest records no commit, with commitSha null', () => {
    let got: VcsState | undefined;
    mod.onVcsStateChange((s) => (got = s));
    push({ ...sample, target: { ...facts.target, commitSha: null } });
    expect(got!.target).toEqual({ ...facts.target, commitSha: null });
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
    ['target with an empty commitSha', { target: { ...facts.target, commitSha: '' } }, 'target'],
    ['canPushUpstream as a string', { canPushUpstream: 'yes' }, 'canPushUpstream'],
    ['manifestMissing as 1', { manifestMissing: 1 }, 'manifestMissing'],
    ['diffError as an object', { diffError: { message: 'x' } }, 'diffError'],
    ['diffWarnings as plain strings', { diffWarnings: ['3 files over 1 MB'] }, 'diffWarnings'],
    ['a diffWarning without a path', { diffWarnings: [{ kind: 'large-file', message: 'm' }] }, 'diffWarnings'],
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

describe('bundle history (R3-954)', () => {
  const MOUNT = 'content:immediately-run/trololo';
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);

  it.each([
    ['bundleHead', () => mod.bundleHead(MOUNT), { mountId: MOUNT }, { sha: A }, A],
    [
      'bundleLog',
      () => mod.bundleLog(MOUNT, { since: A, max: 50 }),
      { mountId: MOUNT, since: A, max: 50 },
      { commits: [{ sha: B, parent: A, message: 'm' }] },
      [{ sha: B, parent: A, message: 'm' }],
    ],
    [
      'bundleIsAncestor',
      () => mod.bundleIsAncestor(MOUNT, A, B),
      { mountId: MOUNT, a: A, b: B },
      { ancestor: true },
      true,
    ],
    [
      'bundleDiffPaths',
      () => mod.bundleDiffPaths(MOUNT, A, B),
      { mountId: MOUNT, from: A, to: B },
      { paths: ['board.json'] },
      ['board.json'],
    ],
    ['bundleCanWrite', () => mod.bundleCanWrite(MOUNT), { mountId: MOUNT }, { canWrite: false }, false],
  ])('%s drives the protocol-vcs request and unwraps the result', async (method, call, params, data, expected) => {
    protocolRequest.mockResolvedValue({ ok: true, data });
    await expect((call as () => Promise<unknown>)()).resolves.toEqual(expected);
    expect(protocolRequest).toHaveBeenCalledWith('vcs', method, [params]);
  });

  it('bundleLog sends only the options given', async () => {
    protocolRequest.mockResolvedValue({ ok: true, data: { commits: [] } });
    await mod.bundleLog(MOUNT);
    expect(protocolRequest).toHaveBeenCalledWith('vcs', 'bundleLog', [{ mountId: MOUNT }]);
  });

  it('bundleRead decodes base64 to bytes and keeps null for a missing file', async () => {
    protocolRequest.mockResolvedValue({
      ok: true,
      data: { files: { 'board.json': btoa('{"name":"x"}'), 'gone.json': null } },
    });
    const files = await mod.bundleRead(MOUNT, A, ['board.json', 'gone.json']);
    expect(protocolRequest).toHaveBeenCalledWith('vcs', 'bundleRead', [
      { mountId: MOUNT, sha: A, paths: ['board.json', 'gone.json'] },
    ]);
    expect(new TextDecoder().decode(files['board.json']!)).toBe('{"name":"x"}');
    expect(files['gone.json']).toBeNull();
  });

  it('a host refusal rejects with its typed code, and a rate limit with retryAfter', async () => {
    protocolRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'not held' });
    await expect(mod.bundleHead(MOUNT)).rejects.toMatchObject({ code: 'forbidden' });
    protocolRequest.mockResolvedValue({ ok: false, code: 'budget', message: 'rate limited', retryAfter: 30 });
    await expect(mod.bundleLog(MOUNT)).rejects.toMatchObject({ code: 'budget', retryAfter: 30 });
    protocolRequest.mockResolvedValue({
      ok: false,
      code: 'invalid-params',
      message: 'history-too-long: more than 200',
    });
    await expect(mod.bundleLog(MOUNT)).rejects.toMatchObject({
      code: 'invalid-params',
      message: expect.stringMatching(/^history-too-long/),
    });
  });
});
