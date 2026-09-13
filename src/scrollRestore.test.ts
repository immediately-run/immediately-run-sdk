import { describe, expect, it } from '@jest/globals';

import { nextRestoreAction, RESTORE_DEADLINE_MS, RESTORE_EPSILON_PX, type RestoreSample } from './scrollRestore';

/** A sample with the fields a case does not care about held at "still trying". */
const sample = (over: Partial<RestoreSample> = {}): RestoreSample => ({
  target: 600,
  scrollHeight: 2400,
  clientHeight: 700,
  current: 0,
  elapsedMs: 0,
  userScrolled: false,
  ...over,
});

describe('nextRestoreAction (R3-627)', () => {
  it('waits while the content is too short to hold the offset', () => {
    // 800 - 700 = 100px reachable, far below the 600 the reader left at.
    expect(nextRestoreAction(sample({ scrollHeight: 800 }))).toBe('wait');
  });

  it('applies once the content can reach the offset', () => {
    expect(nextRestoreAction(sample({ scrollHeight: 1300, clientHeight: 700 }))).toBe('apply');
  });

  it('treats exactly-reachable as reachable', () => {
    // reachable === target, the boundary the clamp bug lives on.
    expect(nextRestoreAction(sample({ target: 600, scrollHeight: 1300, clientHeight: 700 }))).toBe('apply');
    expect(nextRestoreAction(sample({ target: 601, scrollHeight: 1300, clientHeight: 700 }))).toBe('wait');
  });

  it('abandons the moment the reader scrolls, at any height', () => {
    expect(nextRestoreAction(sample({ userScrolled: true }))).toBe('abandon');
    expect(nextRestoreAction(sample({ userScrolled: true, scrollHeight: 800 }))).toBe('abandon');
    expect(nextRestoreAction(sample({ userScrolled: true, elapsedMs: 10 }))).toBe('abandon');
  });

  it('abandons at the deadline rather than scrolling a page the reader has been looking at', () => {
    expect(nextRestoreAction(sample({ scrollHeight: 800, elapsedMs: RESTORE_DEADLINE_MS - 1 }))).toBe('wait');
    expect(nextRestoreAction(sample({ scrollHeight: 800, elapsedMs: RESTORE_DEADLINE_MS }))).toBe('abandon');
  });

  it('is done when the scroller is already within epsilon of the offset', () => {
    expect(nextRestoreAction(sample({ current: 600 }))).toBe('apply');
    expect(nextRestoreAction(sample({ current: 600 - RESTORE_EPSILON_PX }))).toBe('apply');
    // …and a whole pixel past epsilon is not "already there".
    expect(nextRestoreAction(sample({ current: 600 - RESTORE_EPSILON_PX - 1, scrollHeight: 800 }))).toBe('wait');
  });

  it('refuses a target that is absent, negative or corrupt', () => {
    for (const target of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(nextRestoreAction(sample({ target }))).toBe('abandon');
    }
  });

  it('reaching the offset wins over the deadline, so a late-but-ready restore still lands', () => {
    // Content grew on the last sample before the deadline: apply, do not abandon.
    expect(nextRestoreAction(sample({ scrollHeight: 2400, elapsedMs: RESTORE_DEADLINE_MS - 1 }))).toBe('apply');
  });

  it('follows a growing document to the one sample that can apply', () => {
    // The real shape of the bug: replay a document filling in, and assert the whole
    // sequence rather than three independent guesses.
    const heights = [700, 900, 1200, 1299, 1300, 2400];
    const actions = heights.map((scrollHeight, i) => nextRestoreAction(sample({ scrollHeight, elapsedMs: i * 100 })));
    expect(actions).toEqual(['wait', 'wait', 'wait', 'wait', 'apply', 'apply']);
  });

  it('a reader who scrolls mid-sequence ends it, even as the content keeps growing', () => {
    const actions = [
      nextRestoreAction(sample({ scrollHeight: 900, elapsedMs: 100 })),
      nextRestoreAction(sample({ scrollHeight: 1200, elapsedMs: 200, userScrolled: true })),
      nextRestoreAction(sample({ scrollHeight: 2400, elapsedMs: 300, userScrolled: true })),
    ];
    expect(actions).toEqual(['wait', 'abandon', 'abandon']);
  });
});
