// R3-350 — the SDK analytics surface (APP_ANALYTICS_SPEC §2/§3, G-AN-4).
//
// The enforcement lives host-side; what the SDK owes is a surface with no read path
// and a shape that cannot smuggle one in later.

// This repo transforms to CJS for jest, so `jest.mock` hoists correctly here — the
// opposite of `site-main`'s ESM runner, where a hoisted `jest.mock` fails at load.
// Always the repo's own `npm test`, never a bare `npx jest`, which flips the pipeline.
const requests: { scheme: string; method: string; params: unknown[] }[] = [];
let nextResult: unknown = { accepted: true };
let nextError: unknown = null;

jest.mock('./sandboxUtils', () => ({
  protocolRequest: (scheme: string, method: string, params: unknown[]) => {
    requests.push({ scheme, method, params });
    return nextError ? Promise.reject(nextError) : Promise.resolve(nextResult);
  },
}));

import * as analyticsModule from './analytics';
import { emitAnalyticsEvent, recordRoute, track, trackRoute } from './analytics';

beforeEach(() => {
  requests.length = 0;
  nextResult = { accepted: true };
  nextError = null;
});

describe('G-AN-4 — the surface is WRITE-ONLY', () => {
  it('exports no read method at any name', () => {
    // A catalogue assertion, deliberately. §13 records the read path as rejected — "a
    // plausible feature that converts a write-only channel into a two-way one, and
    // would need its own threat pass" — so this asserts the ABSENCE rather than
    // trusting nobody adds one.
    const exported = Object.keys(analyticsModule).filter((k) => typeof (analyticsModule as never)[k] === 'function');
    expect(exported.sort()).toEqual(['emitAnalyticsEvent', 'recordRoute', 'track', 'trackRoute']);
    for (const name of exported) {
      expect(/^(get|read|query|list|fetch|use|on)/.test(name)).toBe(false);
    }
  });

  it('speaks only `emit` and `route` on the wire', async () => {
    await emitAnalyticsEvent('clinic.export', { format: 'pdf' });
    await recordRoute('/patients/12345');
    expect(requests.map((r) => r.method)).toEqual(['emit', 'route']);
    expect(new Set(requests.map((r) => r.scheme))).toEqual(new Set(['analytics']));
  });
});

describe('the calls', () => {
  it('sends the event name and declared props', async () => {
    await emitAnalyticsEvent('clinic.export', { format: 'pdf', pages: 3, draft: false });
    expect(requests[0].params).toEqual([{ name: 'clinic.export', props: { format: 'pdf', pages: 3, draft: false } }]);
  });

  it('omits `props` entirely when there are none, rather than sending an empty object', async () => {
    await emitAnalyticsEvent('clinic.view');
    expect(requests[0].params).toEqual([{ name: 'clinic.view' }]);
  });

  it('sends the CONCRETE path — the host reduces it to the declared pattern', async () => {
    // The app has the path; the platform decides what is recorded. The reduction is
    // host-side at the boundary (§3.1), because a client-side reduction is a client
    // the publisher writes.
    await recordRoute('/patients/12345');
    expect(requests[0].params).toEqual([{ path: '/patients/12345' }]);
  });

  it('surfaces a refusal as a typed error on the awaited form', async () => {
    nextError = Object.assign(new Error('not in the declared enumeration'), { code: 'invalid-params' });
    await expect(emitAnalyticsEvent('clinic.export', { format: 'exe' })).rejects.toMatchObject({
      code: 'invalid-params',
    });
  });
});

describe('the fire-and-forget forms swallow refusals', () => {
  it('`track` does not reject when the host refuses', async () => {
    // An analytics call failing is not a reason for a feature to fail — and the
    // alternative is every call site wrapping this in a `try` that does nothing, which
    // is the same behaviour with more places to get it wrong.
    nextError = Object.assign(new Error('budget'), { code: 'budget' });
    expect(() => track('clinic.export', { format: 'pdf' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(requests).toHaveLength(1);
  });

  it('`trackRoute` likewise', async () => {
    nextError = Object.assign(new Error('forbidden'), { code: 'forbidden' });
    expect(() => trackRoute('/patients/1')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(requests).toHaveLength(1);
  });

  it('and they return void — no result to read back', () => {
    // The synchronous forms return `undefined` by design: a returned promise carrying
    // an ack would be a read channel in the shape of a convenience.
    expect(track('clinic.view')).toBeUndefined();
    expect(trackRoute('/patients')).toBeUndefined();
  });
});
