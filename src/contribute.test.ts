// R3-659 (CONTRIBUTE_TRANSCRIPT_SPEC §4 R-CT-5/6): the transcript hint rides
// the run call as ONE boolean — the params object carries transcriptRequested
// and nothing else transcript-shaped.

const protocolStreamMock = jest.fn();

jest.mock('./protocolStream', () => ({
  protocolStream: (...args: unknown[]) => protocolStreamMock(...args),
}));

import { contribute } from './contribute';
import type { ContributeOptions, ContributionEvent, OpenPRResumeContext, RecoveryAction } from './contribute';

describe('contribute() — the transcript hint (R3-659)', () => {
  it('passes transcriptRequested through to the run params, and nothing else transcript-shaped', () => {
    protocolStreamMock.mockReturnValue((function* () {})());
    const opts = { commitMessage: 'Update', mode: 'pr' as const, transcriptRequested: true };
    contribute(opts);
    expect(protocolStreamMock).toHaveBeenCalledWith('protocol-contribute', 'run', [opts]);
    const params = protocolStreamMock.mock.calls[0][2][0] as Record<string, unknown>;
    expect(params.transcriptRequested).toBe(true);
    expect(Object.keys(params).filter((k) => k.toLowerCase().includes('transcript'))).toEqual(['transcriptRequested']);
    expect(JSON.stringify(params)).not.toMatch(/buffer|bytes|path/i);
  });

  it('omits the hint by default (absent, not false-biased)', () => {
    protocolStreamMock.mockReturnValue((function* () {})());
    contribute({ commitMessage: 'Update' });
    const calls = protocolStreamMock.mock.calls;
    const params = calls[calls.length - 1][2][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('transcriptRequested');
  });
});

// R3-984 (CONTRIBUTE_SPEC §8.8, CT-3/CT-6): the recovery an error names, and the two
// inputs an app sends back to act on it, reach the wire unchanged.
describe('contribute() — recovery inputs (R3-984)', () => {
  it('passes forceUpdateBranch and the open-pr resume through to the run params', () => {
    protocolStreamMock.mockReturnValue((function* () {})());
    const context: OpenPRResumeContext = {
      pushOwner: 'alice',
      repository: 'site',
      branchName: 'fix-typo',
      base: 'main',
      head: 'alice:fix-typo',
    };
    const opts: ContributeOptions = {
      commitMessage: 'Fix typo',
      branchName: 'fix-typo',
      forceUpdateBranch: true,
      resume: { kind: 'open-pr', context },
    };
    contribute(opts);
    const calls = protocolStreamMock.mock.calls;
    expect(calls[calls.length - 1]).toEqual(['protocol-contribute', 'run', [opts]]);
  });

  it('types the error variant with the recovery and its open-pr context', () => {
    const recoveries: RecoveryAction[] = ['retry', 'use-different-name', 'open-pr', 'switch-to-pr'];
    const events: ContributionEvent[] = recoveries.map((recovery) => ({
      stage: 'error',
      message: 'failed',
      recoverable: true,
      recovery,
      ...(recovery === 'open-pr'
        ? { openPR: { pushOwner: 'a', repository: 'r', branchName: 'b', base: 'main', head: 'a:b' } }
        : {}),
    }));
    expect(events.map((e) => (e.stage === 'error' ? e.recovery : null))).toEqual(recoveries);
  });
});
