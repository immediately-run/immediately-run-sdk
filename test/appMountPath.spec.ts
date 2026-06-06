import { getAppMountPath } from '../src/mounts';

describe('getAppMountPath', () => {
  const g = globalThis as { __immediatelyRun__?: { appMountPath?: string } };
  afterEach(() => {
    delete g.__immediatelyRun__;
  });

  it('returns the host-reported canonical /mnt path', () => {
    g.__immediatelyRun__ = { appMountPath: '/mnt/abc123' };
    expect(getAppMountPath()).toBe('/mnt/abc123');
  });

  it('falls back to /app when the host has not reported a path', () => {
    g.__immediatelyRun__ = {};
    expect(getAppMountPath()).toBe('/app');
  });

  it('falls back to /app when the discovery global is absent', () => {
    delete g.__immediatelyRun__;
    expect(getAppMountPath()).toBe('/app');
  });
});
