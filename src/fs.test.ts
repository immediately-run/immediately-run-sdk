// SDK filesystem surface (SDK_FS_SURFACE_SPEC). Driven against a fake ZenFS port
// installed on `globalThis.__sandpackSharedFs`: assert mount-relative path joining,
// the `..`/absolute escape rejection, the errno→`.code` mapping, the bytes/utf8 read
// shape, and the `canWrite` mode/rules hint.

import { openFs, fsAvailable, mimeTypeFor, sandboxFs, type FsError, type SandboxFsPort } from './fs';
import type { SandboxMount } from './mounts';

type Calls = { method: string; args: unknown[] }[];

function fakePort(files: Record<string, string>, opts: { roFs?: boolean } = {}) {
  const calls: Calls = [];
  const enc = new TextEncoder();
  const errno = (code: string, msg: string) => Object.assign(new Error(msg), { code });
  const promises = {
    async readFile(path: string) {
      calls.push({ method: 'readFile', args: [path] });
      if (!(path in files)) throw errno('ENOENT', `no such file ${path}`);
      return enc.encode(files[path]);
    },
    async writeFile(path: string, data: string | Uint8Array) {
      calls.push({ method: 'writeFile', args: [path, data] });
      if (opts.roFs) throw errno('EROFS', 'read-only file system');
      files[path] = typeof data === 'string' ? data : new TextDecoder().decode(data);
    },
    async readdir(path: string) {
      calls.push({ method: 'readdir', args: [path] });
      return [
        { name: 'a.txt', isDirectory: () => false },
        { name: 'sub', isDirectory: () => true },
      ];
    },
    async stat(path: string) {
      calls.push({ method: 'stat', args: [path] });
      if (!(path in files)) throw errno('ENOENT', `no such file ${path}`);
      return { isDirectory: () => false, size: files[path].length, mtimeMs: 1 };
    },
    async mkdir(path: string, o: unknown) {
      calls.push({ method: 'mkdir', args: [path, o] });
    },
    async rm(path: string, o: unknown) {
      calls.push({ method: 'rm', args: [path, o] });
    },
    async rename(from: string, to: string) {
      calls.push({ method: 'rename', args: [from, to] });
    },
  };
  return { port: { promises } as SandboxFsPort, calls, files };
}

const mount = (over: Partial<SandboxMount> = {}): SandboxMount =>
  ({ path: '/mnt/abc', type: 'firestore', ...over } as SandboxMount);

