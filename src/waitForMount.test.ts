// Regression cover for the `waitForMount` temporal-dead-zone bug.
//
// `onMountsChange` invokes its listener SYNCHRONOUSLY on subscribe (the documented
// initial replay). The original implementation was
//
//   const unsubscribe = onMountsChange((mounts) => { … Promise.resolve().then(unsubscribe) … })
//
// so whenever the mount was ALREADY present, the listener ran during the
// `onMountsChange(...)` call and read `unsubscribe` while it was still in its
// temporal dead zone → `ReferenceError: Cannot access 'unsubscribe' before
// initialization`. That is the *common* path: callers await the host request that
// creates the mount first, so it is normally there by the time they wait for it.
//
// The blast radius was large and silent: `openSettings()` is `settingsRequest('open')`
// followed by `waitForMount`, so every settings-backed feature threw at boot behind a
// caller's `catch {}`. In agent-demo it cost the agent its conversation memory (the
// model's history is read out of the persisted conversation, so a dead store meant
// every turn was sent with the current prompt only).

import { awaitMatchingMount } from './mounts';
import type { SandboxMount } from './mounts';

const settingsMount: SandboxMount = {
  path: '/mnt/25fea0971aff235c77274d08960a5642',
  type: 'firestore',
  id: 'settings:github__immediately-run__agent-demo',
} as SandboxMount;

/** A subscribe that replays the current mounts synchronously, exactly like the
 *  real `onMountsChange`. */
const subscribeWith = (
  initial: SandboxMount[],
): {
  subscribe: (l: (m: SandboxMount[]) => void) => () => void;
  emit: (mounts: SandboxMount[]) => void;
  unsubscribeCalls: () => number;
} => {
  const listeners = new Set<(m: SandboxMount[]) => void>();
  let unsubscribeCalls = 0;
  return {
    subscribe: (l) => {
      listeners.add(l);
      l(initial); // synchronous initial replay — the hazard
      return () => {
        unsubscribeCalls += 1;
        listeners.delete(l);
      };
    },
    emit: (mounts) => listeners.forEach((l) => l(mounts)),
    unsubscribeCalls: () => unsubscribeCalls,
  };
};

describe('awaitMatchingMount (the waitForMount core)', () => {
  it('resolves from the SYNCHRONOUS initial replay without a TDZ throw', async () => {
    const { subscribe } = subscribeWith([settingsMount]);

    // Before the fix this rejected with
    // "ReferenceError: Cannot access 'unsubscribe' before initialization".
    await expect(awaitMatchingMount(subscribe, { id: settingsMount.id })).resolves.toBe(settingsMount);
  });

  it('unsubscribes after an initial-replay resolve (deferred, not during the replay)', async () => {
    const s = subscribeWith([settingsMount]);
    await awaitMatchingMount(s.subscribe, { id: settingsMount.id });
    // The dispose is deferred to a microtask; let it run.
    await Promise.resolve();
    await Promise.resolve();
    expect(s.unsubscribeCalls()).toBe(1);
  });

  it('still resolves when the mount arrives LATER (the original path)', async () => {
    const s = subscribeWith([]);
    const pending = awaitMatchingMount(s.subscribe, { id: settingsMount.id });
    s.emit([settingsMount]);
    await expect(pending).resolves.toBe(settingsMount);
  });

  it('waits forever when no timeout is given (unchanged default)', async () => {
    const s = subscribeWith([]);
    const pending = awaitMatchingMount(s.subscribe, { id: 'never-arrives' });
    const sentinel = Symbol('still-pending');
    await expect(Promise.race([pending, Promise.resolve(sentinel)])).resolves.toBe(sentinel);
  });

  it('rejects with code "timeout" once bounded — so a caller can report it', async () => {
    jest.useFakeTimers();
    try {
      const s = subscribeWith([]);
      const pending = awaitMatchingMount(s.subscribe, { id: 'never-arrives' }, 15_000);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
      jest.advanceTimersByTime(15_000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not fire the timeout when the mount was already there', async () => {
    jest.useFakeTimers();
    try {
      const s = subscribeWith([settingsMount]);
      const found = await awaitMatchingMount(s.subscribe, { id: settingsMount.id }, 15_000);
      expect(found).toBe(settingsMount);
      // No pending timer should survive a resolve (nothing to fire, nothing to leak).
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
