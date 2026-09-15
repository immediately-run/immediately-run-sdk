import "./chunk-VHAA22YE.js";
import { addListener, sendMessage } from "./sandboxUtils";
import {
  attendanceOf,
  attendanceReason,
  firstFrameTimeoutFor,
  PENDING_NOTICE_MS,
  ProtocolTimeoutError,
  STREAM_IDLE_TIMEOUT_MS
} from "./protocolDeadline";
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
async function* consumeStream(transport, type, method, params, msgId = nextMsgId(), signal, opts) {
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
  const scheme = type.startsWith("protocol-") ? type.slice("protocol-".length) : type;
  const call = `${scheme}:${method}`;
  const attendance = attendanceOf(scheme, method);
  const firstFrameMs = opts?.timeoutMs ?? firstFrameTimeoutFor(scheme, method);
  const idleMs = opts?.idleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS;
  let sawFrame = false;
  let noticed = false;
  const awaitFrame = async () => {
    const budget = sawFrame ? idleMs : firstFrameMs;
    if (!Number.isFinite(budget)) {
      await new Promise((resolve) => {
        wake = resolve;
      });
      return;
    }
    const startedAt = Date.now();
    let deadline;
    let notice;
    try {
      await new Promise((resolve, reject) => {
        wake = resolve;
        deadline = setTimeout(() => reject(new ProtocolTimeoutError(call, budget, attendance)), budget);
        if (opts?.onPending && !noticed) {
          notice = setTimeout(() => {
            noticed = true;
            try {
              opts.onPending?.({
                call,
                attendance,
                elapsedMs: Date.now() - startedAt,
                ...attendanceReason(scheme, method) ? { reason: attendanceReason(scheme, method) } : {}
              });
            } catch {
            }
          }, PENDING_NOTICE_MS);
        }
      });
    } finally {
      if (deadline !== void 0) clearTimeout(deadline);
      if (notice !== void 0) clearTimeout(notice);
      wake = null;
    }
  };
  try {
    if (signal?.aborted) throw new StreamError("aborted", "stream aborted before start");
    transport.send({ type, method, params, msgId, stream: true });
    started = true;
    while (true) {
      if (signal?.aborted) throw new StreamError("aborted", "stream aborted");
      if (queue.length === 0) {
        await awaitFrame();
        continue;
      }
      sawFrame = true;
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
function protocolStream(protocolName, method, params, signal, opts) {
  return consumeStream(bundlerTransport, protocolName, method, params, void 0, signal, opts);
}
export {
  StreamError,
  consumeStream,
  protocolStream
};
//# sourceMappingURL=protocolStream.js.map