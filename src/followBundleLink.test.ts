// R3-1324 — followBundleLink posts exactly one `bundle-link` for an escaping href and
// nothing otherwise. The transport is spied at `sandboxUtils`, the module the helper
// imports `sendMessage` from.
export {}; // a MODULE, so `sendMessage` below does not collide under the shared tsc check
const sendMessage = jest.fn();

jest.mock('./sandboxUtils', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

let followBundleLink: typeof import('./followBundleLink').followBundleLink;

beforeEach(() => {
  jest.resetModules();
  sendMessage.mockReset();
  ({ followBundleLink } = require('./followBundleLink'));
});

it('an escaping href posts one bundle-link with the normalised payload and returns true', () => {
  expect(followBundleLink('../spec/BATON_SPEC/06-x.md#r-btn-120', 'B-10.mdx')).toBe(true);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(sendMessage).toHaveBeenCalledWith('bundle-link', {
    path: '../spec/BATON_SPEC/06-x.md',
    fragment: 'r-btn-120',
  });
});

it('an escaping href without a fragment carries no fragment key', () => {
  expect(followBundleLink('../../x.md', 'a/b.mdx')).toBe(true);
  expect(sendMessage.mock.calls).toEqual([['bundle-link', { path: '../x.md' }]]);
});

it.each(['c.mdx', 'https://example.com/', '#x'])('%j posts nothing and returns false', (href) => {
  expect(followBundleLink(href, 'a/b.mdx')).toBe(false);
  expect(sendMessage).not.toHaveBeenCalled();
});
