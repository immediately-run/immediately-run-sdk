// R3-166 / R-FS-1 — `MountFs.onChange` (SDK_FS_SURFACE_SPEC §5). The mount-scoped
// projection of the working-tree change channel (`onFsChange`): forward changed
// paths RELATIVE to the mount for the working-tree mount, and be an inert
// subscription for a non-working-tree mount (the working-tree-only v1 gap, O2).
//
// `./onFsChange` is mocked so we drive host pushes deterministically. `ts-jest`
// hoists `jest.mock` (same pattern as `editor.test.ts`). `getAppMountPath()`
// falls back to `/app` with no host runtime, so `/app` is the working tree here.

jest.mock('./onFsChange', () => {
  let listener: ((c: { paths: string[]; epoch: number }) => void) | null = null;
  const unsub = jest.fn(() => {
    listener = null;
  });
  return {
    onFsChange: jest.fn((cb: (c: { paths: string[]; epoch: number }) => void) => {
      listener = cb;
      return unsub;
    }),
    // test-only escape hatches
    __emit: (paths: string[], epoch = 1) => listener?.({ paths, epoch }),
    __unsub: unsub,
  };
});

import { openFs } from './fs';
import { onFsChange } from './onFsChange';
import type { SandboxMount } from './mounts';

const mod = { onFsChange } as unknown as {
  onFsChange: jest.Mock;
  __emit: (paths: string[], epoch?: number) => void;
  __unsub: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = jest.requireMock('./onFsChange') as any as typeof mod;

const mount = (over: Partial<SandboxMount> = {}): SandboxMount =>
  ({ path: '/app', type: 'repo', ...over } as SandboxMount);

beforeEach(() => {
  m.onFsChange.mockClear();
  m.__unsub.mockClear();
});

describe('MountFs.onChange — working-tree mount', () => {
  it('forwards changed paths RELATIVE to the mount (leading slash stripped)', () => {
    const fs = openFs(mount());
    const seen: string[][] = [];
    fs.onChange((paths) => seen.push(paths));
    expect(m.onFsChange).toHaveBeenCalledTimes(1);

    m.__emit(['/src/App.tsx', '/README.md']);
    expect(seen).toEqual([['src/App.tsx', 'README.md']]);
  });

  it('re-fires on every batch (a second edit to the same file still delivers)', () => {
    const fs = openFs(mount());
    const seen: string[][] = [];
    fs.onChange((paths) => seen.push(paths));
    m.__emit(['/src/App.tsx'], 1);
    m.__emit(['/src/App.tsx'], 2);
    expect(seen).toEqual([['src/App.tsx'], ['src/App.tsx']]);
  });

  it('skips the empty pre-first-event initial batch (no spurious [] fire)', () => {
    const fs = openFs(mount());
    const seen: string[][] = [];
    fs.onChange((paths) => seen.push(paths));
    m.__emit([], 0); // the initial
    expect(seen).toEqual([]);
    m.__emit(['/x.ts'], 1);
    expect(seen).toEqual([['x.ts']]);
  });

  it('the returned unsubscribe tears down the underlying subscription', () => {
    const fs = openFs(mount());
    const off = fs.onChange(() => {});
    expect(m.__unsub).not.toHaveBeenCalled();
    off();
    expect(m.__unsub).toHaveBeenCalledTimes(1);
  });
});

describe('MountFs.onChange — non-working-tree mount (v1 gap)', () => {
  it('is an INERT subscription: it never touches the working-tree channel', () => {
    const fs = openFs(mount({ path: '/mnt/space', type: 'firestore' }));
    const seen: string[][] = [];
    const off = fs.onChange((paths) => seen.push(paths));
    // No projection of the working-tree channel for a space mount (O2).
    expect(m.onFsChange).not.toHaveBeenCalled();
    m.__emit(['/should-not-arrive.ts'], 1);
    expect(seen).toEqual([]);
    expect(() => off()).not.toThrow(); // unsubscribe is a safe no-op
  });
});
