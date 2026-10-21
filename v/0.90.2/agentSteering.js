import "./chunk-VHAA22YE.js";
const STEER_MARKER = "\u241F[steer]\n";
const STEER_INTERRUPT_MARKER = "\u241F[steer:interrupt]\n";
const INTERRUPTED_TURN_TEXT = "(turn interrupted by the user)";
const steerWireText = (m) => (m.mode === "interrupt" ? STEER_INTERRUPT_MARKER : STEER_MARKER) + m.text;
function parseSteer(text) {
  if (text.startsWith(STEER_INTERRUPT_MARKER)) {
    return { mode: "interrupt", text: text.slice(STEER_INTERRUPT_MARKER.length) };
  }
  if (text.startsWith(STEER_MARKER)) return { mode: "queue", text: text.slice(STEER_MARKER.length) };
  return null;
}
let seq = 0;
const nextId = () => {
  seq += 1;
  return `steer-${Date.now().toString(36)}-${seq}`;
};
class SteerController {
  constructor() {
    this.queue = [];
    this.controller = new AbortController();
    this.listeners = /* @__PURE__ */ new Set();
  }
  /** Queue a correction. Returns its id so the UI can cancel it while it waits. */
  enqueue(text, mode = "queue") {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const msg = { id: nextId(), text: trimmed, mode };
    this.queue.push(msg);
    if (mode === "interrupt") this.controller.abort();
    this.emit();
    return msg;
  }
  /** Drop a queued steer that has not been applied yet. */
  cancel(id) {
    const before = this.queue.length;
    this.queue = this.queue.filter((m) => m.id !== id);
    if (this.queue.length === before) return false;
    if (!this.queue.some((m) => m.mode === "interrupt")) this.rearm();
    this.emit();
    return true;
  }
  /** Everything still waiting, for the UI's "queued" affordance. */
  pending() {
    return this.queue;
  }
  hasPending() {
    return this.queue.length > 0;
  }
  drain() {
    const out = this.queue;
    this.queue = [];
    if (out.length) this.emit();
    return out;
  }
  get interrupt() {
    return this.controller.signal;
  }
  rearm() {
    if (this.controller.signal.aborted) this.controller = new AbortController();
  }
  /** Subscribe to queue changes (the UI re-renders its queued chips). */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit() {
    for (const l of this.listeners) l(this.queue);
  }
}
function anySignal(signals) {
  const live = signals.filter((s) => !!s);
  const controller = new AbortController();
  const already = live.find((s) => s.aborted);
  if (already) {
    controller.abort(already.reason);
    return { signal: controller.signal, dispose: () => {
    } };
  }
  const onAbort = (e) => controller.abort(e.target.reason);
  for (const s of live) s.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      for (const s of live) s.removeEventListener("abort", onAbort);
    }
  };
}
export {
  INTERRUPTED_TURN_TEXT,
  STEER_INTERRUPT_MARKER,
  STEER_MARKER,
  SteerController,
  anySignal,
  parseSteer,
  steerWireText
};
//# sourceMappingURL=agentSteering.js.map