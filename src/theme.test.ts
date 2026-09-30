// theme.ts's three refusal sites (R3-817): `setTheme` (via the exported
// setHostTheme), `addThemeSource`, `removeSource`. A bare-string reply (a proxy
// error page, a relay) must reject CODED — the pre-fold `'code' in res` threw a
// TypeError past every `err.code` branch an app wrote. Injection cover for exit
// 3, per site: neuter throwOnRefusal by deleting its `throw err;` — EACH of the
// three then resolves instead of rejecting, and all three tests go red.
const protocolRequest = jest.fn();
jest.mock('./sandboxUtils', () => ({ protocolRequest }));

import { setHostTheme, addThemeSource, removeThemeSource } from './theme';

beforeEach(() => protocolRequest.mockReset());

const expectCoded = (p: Promise<unknown>, fallback: string) =>
  expect(p).rejects.toMatchObject({ code: 'unknown', message: fallback });

describe('theme.ts refusals — a bare-string reply is coded, never a TypeError (R3-817)', () => {
  it('setTheme (via setHostTheme)', async () => {
    protocolRequest.mockResolvedValue('nope');
    await expectCoded(setHostTheme('dark'), 'setHostTheme failed');
  });
  it('addThemeSource', async () => {
    protocolRequest.mockResolvedValue('nope');
    await expectCoded(addThemeSource({ kind: 'repo', repo: 'github:a/b', path: '' }), 'addThemeSource failed');
  });
  it('removeThemeSource', async () => {
    protocolRequest.mockResolvedValue('nope');
    await expectCoded(removeThemeSource('theme|x'), 'removeThemeSource failed');
  });
  it('a coded refusal reply keeps ITS code (not the fallback)', async () => {
    protocolRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'no' });
    await expect(setHostTheme('dark')).rejects.toMatchObject({ code: 'forbidden', message: 'no' });
  });
});
