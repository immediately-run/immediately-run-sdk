// R3-627 — the per-entry scratch over the REAL §4 transport (TESTING_AUTOMATION_SPEC
// §3). The point of using the mock host rather than mocking `./sandboxUtils` is that
// `navigate()` resolves the transport the way it does in production, so what these
// tests assert is the message an app actually puts on the wire.

import { navigate } from '../src/routing';
import {
  receiveNavigation,
  registerEntryStateCollector,
  resetEntryState,
  saveEntryState,
  getArrivedNavigation,
} from '../src/entryState';
import { createMockHost, type MockHost } from '../src/testing';

describe('entry scratch on the urlchange wire', () => {
  let host: MockHost;

  beforeEach(() => {
    host = createMockHost();
    host.install({ runtimeVersion: '1.0.0', protocolVersion: '1.0.0' });
    resetEntryState();
  });
  afterEach(() => {
    host.uninstall();
    resetEntryState();
  });

  const lastUrlchange = (): Record<string, unknown> | undefined => {
    const sent = host.sent.filter((m) => m.type === 'urlchange');
    return sent.length ? (sent[sent.length - 1].data as Record<string, unknown>) : undefined;
  };

  it('a navigation with nothing remembered carries no entryState at all', () => {
    navigate('/somewhere');
    const msg = lastUrlchange()!;
    expect(msg.url).toBe('/somewhere');
    expect('entryState' in msg).toBe(false);
  });

  it('carries the scratch collected at the instant of navigating', () => {
    registerEntryStateCollector('ir.scroll', () => 640);
    navigate('/next');
    expect(lastUrlchange()!.entryState).toEqual({ 'ir.scroll': 640 });
  });

  it('carries an explicitly saved value, and only once', () => {
    saveEntryState('filter', 'tools');
    navigate('/a');
    expect(lastUrlchange()!.entryState).toEqual({ filter: 'tools' });
    navigate('/b');
    expect('entryState' in lastUrlchange()!).toBe(false);
  });

  it('still declares back/forward false on an app-initiated navigation', () => {
    navigate('/c');
    const msg = lastUrlchange()!;
    expect(msg.back).toBe(false);
    expect(msg.forward).toBe(false);
  });

  it('a collector reading the live value sends what it is worth at send time', () => {
    // The motivating case: the offset must be the one at the click, not at mount.
    let offset = 0;
    registerEntryStateCollector('ir.scroll', () => (offset > 0 ? offset : undefined));
    offset = 900;
    navigate('/d');
    expect(lastUrlchange()!.entryState).toEqual({ 'ir.scroll': 900 });
  });

  it('an arrival carrying a scratch and a traversal flag surfaces to the app', () => {
    // The host→app half: what boot.tsx's listener does with the message.
    receiveNavigation({ state: { 'ir.scroll': 640 }, direction: 'back' });
    expect(getArrivedNavigation()).toEqual({ state: { 'ir.scroll': 640 }, direction: 'back' });
  });

  it('an ordinary arrival surfaces no scratch, so nothing restores on a push', () => {
    receiveNavigation({ state: undefined, direction: 'push' });
    expect(getArrivedNavigation().state).toBeUndefined();
    expect(getArrivedNavigation().direction).toBe('push');
  });
});
