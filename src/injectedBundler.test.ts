// R3-51b — the Phase-5 dual-mode metadata-source resolver (SDK_PACKAGING_SPEC §4/§8).
// The ambient `module.evaluation.module.bundler.*` reads are untestable off a live
// sandbox (like `sandboxUtils.transport`), so the security-/behaviour-bearing bit —
// the dual-mode DECISION — is the pure `resolveMetadataSource`, tested here.

import { resolveMetadataSource, type InjectedMetadataEmitter } from './injectedBundler';

describe('resolveMetadataSource (Phase-5 dual mode)', () => {
  it('off-injection (npm-fetched): no event source → addListener uses the transport, enable is a no-op', () => {
    const source = resolveMetadataSource(null);
    expect(source.event).toBeUndefined();
    // enable must be callable and harmless
    expect(() => source.enable()).not.toThrow();
  });

  it('injected: uses the bundler emitter as the event source and arms it (byte-identical live path)', () => {
    const disposable = { dispose: jest.fn() };
    const onMetadataChange = jest.fn(() => disposable);
    const enable = jest.fn();
    const injected: InjectedMetadataEmitter = { onMetadataChange, enable };

    const source = resolveMetadataSource(injected);
    // The event source is the injected emitter, passed straight to addListener.
    expect(source.event).toBe(onMetadataChange);

    // enable() drives the injected DelayedEmitter exactly once per call.
    source.enable();
    expect(enable).toHaveBeenCalledTimes(1);

    // Subscribing through the resolved source returns the injected disposable.
    const sub = source.event!(() => {});
    expect(onMetadataChange).toHaveBeenCalledTimes(1);
    expect(sub).toBe(disposable);
  });
});
