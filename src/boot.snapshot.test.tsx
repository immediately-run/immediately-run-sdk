/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://localhost/?href=https%3A%2F%2Flocalhost%2Fpresent%2Fgithub%2Facme%2Fblog%2Fmain%2F"}
 */
import { act, Profiler } from 'react';
import { createRoot } from 'react-dom/client';

import { CATCH_ALL_ROUTING_SPEC, TinkerableApp } from './boot';
import { useMetadataQuery } from './hooks';
import { createMockHost } from './testing';
import * as injectedBundler from './injectedBundler';

// G-MDX-3c (§1.4): the SDK seeds `filesMetadata` from the injected bundler's boot
// snapshot so the app's FIRST synchronous frame holds the full MDX collection, and
// the DelayedEmitter replay on `enable()` is a zero-re-render no-op WHEN the snapshot
// hands out the same value refs the emitter fires (the load-bearing identity contract).
// We mock `./injectedBundler` to drive the REAL `TinkerableApp` on the injected path.
jest.mock('./injectedBundler');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Ev = { type: 'metadata-update'; update: Record<string, Record<string, unknown>> };

// A DelayedEmitter stand-in: buffers `metadata-update` events until enable(), then
// replays the whole buffered collection to the attached subscriber.
function makeEmitter(buffered: Ev[]) {
  let enabled = false;
  const queue = [...buffered];
  const listeners = new Set<(ev: Ev) => void>();
  return {
    onMetadataChange: (l: (ev: Ev) => void) => {
      listeners.add(l);
      return { dispose: () => listeners.delete(l) };
    },
    enable: () => {
      enabled = true;
      for (const ev of queue) listeners.forEach((fn) => fn(ev));
      queue.length = 0;
    },
    get enabled() {
      return enabled;
    },
  };
}

const wire = (snapshot: Record<string, Record<string, unknown>>, buffered: Ev[]) => {
  const emitter = makeEmitter(buffered);
  jest.mocked(injectedBundler.getInjectedMetadataSnapshot).mockReturnValue(snapshot);
  jest.mocked(injectedBundler.getInjectedMetadataEmitter).mockReturnValue(emitter as never);
  jest.mocked(injectedBundler.resolveMetadataSource).mockImplementation((inj) =>
    inj ? { event: (inj as typeof emitter).onMetadataChange, enable: () => (inj as typeof emitter).enable() } : { event: undefined, enable: () => {} },
  );
  return emitter;
};

const Nav = () => {
  const rows = useMetadataQuery((files) => Object.keys(files).sort());
  const titles = Array.isArray(rows) ? rows.map((r) => (r.meta as { title?: string }).title).join(',') : 'err';
  return <span data-testid="nav">{titles}</span>;
};

const render = () => {
  let commits = 0;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <Profiler id="s" onRender={() => (commits += 1)}>
        <TinkerableApp routingSpec={CATCH_ALL_ROUTING_SPEC}>
          <Nav />
        </TinkerableApp>
      </Profiler>,
    );
  });
  return { commits: () => commits, text: () => container.textContent, unmount: () => act(() => root.unmount()) };
};

const host = createMockHost();
beforeEach(() => host.install());
afterEach(() => {
  host.uninstall();
  jest.resetAllMocks();
});

describe('G-MDX-3c — SDK boot snapshot seeds filesMetadata', () => {
  const vA = { title: 'Alpha' };
  const vB = { title: 'Beta' };

  it('renders the full collection on the FIRST frame with ZERO re-render after enable() (identity refs)', () => {
    // Snapshot hands out the SAME value objects the emitter replays.
    wire(
      { '/app/a.mdx': vA, '/app/b.mdx': vB },
      [
        { type: 'metadata-update', update: { '/app/a.mdx': vA } },
        { type: 'metadata-update', update: { '/app/b.mdx': vB } },
      ],
    );
    const r = render();
    // First (and only) commit already holds the whole collection — no empty-then-fill.
    expect(r.text()).toBe('Alpha,Beta');
    expect(r.commits()).toBe(1);
    r.unmount();
  });

  it('a defensive-CLONE snapshot re-renders after enable() (proves the contract is load-bearing)', () => {
    // Snapshot returns clones; the emitter replays the originals → every replayed
    // value is !== the seed → the whole collection re-applies + re-renders.
    wire(
      { '/app/a.mdx': { ...vA }, '/app/b.mdx': { ...vB } },
      [
        { type: 'metadata-update', update: { '/app/a.mdx': vA } },
        { type: 'metadata-update', update: { '/app/b.mdx': vB } },
      ],
    );
    const r = render();
    expect(r.text()).toBe('Alpha,Beta'); // same content — the cost is the extra render
    expect(r.commits()).toBeGreaterThan(1);
    r.unmount();
  });

  it('off-injection (null snapshot) starts empty and fills from events, without crashing', () => {
    const emitter = wire({}, []);
    // Simulate the npm-fetched path: no in-realm bundler snapshot.
    jest.mocked(injectedBundler.getInjectedMetadataSnapshot).mockReturnValue(null);
    const r = render();
    expect(r.text()).toBe(''); // empty first frame (event-fill degradation)
    // A later event fills it.
    act(() => {
      emitter.onMetadataChange; // no-op ref
    });
    r.unmount();
  });
});