afterEach(() => {
  delete (globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs;
});

const install = (port: SandboxFsPort) => {
  (globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs = port;
};

describe('fsAvailable / sandboxFs', () => {
  it('is false with no port, true once installed', () => {
    expect(fsAvailable()).toBe(false);
    expect(sandboxFs()).toBeNull();
    install(fakePort({}).port);
    expect(fsAvailable()).toBe(true);
    expect(sandboxFs()).not.toBeNull();
  });
});

describe('openFs path anchoring', () => {
  it('joins relPath under the mount root', async () => {
    const f = fakePort({ '/mnt/abc/notes/idea.mdx': 'hello' });
    install(f.port);
    const fs = openFs(mount());
    await expect(fs.readFile('notes/idea.mdx', 'utf8')).resolves.toBe('hello');
    expect(f.calls[f.calls.length - 1]).toEqual({ method: 'readFile', args: ['/mnt/abc/notes/idea.mdx'] });
  });

  it('reads raw bytes when no encoding is given', async () => {
    const f = fakePort({ '/mnt/abc/x': 'hi' });
    install(f.port);
    const out = await openFs(mount()).readFile('x');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(out)).toBe('hi');
  });

  it('rejects `..` and absolute relPaths with invalid-path', async () => {
    install(fakePort({}).port);
    const fs = openFs(mount());
    await expect(fs.readFile('../escape', 'utf8')).rejects.toMatchObject({ code: 'invalid-path' });
    await expect(fs.readFile('/abs', 'utf8')).rejects.toMatchObject({ code: 'invalid-path' });
  });
});

describe('error mapping', () => {
  it('maps ENOENT → not-found, and exists() returns false', async () => {
    install(fakePort({}).port);
    const fs = openFs(mount());
    await expect(fs.readFile('missing', 'utf8')).rejects.toMatchObject({ code: 'not-found' });
    await expect(fs.exists('missing')).resolves.toBe(false);
  });

  it('maps EROFS → read-only on a ro fs', async () => {
    install(fakePort({}, { roFs: true }).port);
    const err = await openFs(mount({ mode: 'ro' }))
      .writeFile('x', 'y')
      .catch((e: FsError) => e);
    expect((err as FsError).code).toBe('read-only');
  });

  it('throws unavailable when no port is installed', async () => {
    const fs = openFs(mount());
    await expect(fs.readFile('x', 'utf8')).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('readdir', () => {
  it('maps entries to typed DirEntry', async () => {
    install(fakePort({}).port);
    const entries = await openFs(mount()).readdir('notes');
    expect(entries).toEqual([
      { name: 'a.txt', kind: 'file' },
      { name: 'sub', kind: 'dir' },
    ]);
  });
});

describe('mimeTypeFor', () => {
  it('maps known image extensions, case-insensitively', () => {
    expect(mimeTypeFor('a/b/cat.png')).toBe('image/png');
    expect(mimeTypeFor('CAT.JPG')).toBe('image/jpeg');
    expect(mimeTypeFor('logo.svg')).toBe('image/svg+xml');
    expect(mimeTypeFor('x.webp')).toBe('image/webp');
  });
  it('returns undefined for unknown or extension-less names', () => {
    expect(mimeTypeFor('README')).toBeUndefined();
    expect(mimeTypeFor('data.bin')).toBeUndefined();
  });
});

describe('readBlob', () => {
  it('wraps bytes in a Blob typed from the extension', async () => {
    const f = fakePort({ '/mnt/abc/cat.png': 'PNGDATA' });
    install(f.port);
    const blob = await openFs(mount()).readBlob('cat.png');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe('PNGDATA'.length);
  });
  it('honors an explicit type override and falls back to octet-stream', async () => {
    const f = fakePort({ '/mnt/abc/note': 'hi', '/mnt/abc/x.png': 'p' });
    install(f.port);
    const fs = openFs(mount());
    expect((await fs.readBlob('note')).type).toBe('application/octet-stream');
    expect((await fs.readBlob('x.png', { type: 'image/custom' })).type).toBe('image/custom');
  });
  it('propagates typed fs errors (not-found)', async () => {
    install(fakePort({}).port);
    await expect(openFs(mount()).readBlob('missing.png')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('readObjectUrl', () => {
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  afterEach(() => {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  });
  it('creates a URL from the blob and revokes on demand', async () => {
    const created: Blob[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = ((b: Blob) => {
      created.push(b);
      return `blob:mock/${created.length}`;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((u: string) => {
      revoked.push(u);
    }) as typeof URL.revokeObjectURL;

    install(fakePort({ '/mnt/abc/cat.png': 'PNG' }).port);
    const { url, revoke } = await openFs(mount()).readObjectUrl('cat.png');
    expect(url).toBe('blob:mock/1');
    expect(created[0].type).toBe('image/png');
    revoke();
    expect(revoked).toEqual(['blob:mock/1']);
  });
});

describe('canWrite', () => {
  it('reflects whole-mount mode', () => {
    install(fakePort({}).port);
    expect(openFs(mount({ mode: 'rw' })).canWrite('x')).toBe(true);
    expect(openFs(mount({ mode: 'ro' })).canWrite('x')).toBe(false);
  });

  it('uses the longest-matching rule subtree', () => {
    install(fakePort({}).port);
    const m = mount({
      mode: 'ro',
      rules: [
        { subtree: '/', mode: 'ro' },
        { subtree: '/drafts', mode: 'rw' },
      ],
    });
    const fs = openFs(m);
    expect(fs.canWrite('drafts/post.mdx')).toBe(true);
    expect(fs.canWrite('published/post.mdx')).toBe(false);
  });
});
