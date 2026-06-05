import { consumeStream, StreamError, type StreamTransport, type StreamFrame } from './protocolStream';

// A fake transport that lets a test script the host's reply frames. `send`
// captures the request; `emit` injects frames the way the host would.
function fakeTransport() {
  const sent: any[] = [];
  let handler: ((msg: { msgId?: number; stream?: StreamFrame }) => void) | null = null;
  let unsubscribed = false;
  const transport: StreamTransport = {
    send: (msg) => sent.push(msg),
    subscribe: (_type, h) => {
      handler = h;
      return () => {
        unsubscribed = true;
        handler = null;
      };
    },
  };
  return {
    transport,
    sent,
    isUnsubscribed: () => unsubscribed,
    emit: (msgId: number, stream: StreamFrame) => handler?.({ msgId, stream }),
  };
}

describe('consumeStream — SDK iterator over the streaming transport (§5.1)', () => {
  it('sends a stream request, then yields events and returns the done value', async () => {
    const fx = fakeTransport();
    const it = consumeStream(fx.transport, 'protocol-contribute', 'run', [{ x: 1 }], 42);

    const collected: unknown[] = [];
    const pump = (async () => {
      let r = await it.next();
      while (!r.done) {
        collected.push(r.value);
        r = await it.next();
      }
      return r.value;
    })();

    // The request frame went out tagged with our msgId + stream:true.
    expect(fx.sent).toEqual([
      { type: 'protocol-contribute', method: 'run', params: [{ x: 1 }], msgId: 42, stream: true },
    ]);

    fx.emit(42, { kind: 'event', value: { stage: 'auth-check' } });
    fx.emit(42, { kind: 'event', value: { stage: 'create-pr' } });
    fx.emit(42, { kind: 'done', value: { prNumber: 9 } });

    const ret = await pump;
    expect(collected).toEqual([{ stage: 'auth-check' }, { stage: 'create-pr' }]);
    expect(ret).toEqual({ prNumber: 9 });
    expect(fx.isUnsubscribed()).toBe(true);
  });

  it('ignores frames for a different msgId (interleaved streams stay isolated)', async () => {
    const fx = fakeTransport();
    const it = consumeStream(fx.transport, 't', 'run', [], 1);
    const first = it.next();

    fx.emit(2, { kind: 'event', value: 'other-stream' }); // wrong msgId — ignored
    fx.emit(1, { kind: 'event', value: 'mine' });

    expect(await first).toEqual({ value: 'mine', done: false });
  });

  it('throws a StreamError (code + message) on an error frame', async () => {
    const fx = fakeTransport();
    const it = consumeStream(fx.transport, 't', 'run', [], 5);
    const step = it.next();
    fx.emit(5, { kind: 'error', code: 'forbidden', message: 'mode:direct not allowed' });

    await expect(step).rejects.toMatchObject({
      name: 'StreamError',
      code: 'forbidden',
      message: 'mode:direct not allowed',
    });
    expect(StreamError).toBeDefined();
  });

  it('unsubscribes when the consumer breaks early (no listener leak)', async () => {
    const fx = fakeTransport();
    const it = consumeStream(fx.transport, 't', 'run', [], 8);
    const step = it.next();
    fx.emit(8, { kind: 'event', value: 'a' });
    await step;
    // Consumer abandons the iterator early.
    await it.return(undefined as never);
    expect(fx.isUnsubscribed()).toBe(true);
  });

  it('buffers frames that arrive before the consumer pulls (no dropped events)', async () => {
    const fx = fakeTransport();
    const it = consumeStream(fx.transport, 't', 'run', [], 3);
    // Prime the request/subscription.
    const first = it.next();
    // Host bursts all frames before we drain.
    fx.emit(3, { kind: 'event', value: 1 });
    fx.emit(3, { kind: 'event', value: 2 });
    fx.emit(3, { kind: 'done', value: 'fin' });

    expect(await first).toEqual({ value: 1, done: false });
    expect(await it.next()).toEqual({ value: 2, done: false });
    expect(await it.next()).toEqual({ value: 'fin', done: true });
  });
});
