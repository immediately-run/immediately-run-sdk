/**
 * @jest-environment jsdom
 */
// FileRouter wraps routed Markdown in the prose article and leaves everything else alone.
// The route params come from the real default route table, matched the way the router
// matches it, so the `*` wildcard the component reads is the one boot() produces.
import { mkdirSync, mkdtempSync, promises as nodeFs, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { DEFAULT_ROUTING_SPEC } from '../boot';
import { applyRoutingRule } from '../routing';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { FileRouter } from './FileRouter';
import { PROSE_CLASS } from '../proseStyles';
import { parseHref } from '../urlUtils';

const OUTER_BASE = 'https://immediately.run/present/github/immediately-run/dibber/main';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./Include', () => ({
  Include: ({ filename }: { filename: string }) => <p data-included={filename}>included</p>,
}));

const render = async (sandboxPath: string) => {
  // The outer URL the host hands the frame, parsed the way boot() parses it.
  const outerHref = `${OUTER_BASE}${sandboxPath}`;
  const navigationState = parseHref(outerHref);
  expect(navigationState.sandboxPath).toBe(sandboxPath);
  const applied = applyRoutingRule(DEFAULT_ROUTING_SPEC, navigationState);
  expect(applied?.routingRule.name).toBe('FileRouter');
  const state = {
    outerHref,
    navigationState: { ...navigationState, pathParameters: applied!.pathParameters },
  } as unknown as TinkerableState;
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <TinkerableContext value={state}>
        <FileRouter />
      </TinkerableContext>,
    ),
  );
  // Real fs reads settle on the I/O queue, after act's microtask flush: let them land
  // (bounded, so a stuck Suspense fails the assertion below instead of hanging).
  for (let i = 0; i < 20 && container.querySelector('[data-included], nav') === null; i++) {
    await act(() => new Promise((r) => setTimeout(r, 10)));
  }
  return { container, unmount: () => act(() => root.unmount()) };
};

describe('FileRouter prose wrapper', () => {
  it.each(['/files/README.md', '/files/docs/guide.mdx'])('wraps %s in the prose article', async (path) => {
    const { container, unmount } = await render(path);
    const article = container.querySelector(`article.${PROSE_CLASS}`);
    expect(article).not.toBeNull();
    expect(article!.querySelector('[data-included]')).not.toBeNull();
    unmount();
  });

  it.each(['/files/src/App.tsx', '/files/index.html'])('renders %s unwrapped', async (path) => {
    const { container, unmount } = await render(path);
    expect(container.querySelector('article')).toBeNull();
    expect(container.querySelector('[data-included]')).not.toBeNull();
    unmount();
  });
});

// The README of dibber links `[tickets/](tickets/)`; the route used to hand `tickets/` to
// the module loader, which failed with "Cannot find module '/app/tickets'". The fs here is
// Node's own over a temp tree, re-rooted at `/app` (real Stats/Dirent shapes).
describe('FileRouter on a folder', () => {
  let root: string;
  const g = globalThis as { __sandpackSharedFs?: unknown };
  const rerooted = (p: string) => join(root, p.replace(/^\/app/, ''));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ir-filerouter-'));
    mkdirSync(join(root, 'tickets/projects'), { recursive: true });
    writeFileSync(join(root, 'tickets/DIB-15.md'), '');
    writeFileSync(join(root, 'tickets/README.md'), '');
    g.__sandpackSharedFs = {
      promises: {
        readFile: (p: string) => nodeFs.readFile(rerooted(p)),
        stat: (p: string) => nodeFs.stat(rerooted(p)),
        readdir: (p: string, o?: { withFileTypes: true }) => nodeFs.readdir(rerooted(p), o as { withFileTypes: true }),
      },
    };
  });

  afterEach(() => {
    delete g.__sandpackSharedFs;
    rmSync(root, { recursive: true, force: true });
  });

  it.each(['/files/tickets/', '/files/tickets'])('lists %s instead of requiring it', async (path) => {
    const { container, unmount } = await render(path);
    const nav = container.querySelector('nav[data-ir-directory="/tickets/"]');
    expect(nav).not.toBeNull();
    expect([...nav!.querySelectorAll('li a')].map((a) => a.textContent)).toEqual([
      '../',
      'projects/',
      'DIB-15.md',
      'README.md',
    ]);
    // Each entry routes to its own filesystem-true `files/` URL.
    expect([...nav!.querySelectorAll('li a')].map((a) => a.getAttribute('href'))).toEqual([
      `${OUTER_BASE}/files/`,
      `${OUTER_BASE}/files/tickets/projects/`,
      `${OUTER_BASE}/files/tickets/DIB-15.md`,
      `${OUTER_BASE}/files/tickets/README.md`,
    ]);
    // The folder's README renders under the listing; nothing tried to include the folder.
    const included = [...container.querySelectorAll('[data-included]')].map((e) => e.getAttribute('data-included'));
    expect(included).toEqual(['/app/tickets/README.md']);
    unmount();
  });

  it('still includes a file that exists', async () => {
    const { container, unmount } = await render('/files/tickets/DIB-15.md');
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('[data-included]')!.getAttribute('data-included')).toBe('/app/tickets/DIB-15.md');
    unmount();
  });
});
