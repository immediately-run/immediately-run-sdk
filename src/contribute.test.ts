// R3-659 (CONTRIBUTE_TRANSCRIPT_SPEC §4 R-CT-5/6): the transcript hint rides
// the run call as ONE boolean — the params object carries transcriptRequested
// and nothing else transcript-shaped.

const protocolStreamMock = jest.fn();

jest.mock('./protocolStream', () => ({
  protocolStream: (...args: unknown[]) => protocolStreamMock(...args),
}));

import { contribute } from './contribute';

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
