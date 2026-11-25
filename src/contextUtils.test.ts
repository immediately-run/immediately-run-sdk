/**
 * @jest-environment jsdom
 */
// R3-1397 — the host's href base reaches TinkerableState on both of its paths: the boot
// search param beside `href`, and each `urlchange` push. The push is a typed
// `UrlchangePayload` (the published contract), so dropping the field from the
// protocol breaks this test at compile time.
import { DEFAULT_ROUTING_SPEC } from './boot';
import { getInitialContext, updateContext } from './contextUtils';
import type { UrlchangePayload } from './generated/protocol';

const PREFIX = 'https://immediately.run/present/github/immediately-run/baton/main/';
const BASE = `${PREFIX}bundle/tickets/`;

const push = (p: Partial<UrlchangePayload> & { url: string }): UrlchangePayload => ({
  back: false,
  forward: false,
  ...p,
});

describe('filesHrefBase in TinkerableState (R3-1397)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('boot reads the base from its own search param beside href', () => {
    const qs = new URLSearchParams({ href: `${PREFIX}files/B-10.md`, filesHrefBase: BASE });
    window.history.replaceState(null, '', `/?${qs}`);
    const ctx = getInitialContext(DEFAULT_ROUTING_SPEC)();
    expect(ctx.outerHref).toBe(`${PREFIX}files/B-10.md`);
    expect(ctx.filesHrefBase).toBe(BASE);
  });

  it('boot without the param (an older host) has no base', () => {
    window.history.replaceState(null, '', `/?${new URLSearchParams({ href: `${PREFIX}files/B-10.md` })}`);
    expect(getInitialContext(DEFAULT_ROUTING_SPEC)().filesHrefBase).toBeNull();
  });

  it('a push sets the base, a push without it clears it, and an identical push is a no-op', () => {
    window.history.replaceState(null, '', `/?${new URLSearchParams({ href: `${PREFIX}files/B-10.md` })}`);
    const boot = getInitialContext(DEFAULT_ROUTING_SPEC)();
    const first = push({ url: `${PREFIX}files/B-10.md`, filesHrefBase: BASE });
    const withBase = updateContext(boot, first.url, first.filesHrefBase);
    expect(withBase).not.toBe(boot);
    expect(withBase.filesHrefBase).toBe(BASE);
    expect(updateContext(withBase, first.url, first.filesHrefBase)).toBe(withBase);
    const second = push({ url: `${PREFIX}files/B-10.md` });
    expect(updateContext(withBase, second.url, second.filesHrefBase).filesHrefBase).toBeNull();
  });

  it('a cross-origin base is refused once, with a warning, and the state keeps no base', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState(null, '', `/?${new URLSearchParams({ href: `${PREFIX}files/B-10.md` })}`);
    const boot = getInitialContext(DEFAULT_ROUTING_SPEC)();
    const bad = push({ url: `${PREFIX}files/B-11.md`, filesHrefBase: 'https://evil.example/bundle/' });
    expect(updateContext(boot, bad.url, bad.filesHrefBase).filesHrefBase).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('a host that keeps pushing a bad base (R3-1397 review rg:1-B-0)', () => {
  it('warns once per distinct refused value, not on every push', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const href = 'https://immediately.run/present/github/o/r/main/files/a.md';
    window.history.replaceState(null, '', `/?${new URLSearchParams({ href })}`);
    let ctx = getInitialContext(DEFAULT_ROUTING_SPEC)();
    window.history.replaceState(null, '', '/');
    for (let i = 0; i < 3; i++) ctx = updateContext(ctx, href, 'https://evil.example/bundle/x/');
    expect(warn).toHaveBeenCalledTimes(1);
    ctx = updateContext(ctx, href, 'not-a-url');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(ctx.filesHrefBase).toBeNull();
    warn.mockRestore();
  });
});
