import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  ENTRY_STATE_MAX_BYTES,
  getArrivedNavigation,
  receiveNavigation,
  registerEntryStateCollector,
  resetEntryState,
  saveEntryState,
  subscribeNavigation,
  takeQueuedEntryState,
} from './entryState';

beforeEach(() => resetEntryState());

describe('entry scratch — collecting what the leaving entry remembers (R3-627)', () => {
  it('collects nothing when nothing was queued or registered', () => {
    expect(takeQueuedEntryState()).toBeUndefined();
  });

  it('asks collectors at navigation time, not before', () => {
    let reads = 0;
    registerEntryStateCollector('scroll', () => {
      reads += 1;
      return 600;
    });
    expect(reads).toBe(0); // registering must not read
    expect(takeQueuedEntryState()).toEqual({ scroll: 600 });
    expect(reads).toBe(1);
  });

  it('merges explicit saves with collector values', () => {
    saveEntryState('filter', 'tools');
    registerEntryStateCollector('scroll', () => 120);
    expect(takeQueuedEntryState()).toEqual({ filter: 'tools', scroll: 120 });
  });

  it('clears the queue after collecting, so one save does not stamp two entries', () => {
    saveEntryState('filter', 'tools');
    expect(takeQueuedEntryState()).toEqual({ filter: 'tools' });
    expect(takeQueuedEntryState()).toBeUndefined();
  });

  it('keeps collectors across navigations — they are standing, not one-shot', () => {
    registerEntryStateCollector('scroll', () => 42);
    expect(takeQueuedEntryState()).toEqual({ scroll: 42 });
    expect(takeQueuedEntryState()).toEqual({ scroll: 42 });
  });

  it('a collector returning undefined contributes no key', () => {
    registerEntryStateCollector('scroll', () => undefined);
    expect(takeQueuedEntryState()).toBeUndefined();
  });

  it('a throwing collector is skipped and never breaks the navigation', () => {
    registerEntryStateCollector('boom', () => {
      throw new Error('collector exploded');
    });
    registerEntryStateCollector('scroll', () => 7);
    expect(() => takeQueuedEntryState()).not.toThrow();
    resetEntryState();
    registerEntryStateCollector('boom', () => {
      throw new Error('collector exploded');
    });
    registerEntryStateCollector('scroll', () => 7);
    expect(takeQueuedEntryState()).toEqual({ scroll: 7 });
  });

  it('unregistering stops the collector being asked', () => {
    const off = registerEntryStateCollector('scroll', () => 1);
    off();
    expect(takeQueuedEntryState()).toBeUndefined();
  });

  it('one owner per key: a second registration replaces the first', () => {
    registerEntryStateCollector('scroll', () => 1);
    registerEntryStateCollector('scroll', () => 2);
    expect(takeQueuedEntryState()).toEqual({ scroll: 2 });
  });

  it('drops an over-cap scratch loudly rather than truncating it', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    saveEntryState('huge', 'x'.repeat(ENTRY_STATE_MAX_BYTES + 1));
    expect(takeQueuedEntryState()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('over the'));
    warn.mockRestore();
  });

  it('drops a scratch that cannot be serialized', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    saveEntryState('cyclic', cyclic);
    expect(takeQueuedEntryState()).toBeUndefined();
  });
});

describe('entry scratch — what arrived (R3-627)', () => {
  it('starts as a push with no state', () => {
    expect(getArrivedNavigation()).toEqual({ state: undefined, direction: 'push' });
  });

  it('records the arrival and notifies subscribers', () => {
    let notified = 0;
    const off = subscribeNavigation(() => {
      notified += 1;
    });
    receiveNavigation({ state: { scroll: 600 }, direction: 'back' });
    expect(getArrivedNavigation()).toEqual({ state: { scroll: 600 }, direction: 'back' });
    expect(notified).toBe(1);
    off();
    receiveNavigation({ state: undefined, direction: 'push' });
    expect(notified).toBe(1);
  });

  it('hands back one stable object per arrival, so a store subscriber can compare identity', () => {
    receiveNavigation({ state: { scroll: 1 }, direction: 'back' });
    expect(getArrivedNavigation()).toBe(getArrivedNavigation());
  });
});
