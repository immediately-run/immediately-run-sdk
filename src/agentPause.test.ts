// R3-562 — the pause controller (AGENT_RUN_DURABILITY_SPEC §7 R-ARD-20a).
//
// The loop's use of it is exercised in `agentLoop.test.ts`; what is proved HERE is the
// mechanism's own edges, each of which is a way a paused run silently never resumes.
import { PauseController } from './agentPause';

describe('PauseController', () => {
  it('starts un-paused, so a controller nobody has set changes nothing', async () => {
    const c = new PauseController();
    expect(c.isPaused()).toBe(false);
    await c.whenResumed(); // resolves immediately — the assertion is that it settles
  });

  it('resolves every waiter on resume', async () => {
    const c = new PauseController();
    c.set(true);
    const settled: number[] = [];
    const waits = [0, 1, 2].map((i) => c.whenResumed().then(() => settled.push(i)));
    c.set(false);
    await Promise.all(waits);
    expect(settled.sort()).toEqual([0, 1, 2]);
  });

  it('survives a waiter that pauses again from its own continuation', async () => {
    // The lost/double wake: draining the live waiter set while a continuation adds to it
    // is how one of the two happens. The controller copies before draining.
    const c = new PauseController();
    c.set(true);
    let second: Promise<void> | null = null;
    const first = c.whenResumed().then(() => {
      c.set(true);
      second = c.whenResumed();
    });
    c.set(false);
    await first;
    expect(c.isPaused()).toBe(true);
    c.set(false);
    await second;
    expect(c.isPaused()).toBe(false);
  });

  it('resolves on ABORT while still paused — the leak that would strand a stopped run', async () => {
    // A run stopped (or signed out) while its region is hidden must not await a reveal
    // that never comes: the awaited promise would keep the loop, its transcript and its
    // client alive for the life of the tab.
    const c = new PauseController();
    c.set(true);
    const stop = new AbortController();
    const p = c.whenResumed(stop.signal);
    stop.abort();
    await p;
    expect(c.isPaused()).toBe(true); // it resolved WITHOUT the pause lifting
  });

  it('resolves immediately for a signal that is ALREADY aborted', async () => {
    const c = new PauseController();
    c.set(true);
    const stop = new AbortController();
    stop.abort();
    await c.whenResumed(stop.signal);
  });

  it('is idempotent — setting the value it already holds notifies nobody', () => {
    const c = new PauseController();
    const seen: boolean[] = [];
    c.onChange((p) => seen.push(p));
    c.set(false);
    c.set(true);
    c.set(true);
    c.set(false);
    expect(seen).toEqual([true, false]);
  });

  it('stops notifying an unsubscribed listener', () => {
    const c = new PauseController();
    const seen: boolean[] = [];
    const off = c.onChange((p) => seen.push(p));
    c.set(true);
    off();
    c.set(false);
    expect(seen).toEqual([true]);
  });
});
