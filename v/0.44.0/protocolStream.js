import "./chunk-VHAA22YE.js";
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
async function* consumeStream(transport, type, method, params, msgId = nextMsgId(), signal) {
  const queue = [];
  let wake = null;
  let settled = false;
  let started = false;
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
  const onAbort = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  if (signal) signal.addEventListener("abort", onAbort);
  try {
    if (signal?.aborted) throw new StreamError("aborted", "stream aborted before start");
    transport.send({ type, method, params, msgId, stream: true });
    started = true;
    while (true) {
      if (signal?.aborted) throw new StreamError("aborted", "stream aborted");
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
        settled = true;
        return frame.value;
      } else {
        settled = true;
        throw new StreamError(frame.code, frame.message);
      }
    }
  } finally {
    unsubscribe();
    if (signal) signal.removeEventListener("abort", onAbort);
    if (started && !settled) transport.cancel?.({ type, msgId, cancel: true });
  }
}
const bundlerTransport = {
  send: (msg) => sendMessage(msg.type, msg),
  subscribe: (type, handler) => addListener(type, (msg) => handler(msg)),
  cancel: (msg) => sendMessage(msg.type, msg)
};
function protocolStream(protocolName, method, params, signal) {
  return consumeStream(bundlerTransport, protocolName, method, params, void 0, signal);
}
export {
  StreamError,
  consumeStream,
  protocolStream
};
//# sourceMappingURL=protocolStream.js.map