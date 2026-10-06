import "./chunk-VHAA22YE.js";
class PauseController {
  constructor() {
    this.paused = false;
    this.waiters = /* @__PURE__ */ new Set();
    this.listeners = /* @__PURE__ */ new Set();
  }
  /** Set the pause state. Idempotent — setting the value it already holds does nothing. */
  set(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) {
      const waiting = [...this.waiters];
      this.waiters.clear();
      for (const w of waiting) w();
    }
    for (const l of this.listeners) l(this.paused);
  }
  isPaused() {
    return this.paused;
  }
  whenResumed(signal) {
    if (!this.paused || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.waiters.delete(done);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      this.waiters.add(done);
      signal?.addEventListener("abort", done, { once: true });
    });
  }
  /** Subscribe to pause changes (a UI showing "paused — this view is hidden"). */
  onChange(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
export {
  PauseController
};
//# sourceMappingURL=agentPause.js.map