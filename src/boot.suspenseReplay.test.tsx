/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://localhost/?href=https%3A%2F%2Flocalhost%2Fpresent%2Fgithub%2Facme%2Fblog%2Fmain%2Ffiles%2Fsrc%2FApp.tsx"}
 */
// R3-940 — the Suspense-replay investigation harness.
//
// Live evidence (2026-10-05, R3-938's session): an app component's useEffect with
// STABLE deps re-ran mid-session while the component instance demonstrably survived
// (one instance id, refs/DOM/in-flight promise chains preserved) — the signature of
// a Suspense boundary above the app hiding and re-revealing its subtree, i.e. some
// `use()` under it saw a promise identity change at runtime.
//
// This suite boots the REAL `boot()` tree over a FAKE module system (an
// EvaluationContext-shaped double standing in for the sandbox's), routes
// `/files/src/App.tsx` to an `<Include>` exactly as `FileRouter` does (FileRouter
// itself passes the sandbox realm's `module`, which does not exist under ts-jest —
// the shim is the one seam), then drives the host events the live session saw —
// metadata updates, a settings/mount announce, urlchange, a compile notice —
// while counting effect runs on a child under the boundary and tagging the
// identity of every promise the boundary's `use()` is handed.
//
// The second test is the fault-injection control: it arms a sibling suspender
// UNDER the same boundary, proving the harness detects exactly the hide/reveal
// signature seen live (effect cleanup+setup on a surviving instance).
import { act } from 'react';
import { use, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { boot } from './boot';
import { Include } from './components/Include';
import { ModuleCache } from './moduleCache';
import { openSettings } from './mounts';
import { useRouteParams } from './routing';
import { createMockHost } from './testing';
import type { RoutingSpec } from './RoutingSpec';
import { COMPILE, METADATA_UPDATE, MOUNT_ADD, SESSION_MOUNTS, URLCHANGE } from './generated/protocol';
import { underAppRoot } from './urlUtils';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = createMockHost();

// Captured BEFORE any spying so the spy can delegate to the real implementation
// (the identity under test is what the REAL cache returns per render).
const REAL_GET_EVALUATION_CONTEXT = ModuleCache.prototype.getEvaluationContext;

interface Probe {
  renders: number;
  effectRuns: number;
  cleanups: number;
  instances: Set<object>;
  settingsResolved: number;
}

const makeProbeApp = (probe: Probe, Extra?: () => ReactNode, withSettingsCall = false) => {
  const ProbeApp = () => {
    probe.renders++;
    const inst = useRef({});
    useEffect(() => {
      probe.effectRuns++;
      // Instance identity is recorded in the EFFECT, not during render:
      // StrictMode's dev double-render discards one render pass's ref, so a
      // render-time probe would see two identities for one mounted instance.
      probe.instances.add(inst.current);
      // The live drill's boot effect opened the app's settings mount; the
      // replay fired around that call. Mirrored here so a replay re-issues the
      // protocol round-trip — visible at the wire as a second `settings:open`.
      let cancelled = false;
      if (withSettingsCall) {
        void openSettings().then(
          () => {
            if (!cancelled) probe.settingsResolved++;
          },
          () => undefined,
        );
      }
      return () => {
        cancelled = true;
        probe.cleanups++;
      };
    }, []);
    return (
      <main>
        probe-app
        {Extra ? <Extra /> : null}
      </main>
    );
  };
  return ProbeApp;
};

// ---------------------------------------------------------------------------
// The fake module system. Only the three surface points `ModuleCache` touches
// are real: `evaluation.module.filepath` (the cache key), `resolve`, and
// `getModuleEvaluationContext`. The mock defers one macrotask so the boundary
// genuinely suspends once at boot, exactly as a real module evaluation does.
// ---------------------------------------------------------------------------
const makeModuleSystem = (ProbeApp: () => ReactElement) => {
  const appContext = { exports: { default: ProbeApp } };
  const getModuleEvaluationContext = jest.fn(
    (_name: string): Promise<typeof appContext> => new Promise((resolve) => setTimeout(() => resolve(appContext), 0)),
  );
  const baseModule = {
    evaluation: { module: { filepath: '/node_modules/@immediately-run/sdk/components/FileRouter.js' } },
    resolve: async (name: string) => name,
    getModuleEvaluationContext,
  };
  return { baseModule, getModuleEvaluationContext };
};

/** The FileRouter stand-in: the same `<Include>` call shape, with the fake
 *  module system injected where FileRouter passes the sandbox realm's `module`. */
const makeFileRouteShim = (baseModule: unknown) => {
  const FileRouteShim = () => {
    const params = useRouteParams();
    const filename = params['*'];
    return <Include filename={underAppRoot('/' + filename)} baseModule={baseModule as never} />;
  };
  return FileRouteShim;
};

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

const INITIAL_HREF = 'https://localhost/present/github/acme/blog/main/files/src/App.tsx';

const bootOnce = async (spec: RoutingSpec): Promise<void> => {
  document.body.innerHTML = '<div id="root"></div>';
  // Awaited: a sync `act()` around a render that SUSPENDS drops the boundary's
  // retry (React warns "suspended inside an act scope … not awaited"), leaving
  // the tree on the fallback forever.
  await act(async () => {
    boot({ routingSpec: spec });
  });
};

describe('R3-940 — the app-frame Suspense replay', () => {
  let promiseLog: Promise<unknown>[];
  let spy: jest.SpyInstance;

  const installIdentitySpy = () => {
    promiseLog = [];
    spy = jest
      .spyOn(ModuleCache.prototype, 'getEvaluationContext')
      .mockImplementation(function (this: ModuleCache, ...args: unknown[]) {
        const p = REAL_GET_EVALUATION_CONTEXT.apply(this, args as [string, never]);
        promiseLog.push(p);
        return p;
      });
  };

  beforeEach(() => host.install());
  afterEach(() => {
    spy?.mockRestore();
    document.body.innerHTML = '';
    host.uninstall();
  });

  it('never replays a stable-deps effect under metadata / mount-announce / urlchange / compile pushes', async () => {
    // The settings round-trip is stubbed with a one-macrotask delay so the
    // mount announce can land while `openSettings()` is genuinely in flight —
    // the exact interleave the live replay fired in.
    const SETTINGS_MOUNT = { path: '/mnt/settings-app', type: 'firestore', id: 'settings-1' };
    host.stubProtocol(
      'settings',
      'open',
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: SETTINGS_MOUNT }), 0)),
    );

    const probe: Probe = { renders: 0, effectRuns: 0, cleanups: 0, instances: new Set(), settingsResolved: 0 };
    const system = makeModuleSystem(makeProbeApp(probe, undefined, true));
    installIdentitySpy();
    const FileRouteShim = makeFileRouteShim(system.baseModule);
    await bootOnce({ routes: [{ name: 'Files', pattern: '/files/*', element: <FileRouteShim /> }] });

    // The module boundary resolves and the `settings:open` reply lands; the
    // boot effect is now parked in `waitForMount` — genuinely in flight…
    await flush();
    // …when the settings/mount announce lands, exactly the live interleave.
    // (The announce must follow the reply here because the transport mount
    // service is constructed lazily by the wait; the injected live service
    // exists from realm boot, so live ordering is announce-then-reply and
    // `waitForMount`'s initial replay catches it.)
    act(() => {
      host.emit({ type: MOUNT_ADD, mount: SETTINGS_MOUNT });
      host.emit({ type: SESSION_MOUNTS, mounts: [{ ...SETTINGS_MOUNT, forwardedToApp: true }] });
    });
    await flush();

    const rootEl = document.getElementById('root')!;
    expect(rootEl.textContent).toContain('probe-app');
    // The module evaluated once; the boundary saw exactly one promise identity;
    // the in-flight settings call resolved on the one live instance.
    expect(system.getModuleEvaluationContext).toHaveBeenCalledTimes(1);
    expect(new Set(promiseLog).size).toBe(1);
    expect(probe.settingsResolved).toBe(1);

    // Baseline AFTER the initial settle (StrictMode's dev double-mount is part
    // of boot() and is not the phenomenon under test — only deltas from here).
    const baseline = {
      effectRuns: probe.effectRuns,
      cleanups: probe.cleanups,
      settingsResolved: probe.settingsResolved,
    };
    const rendersBefore = probe.renders;

    const expectNoReplay = (label: string) => {
      expect({ label, effectRuns: probe.effectRuns }).toEqual({ label, effectRuns: baseline.effectRuns });
      expect({ label, cleanups: probe.cleanups }).toEqual({ label, cleanups: baseline.cleanups });
      expect({ label, instances: probe.instances.size }).toEqual({ label, instances: 1 });
      expect({ label, promiseIdentities: new Set(promiseLog).size }).toEqual({ label, promiseIdentities: 1 });
      // A replay re-runs the boot effect, which re-issues `openSettings()` — a
      // second resolution lands here even if the effect's own state writes are
      // swallowed. The wire-level tripwire for the exact live signature.
      expect({ label, settingsResolved: probe.settingsResolved }).toEqual({
        label,
        settingsResolved: baseline.settingsResolved,
      });
      expect(rootEl.textContent).toContain('probe-app');
    };

    // 1. A metadata update with a CHANGED entry — the live bundler pushes these
    //    as files compile. This MUST re-render the tree (the sensitivity
    //    control: a suite where nothing re-renders proves nothing), and must
    //    NOT replay the effect.
    const changedMetadata = { '/app/content/a.mdx': { title: 'A' } };
    act(() => {
      host.emit({ type: METADATA_UPDATE, update: changedMetadata });
    });
    await flush();
    expect(probe.renders).toBeGreaterThan(rendersBefore);
    expectNoReplay('metadata-update (changed)');

    // 2. The same update again — `updateAlreadyApplied` declines it (control).
    const rendersAfterFirst = probe.renders;
    act(() => {
      host.emit({ type: METADATA_UPDATE, update: changedMetadata });
    });
    await flush();
    expect(probe.renders).toBe(rendersAfterFirst);
    expectNoReplay('metadata-update (already applied)');

    // 3. urlchange re-announcing the SAME href — the host's echo. A no-op.
    act(() => {
      host.emit({ type: URLCHANGE, url: INITIAL_HREF, back: false, forward: false });
    });
    await flush();
    expectNoReplay('urlchange (same href)');

    // 4. urlchange with only the QUERY changed — same route, same filename:
    //    the context object is rebuilt (a full tree re-render) while the
    //    module identity is untouched.
    act(() => {
      host.emit({ type: URLCHANGE, url: `${INITIAL_HREF}?x=1`, back: false, forward: false });
    });
    await flush();
    expectNoReplay('urlchange (query only)');

    // 5. A SECOND mount announce mid-session (a grant landing, the other live
    //    replay point) plus the matching session-mounts push.
    act(() => {
      host.emit({ type: MOUNT_ADD, mount: { path: '/mnt/space-a', type: 'firestore', id: 'space-a' } });
      host.emit({ type: SESSION_MOUNTS, mounts: [{ ...SETTINGS_MOUNT, forwardedToApp: true }] });
    });
    await flush();
    expectNoReplay('second mount announce');

    // 6. A compile notice — the ModuleCache reset seam (deliberately disabled).
    act(() => {
      host.emit({ type: COMPILE });
    });
    await flush();
    expectNoReplay('compile');

    // 7. A render AFTER the compile — the reset-seam tripwire: re-enabling the
    //    COMPILE cache reset only bites on the NEXT render, when the same key
    //    suddenly answers a fresh promise. (Fault-injection-proven: with the
    //    reset lines uncommented this step goes red — replay AND a second
    //    promise identity.)
    act(() => {
      host.emit({ type: METADATA_UPDATE, update: { '/app/content/b.mdx': { title: 'B' } } });
    });
    await flush();
    expectNoReplay('render after compile');

    // The whole session: the module still evaluated exactly once.
    expect(system.getModuleEvaluationContext).toHaveBeenCalledTimes(1);
  });

  it('control: a fresh suspending promise UNDER the boundary replays the subtree on a surviving instance', async () => {
    // Fault injection (ways_of_working §4): arm a sibling of the probe that
    // suspends on a NEW promise mid-session. This is the mechanism the live
    // signature implies — the harness must see it, or the negative result
    // above is vacuous.
    let arm: (() => void) | null = null;
    let release: (() => void) | null = null;
    let armedPromise: Promise<void> | null = null;

    const Suspender = () => {
      const [isArmed, setArmed] = useState(false);
      useEffect(() => {
        arm = () => setArmed(true);
      }, []);
      if (isArmed) {
        if (!armedPromise) {
          armedPromise = new Promise<void>((resolve) => {
            release = () => resolve();
          });
        }
        use(armedPromise);
      }
      return null;
    };

    const probe: Probe = { renders: 0, effectRuns: 0, cleanups: 0, instances: new Set(), settingsResolved: 0 };
    const system = makeModuleSystem(makeProbeApp(probe, Suspender));
    installIdentitySpy();
    const FileRouteShim = makeFileRouteShim(system.baseModule);
    await bootOnce({ routes: [{ name: 'Files', pattern: '/files/*', element: <FileRouteShim /> }] });
    await flush();

    const runsAtBoot = probe.effectRuns;
    const cleanupsAtBoot = probe.cleanups;
    expect(probe.instances.size).toBe(1);

    // Arm the sibling, then release. React 19 defers the hide's effect
    // teardown past the arming commit (the fallback paints first), so the
    // assertions sit after the WHOLE hide/reveal cycle, not between phases.
    await act(async () => {
      arm!();
    });
    await flush();

    // Release: the boundary re-reveals — effects RE-RUN on the SAME instance…
    await act(async () => {
      release!();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();

    // The replay signature, exactly as seen live: at least one cleanup+setup
    // pair beyond boot, on the SAME instance (refs/state/DOM survive a
    // Suspense hide/reveal)…
    expect(probe.cleanups).toBeGreaterThan(cleanupsAtBoot);
    expect(probe.effectRuns).toBeGreaterThan(runsAtBoot);
    expect(probe.instances.size).toBe(1);
    // …and the boundary's own promise identity NEVER changed: the replay was
    // driven entirely by the fresh sibling promise.
    expect(new Set(promiseLog).size).toBe(1);
  });
});
