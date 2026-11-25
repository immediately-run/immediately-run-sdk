// The directory probe and listing read through the sandbox fs port. The port here is
// Node's own `fs.promises` over a temp tree, re-rooted at `/app` — real `Stats` and
// `Dirent` objects, the node-compatible shapes ZenFS mirrors, rather than hand-built stubs.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { promises as nodeFs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isDirectoryPath, namesDirectory, readDirectoryListing, toDirPath } from './directoryListing';

let root: string;
const g = globalThis as { __sandpackSharedFs?: unknown };

const rerooted = (p: string) => {
  if (!p.startsWith('/app')) throw new Error(`probe escaped the app root: ${p}`);
  return join(root, p.slice('/app'.length));
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ir-dirlist-'));
  mkdirSync(join(root, 'tickets/projects'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# repo');
  writeFileSync(join(root, 'tickets/DIB-10.md'), '');
  writeFileSync(join(root, 'tickets/b-2.md'), '');
  writeFileSync(join(root, 'tickets/README.md'), '# tickets');
  mkdirSync(join(root, 'empty'));
  g.__sandpackSharedFs = {
    promises: {
      readFile: (p: string, enc?: BufferEncoding) => nodeFs.readFile(rerooted(p), enc),
      stat: (p: string) => nodeFs.stat(rerooted(p)),
      readdir: (p: string, o?: { withFileTypes: true }) => nodeFs.readdir(rerooted(p), o as { withFileTypes: true }),
    },
  };
});

afterEach(() => {
  delete g.__sandpackSharedFs;
  rmSync(root, { recursive: true, force: true });
});

describe('toDirPath / namesDirectory', () => {
  it.each([
    ['tickets/', '/tickets/'],
    ['tickets', '/tickets/'],
    ['/a/b/', '/a/b/'],
    ['', '/'],
    ['/', '/'],
  ])('%j → %j', (input, out) => expect(toDirPath(input)).toBe(out));

  it('only a trailing slash (or the empty path) names a folder without a probe', () => {
    expect(namesDirectory('tickets/')).toBe(true);
    expect(namesDirectory('')).toBe(true);
    expect(namesDirectory('tickets')).toBe(false);
    expect(namesDirectory('README.md')).toBe(false);
  });
});

describe('isDirectoryPath', () => {
  it('is true for a folder and false for a file or a missing path', async () => {
    expect(await isDirectoryPath('tickets')).toBe(true);
    expect(await isDirectoryPath('tickets/DIB-10.md')).toBe(false);
    expect(await isDirectoryPath('nope')).toBe(false);
  });

  it('is false with no fs, so the file path (and its own error) still renders', async () => {
    delete g.__sandpackSharedFs;
    expect(await isDirectoryPath('tickets')).toBe(false);
  });
});

describe('readDirectoryListing', () => {
  it('lists folders first, then files by name, and picks the README', async () => {
    const listing = await readDirectoryListing('tickets/');
    expect(listing).toEqual({
      dir: '/tickets/',
      parent: '/',
      readme: '/tickets/README.md',
      entries: [
        { name: 'projects', isDirectory: true, path: '/tickets/projects/' },
        { name: 'b-2.md', isDirectory: false, path: '/tickets/b-2.md' },
        { name: 'DIB-10.md', isDirectory: false, path: '/tickets/DIB-10.md' },
        { name: 'README.md', isDirectory: false, path: '/tickets/README.md' },
      ],
    });
  });

  it('gives a nested folder its parent, and the root none', async () => {
    expect((await readDirectoryListing('tickets/projects')).parent).toBe('/tickets/');
    expect((await readDirectoryListing('')).parent).toBeNull();
  });

  it('an empty folder lists nothing and has no README', async () => {
    expect(await readDirectoryListing('empty/')).toMatchObject({ entries: [], readme: null });
  });

  it('rejects rather than listing nothing when the folder is missing or the fs is absent', async () => {
    await expect(readDirectoryListing('missing/')).rejects.toThrow(/ENOENT/);
    delete g.__sandpackSharedFs;
    await expect(readDirectoryListing('tickets/')).rejects.toThrow(/sandbox filesystem is unavailable/);
  });
});
