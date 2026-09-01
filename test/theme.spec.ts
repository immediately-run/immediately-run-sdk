// HOST_THEMING_SPEC §9 (R3-500 wire slice) — the widened theme surface over the
// REAL §4 transport (TESTING_AUTOMATION_SPEC §3), through the mock host:
//   - the `theme` push now carries the full selection {theme, themeKey, modeId}
//     and the polarity-only surface derives from it (backwards-compatible);
//   - the `theme-catalog` push carries the loaded-theme catalogue;
//   - `theme:set`/`theme:sources` verbs round-trip through the protocol.
//
// `jest.resetModules()` per test gives a fresh lazy channel singleton (the
// pattern from sessionMounts.spec.ts); the mock host survives the reset on
// `globalThis`.

import { createMockHost, type MockHost } from '../src/testing';

type ThemeModule = typeof import('../src/theme');
const load = (): ThemeModule => {
  jest.resetModules();
  return require('../src/theme') as ThemeModule;
};

describe('theme surface over the mock host transport (R3-500)', () => {
  let host: MockHost;

  beforeEach(() => {
    host = createMockHost();
    host.install({ runtimeVersion: '1.0.0', protocolVersion: '1.0.0' });
  });
  afterEach(() => host.uninstall());

  it('defaults to the shipped default theme (dark polarity) before the host reports', () => {
    const { getHostTheme, getHostThemeSelection } = load();
    expect(getHostTheme()).toBe('dark');
    expect(getHostThemeSelection()).toEqual({
      theme: 'dark',
      themeKey: 'immediately-run-default',
      modeId: 'dark',
    });
  });

  it('the widened push carries themeKey/modeId; polarity derives from it', () => {
    const { getHostTheme, getHostThemeSelection } = load();
    getHostThemeSelection(); // start the channel (lazy) so the push is received
    host.emit({ type: 'theme', theme: 'dark', themeKey: 'key:nord', modeId: 'night' });
    expect(getHostThemeSelection()).toEqual({ theme: 'dark', themeKey: 'key:nord', modeId: 'night' });
    expect(getHostTheme()).toBe('dark');
  });

  it('onHostThemeChange fires for polarity changes and replays current value', () => {
    const { onHostThemeChange } = load();
    const seen: string[] = [];
    onHostThemeChange((t) => seen.push(t));
    host.emit({ type: 'theme', theme: 'light', themeKey: 'immediately-run-default', modeId: 'light' });
    expect(seen).toEqual(['dark', 'light']);
  });

  it('ignores a malformed push (missing themeKey/modeId) and keeps the last value', () => {
    const { getHostTheme } = load();
    host.emit({ type: 'theme', theme: 'light' });
    expect(getHostTheme()).toBe('dark');
  });

  it('getThemeCatalog round-trips themes + modes; ignores malformed entries', () => {
    const { getThemeCatalog } = load();
    getThemeCatalog(); // start the channel (lazy) so the push is received
    host.emit({
      type: 'theme-catalog',
      themes: [{ themeKey: 'k:nord', label: 'Nord', modes: [{ id: 'dark', polarity: 'dark' }] }],
    });
    expect(getThemeCatalog().themes).toEqual([
      { themeKey: 'k:nord', label: 'Nord', modes: [{ id: 'dark', polarity: 'dark' }] },
    ]);
    host.emit({ type: 'theme-catalog', themes: [{ themeKey: 5 }] });
    expect(getThemeCatalog().themes).toEqual([
      { themeKey: 'k:nord', label: 'Nord', modes: [{ id: 'dark', polarity: 'dark' }] },
    ]);
  });

  it('onThemeCatalogChange replays the current catalogue', () => {
    const { onThemeCatalogChange } = load();
    const seen: number[] = [];
    onThemeCatalogChange((c) => seen.push(c.themes.length));
    host.emit({
      type: 'theme-catalog',
      themes: [{ themeKey: 'k:1', label: 'One', modes: [] }],
    });
    expect(seen).toEqual([0, 1]);
  });

  it('setHostTheme sends the legacy polarity-only form', async () => {
    const { setHostTheme } = load();
    host.stubProtocol('theme', 'set', () => ({ ok: true, data: { applied: 'light' } }));
    await setHostTheme('light');
    expect(host.protocolCalls).toEqual([{ protocol: 'theme', method: 'set', params: [{ theme: 'light' }] }]);
  });

  it('setHostThemeSelection sends the canonical {theme, mode} form', async () => {
    const { setHostThemeSelection } = load();
    host.stubProtocol('theme', 'set', () => ({ ok: true, data: null }));
    await setHostThemeSelection({ theme: 'k:nord', mode: 'system' });
    expect(host.protocolCalls).toEqual([
      { protocol: 'theme', method: 'set', params: [{ theme: 'k:nord', mode: 'system' }] },
    ]);
  });

  it('addThemeSource sends the picked location; removeThemeSource sends the key', async () => {
    const { addThemeSource, removeThemeSource } = load();
    host.stubProtocol('theme', 'add-source', () => ({ ok: true, data: null }));
    host.stubProtocol('theme', 'remove-source', () => ({ ok: true, data: null }));
    await addThemeSource({ kind: 'repo', repo: 'acme/themes', path: 'themes/nord' });
    await removeThemeSource('k:nord');
    expect(host.protocolCalls).toEqual([
      {
        protocol: 'theme',
        method: 'add-source',
        params: [{ location: { kind: 'repo', repo: 'acme/themes', path: 'themes/nord' } }],
      },
      { protocol: 'theme', method: 'remove-source', params: [{ themeKey: 'k:nord' }] },
    ]);
  });

  it('a rejected set/add/remove surfaces the gate code as a thrown Error.code', async () => {
    const { addThemeSource } = load();
    host.stubProtocol('theme', 'add-source', () => ({ ok: false, code: 'forbidden', message: 'nope' }));
    await expect(addThemeSource({ kind: 'repo', repo: 'x', path: '/' })).rejects.toThrow(/nope/);
    await expect(addThemeSource({ kind: 'repo', repo: 'x', path: '/' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('the hooks surface exists for the app repos to drive', () => {
    const { useHostThemeSelection, useThemeCatalog } = load();
    expect(typeof useHostThemeSelection).toBe('function');
    expect(typeof useThemeCatalog).toBe('function');
  });
});
