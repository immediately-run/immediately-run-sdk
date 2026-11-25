// routing.tsx — the `navigate` wire payload. R3-876 typed the `urlchange` send
// (the contract's own `UrlchangePayload`, imported from './generated/protocol') so
// the protocol gate fingerprints the DECLARED shape; these tests pin the runtime
// message that type describes.

jest.mock('./sandboxUtils', () => ({
  sendMessage: jest.fn(),
}));

import { sendMessage } from './sandboxUtils';
import { navigate, setNavigationHrefState } from './routing';
import { parseHref } from './urlUtils';

const mockSend = sendMessage as jest.MockedFunction<typeof sendMessage>;

beforeEach(() => {
  mockSend.mockReset();
});

describe('navigate — the urlchange payload (R3-876)', () => {
  it('sends url, back:false, forward:false — and no entryState when none is queued', () => {
    navigate('/content/intro.mdx');
    expect(mockSend).toHaveBeenCalledWith('urlchange', {
      url: '/content/intro.mdx',
      back: false,
      forward: false,
    });
  });

  it('an explicit viewedDocument declaration rides as that value (null = clears)', () => {
    navigate('/tags', { viewedDocument: null });
    expect(mockSend).toHaveBeenCalledWith('urlchange', {
      url: '/tags',
      back: false,
      forward: false,
      viewedDocument: null,
    });
  });

  it('omitting viewedDocument sends NO key (the host derives from the URL convention)', () => {
    navigate('/content/intro.mdx');
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>;
    expect('viewedDocument' in payload).toBe(false);
    expect('replace' in payload).toBe(false); // a send-only field the app never sets here
  });
});

// R3-1397 review rg:1-A-0: grove's followLinkOnClick calls preventDefault itself and then
// navigates with `e.currentTarget.href`, which inside a bundle is the RENDERED bundle address.
// navigate() must post the app-space files/ URL the host maps, as InternalLink's own click does.
describe('navigate — a rendered bundle href posts the app-space URL (R3-1397)', () => {
  const PREFIX = 'https://immediately.run/present/github/immediately-run/baton/main/';
  const BASE = `${PREFIX}bundle/tickets/`;
  const outerHref = `${PREFIX}files/B-10.md`;
  afterEach(() => setNavigationHrefState(null));

  it("posts files/<rest> for an anchor's bundle href, as grove's policy sends it", () => {
    setNavigationHrefState({ outerHref, navigationState: parseHref(outerHref), filesHrefBase: BASE });
    navigate(`${BASE}B-11.md#r-1`);
    expect(mockSend).toHaveBeenCalledWith('urlchange', {
      url: `${PREFIX}files/B-11.md#r-1`,
      back: false,
      forward: false,
    });
  });

  it('posts its target unchanged with no base, or before the shell set any state', () => {
    navigate(`${BASE}B-11.md`);
    expect((mockSend.mock.calls[0][1] as { url: string }).url).toBe(`${BASE}B-11.md`);
    setNavigationHrefState({ outerHref, navigationState: parseHref(outerHref), filesHrefBase: null });
    navigate(`${PREFIX}files/B-11.md`);
    expect((mockSend.mock.calls[1][1] as { url: string }).url).toBe(`${PREFIX}files/B-11.md`);
  });
});
