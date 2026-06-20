// Jest globals (describe/it/expect/afterEach) — matches the SDK's other suites.
import { getRegion } from './region';
import type { ImmediatelyRunGlobal } from './hostRuntime';

type G = { __immediatelyRun__?: ImmediatelyRunGlobal };

afterEach(() => {
  delete (globalThis as G).__immediatelyRun__;
});

describe('getRegion', () => {
  it('returns the region the host reported on the discovery global', () => {
    (globalThis as G).__immediatelyRun__ = { region: 'panel.agent' };
    expect(getRegion()).toBe('panel.agent');
  });

  it('returns null when the global is absent (standalone / local dev)', () => {
    expect(getRegion()).toBeNull();
  });

  it('returns null when the host reports no region (older host)', () => {
    (globalThis as G).__immediatelyRun__ = { appMountPath: '/app' };
    expect(getRegion()).toBeNull();
  });
});
