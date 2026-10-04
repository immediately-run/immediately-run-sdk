// routing.tsx — the `navigate` wire payload. R3-876 typed the `urlchange` send
// (UrlChangeMessage) so the protocol gate fingerprints the DECLARED contract
// shape; these tests pin the runtime message that type describes.

jest.mock('./sandboxUtils', () => ({
  sendMessage: jest.fn(),
}));

import { sendMessage } from './sandboxUtils';
import { navigate } from './routing';

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
