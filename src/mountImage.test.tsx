/**
 * @jest-environment jsdom
 */
// Covers the React layer of the ZenFS image surface: `useObjectUrl` (via the
// `MountImage` component) reads bytes off a fake sandbox port, turns them into a
// (mocked) object URL, renders an `<img>`, and revokes the URL on unmount.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MountImage } from './components/MountImage';
import { useObjectUrl } from './hooks';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import type { SandboxFsPort } from './fs';
import type { SandboxMount } from './mounts';

// jsdom here doesn't expose TextEncoder as a global — polyfill it for the fake port.
if (typeof (globalThis as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  (globalThis as { TextEncoder?: unknown }).TextEncoder = NodeTextEncoder;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const enc = new TextEncoder();
const fakePort = (files: Record<string, string>): SandboxFsPort =>
  ({
    promises: {
      async readFile(path: string) {
        if (!(path in files)) throw Object.assign(new Error('nope'), { code: 'ENOENT' });
        return enc.encode(files[path]);
      },
    },
  } as unknown as SandboxFsPort);

const install = (port: SandboxFsPort | null) => {
  if (port) (globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs = port;
  else delete (globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs;
};

const mount = (over: Partial<SandboxMount> = {}): SandboxMount =>
  ({ path: '/mnt/abc', type: 'firestore', ...over } as SandboxMount);

const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
let created: Blob[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  URL.createObjectURL = ((b: Blob) => {
    created.push(b);
    return `blob:mock/${created.length}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((u: string) => {
    revoked.push(u);
  }) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  install(null);
});

describe('MountImage', () => {
  it('renders an <img> from the mounted file, then revokes on unmount', async () => {
    install(fakePort({ '/mnt/abc/photos/cat.png': 'PNGDATA' }));
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<MountImage mount={mount()} relPath="photos/cat.png" alt="cat" className="hero" />);
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('blob:mock/1');
    expect(img!.getAttribute('alt')).toBe('cat');
    expect(img!.getAttribute('class')).toBe('hero'); // extra <img> props pass through
    expect(created[0].type).toBe('image/png');

    await act(async () => root.unmount());
    expect(revoked).toEqual(['blob:mock/1']); // no leaked object URL
  });

  it('shows the fallback when the file is missing', async () => {
    install(fakePort({}));
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MountImage mount={mount()} relPath="missing.png" fallback={<span>gone</span>} />,
      );
    });

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('gone');
  });
});

describe('useObjectUrl', () => {
  it('is idle (no read) when mount or relPath is nullish', async () => {
    install(fakePort({ '/mnt/abc/x.png': 'p' }));
    const seen: { url: string | null; loading: boolean }[] = [];
    const Probe = () => {
      const { url, loading } = useObjectUrl(null, 'x.png');
      seen.push({ url, loading });
      return null;
    };
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Probe />));
    expect(seen[seen.length - 1]).toEqual({ url: null, loading: false });
    expect(created).toHaveLength(0);
    await act(async () => root.unmount());
  });
});
