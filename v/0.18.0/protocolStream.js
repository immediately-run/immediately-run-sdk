import { addListener, sendMessage } from "./sandboxUtils";
class StreamError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StreamError";
    this.code = code;
  }
}
let streamCounter = 0;
const nextMsgId = () => {
  streamCounter = (streamCounter + 1) % Number.MAX_SAFE_INTEGER;
  return streamCounter;
};
async function* consumeStream(transport, type, method, params, msgId = nextMsgId()) {
  const queue = [];
  let wake = null;
  const push = (frame) => {
    queue.push(frame);
    const w = wake;
    wake = null;
    w?.();
  };
  const unsubscribe = transport.subscribe(type, (msg) => {
    if (msg.msgId !== msgId || !msg.stream) return;
    push(msg.stream);
  });
  try {
    transport.send({ type, method, params, msgId, stream: true });
    while (true) {
      if (queue.length === 0) {
        await new Promise((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const frame = queue.shift();
      if (frame.kind === "event") {
        yield frame.value;
      } else if (frame.kind === "done") {
        return frame.value;
      } else {
        throw new StreamError(frame.code, frame.message);
      }
    }
  } finally {
    unsubscribe();
  }
}
const bundlerTransport = {
  send: (msg) => sendMessage(msg.type, msg),
  subscribe: (type, handler) => addListener(type, (msg) => handler(msg))
};
function protocolStream(protocolName, method, params) {
  return consumeStream(bundlerTransport, protocolName, method, params);
}
export {
  StreamError,
  consumeStream,
  protocolStream
};
//# sourceMappingURL=protocolStream.js.map