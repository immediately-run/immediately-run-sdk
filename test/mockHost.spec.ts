// Exercises the SDK's REAL §4 transport path through the mock host
// (TESTING_AUTOMATION_SPEC §3). Unlike the per-suite mocks that replace
// `./sandboxUtils`, these tests import the real module and let it resolve the
// transport off `globalThis.__immediatelyRun__` — so `transport()`, the
// `addListener` type-filter, and `protocolRequest` are all under test end to end.

import { addListener, sendMessage, protocolRequest } from '../src/sandboxUtils';
import { getInjectedMetadataEmitter, resolveMetadataSource } from '../src/injectedBundler';
import { createMockHost, type MockHost } from '../src/testing';

describe('mock host transport harness (npm-fetched §4 path)', () => {
  let host: MockHost;

  beforeEach(() => {
    host = createMockHost();
    host.install({ runtimeVersion: '1.0.0', protocolVersion: '1.0.0' });
  });
  afterEach(() => host.uninstall());

  it('addListener resolves the global transport and receives matching pushes only', () => {
    const seen: unknown[] = [];
    addListener('metadata-update', (msg) => seen.push(msg));

    host.emit({ type: 'something-else', payload: 1 }); // filtered out
    host.emit({ type: 'metadata-update', update: { 'a.tsx': { title: 'A' } } });

    expect(seen).toEqual([{ type: 'metadata-update', update: { 'a.tsx': { title: 'A' } } }]);
  });

  it('addListener unsubscribe disposes the underlying handler (no leak)', () => {
    const off = addListener('x', () => {});
    expect(host.handlerCount()).toBe(1);
    off();
    expect(host.handlerCount()).toBe(0);
  });

  it('sendMessage reaches the host transport with type + data', () => {
    sendMessage('request-form-factor', { reason: 'init' });
    expect(host.sent).toEqual([{ type: 'request-form-factor', data: { reason: 'init' } }]);
  });

  it('protocolRequest round-trips through a stub; unstubbed calls reject', async () => {
    host.stubProtocol('spaces', 'list', () => ({ ok: true, data: [{ spaceId: 's1' }] }));
    await expect(protocolRequest('spaces', 'list', [])).resolves.toEqual({
      ok: true,
      data: [{ spaceId: 's1' }],
    });
    expect(host.protocolCalls).toEqual([{ protocol: 'spaces', method: 'list', params: [] }]);
    await expect(protocolRequest('spaces', 'unstubbed', [])).rejects.toThrow(/no stub/);
  });

  // The motivating case: R3-51b's metadata-update emitter, wired exactly as boot.tsx
  // wires it in npm-fetched mode. With no injection, getInjectedMetadataEmitter() is
  // null → resolveMetadataSource yields no `event`, so addListener falls through to
  // the transport. This is the end-to-end proof the dual-mode fallback DELIVERS —
  // previously only the decision logic could be unit-tested.
  it('R3-51b: metadata updates arrive over the transport in npm-fetched mode', () => {
    expect(getInjectedMetadataEmitter()).toBeNull(); // no injection under jest

    const source = resolveMetadataSource(getInjectedMetadataEmitter());
    expect(source.event).toBeUndefined(); // → addListener uses the transport

    const applied: Array<Record<string, unknown>> = [];
    const dispose = addListener(
      'metadata-update',
      ({ update }: Record<string, any>) => applied.push(update),
      source.event,
    );
    source.enable(); // no-op off-injection

    host.emit({ type: 'metadata-update', update: { 'Guide.mdx': { title: 'Guide' } } });
    host.emit({ type: 'metadata-update', update: { 'Guide.mdx': { title: 'Guide v2' } } });

    expect(applied).toEqual([{ 'Guide.mdx': { title: 'Guide' } }, { 'Guide.mdx': { title: 'Guide v2' } }]);
    dispose();
  });
});

describe('mock host transport harness — absence', () => {
  it('with no global and no injection, transport resolution fails closed', () => {
    // Nothing installed: addListener calls transport(), which finds neither the
    // injected bundler nor the §4 global and throws (SDK_PACKAGING_SPEC §6).
    expect(() => addListener('metadata-update', () => {})).toThrow(/no host transport/);
  });
});
