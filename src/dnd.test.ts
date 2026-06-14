// Cross-app drag-out SDK wrappers (FILE_EXPLORER_SPEC §7.4) — assert the request
// shape, that a host `{ ok: false, code }` surfaces as a typed throw, and that the
// cancel/subscribe sides hit the right transport calls.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  sendMessage: jest.fn(),
  addListener: jest.fn(),
}));

import { protocolRequest, sendMessage, addListener } from './sandboxUtils';
import { startItemDrag, cancelItemDrag, onItemDrop, type DraggableItem, type ItemDragError } from './dnd';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;
const mockSend = sendMessage as jest.MockedFunction<typeof sendMessage>;
const mockAddListener = addListener as jest.MockedFunction<typeof addListener>;

const item: DraggableItem = { kind: 'file', name: 'App.tsx', mountId: 'worktree', relPath: '/src/App.tsx' };

beforeEach(() => {
  mockRequest.mockReset();
  mockSend.mockReset();
  mockAddListener.mockReset();
  mockRequest.mockResolvedValue({ ok: true });
});

describe('startItemDrag', () => {
  it('maps to protocol-dnd startDrag with the item', async () => {
    await startItemDrag(item);
    expect(mockRequest).toHaveBeenCalledWith('dnd', 'startDrag', [item]);
  });

  it('surfaces forbidden when the app lacks dnd:source', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'no dnd:source' });
    await expect(startItemDrag(item)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('defaults to unknown when the host returns no code', async () => {
    mockRequest.mockResolvedValue({ ok: false } as unknown as { ok: false; code: string; message: string });
    const err = await startItemDrag(item).catch((e: ItemDragError) => e);
    expect((err as ItemDragError).code).toBe('unknown');
  });
});

describe('cancelItemDrag', () => {
  it('sends a fire-and-forget dnd-cancel message', () => {
    cancelItemDrag();
    expect(mockSend).toHaveBeenCalledWith('dnd-cancel', {});
  });
});

describe('onItemDrop', () => {
  it('subscribes to the dropped-item channel and re-shapes the payload', () => {
    let captured: ((m: unknown) => void) | undefined;
    mockAddListener.mockImplementation((_type, handler) => {
      captured = handler as (m: unknown) => void;
      return () => {};
    });
    const seen: unknown[] = [];
    onItemDrop((d) => seen.push(d));
    expect(mockAddListener).toHaveBeenCalledWith('dropped-item', expect.any(Function));
    captured?.({ item, from: 'panel.files', position: { x: 10, y: 20 } });
    expect(seen).toEqual([{ item, from: 'panel.files', position: { x: 10, y: 20 } }]);
  });
});
