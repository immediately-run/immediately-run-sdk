// R3-46 — the reportReady/onReady/getReadyState surface (LOAD_PROFILING_SPEC §3.1).
import { reportReady, onReady, getReadyState, __setReadyDeps, __resetReady } from "./ready";

describe("ready signal surface", () => {
  let sent: Array<{ type: string; data?: Record<string, unknown> }>;
  let clock: number;

  beforeEach(() => {
    __resetReady();
    sent = [];
    clock = 0;
    __setReadyDeps({
      send: (type, data) => sent.push({ type, data }),
      now: () => clock,
    });
  });
  afterEach(() => __resetReady());

  it("starts un-reported", () => {
    expect(getReadyState()).toEqual({ reported: false });
  });

  it("reportReady() stamps the time, forwards `ir-report-ready`, and is idempotent", () => {
    clock = 42;
    reportReady();
    expect(getReadyState()).toEqual({ reported: true, reportedAt: 42 });
    expect(sent).toEqual([{ type: "ir-report-ready", data: { at: 42 } }]);
    // A second call is a no-op — only the first report counts.
    clock = 99;
    reportReady();
    expect(getReadyState()).toEqual({ reported: true, reportedAt: 42 });
    expect(sent).toHaveLength(1);
  });

  it("onReady fires immediately with current state, then on report", () => {
    const seen: boolean[] = [];
    const off = onReady((s) => seen.push(s.reported));
    expect(seen).toEqual([false]); // immediate replay of the current (un-reported) state
    clock = 7;
    reportReady();
    expect(seen).toEqual([false, true]);
    off();
    reportReady(); // already reported + unsubscribed → no further calls
    expect(seen).toEqual([false, true]);
  });

  it("a late subscriber (after reportReady) still receives the reported state", () => {
    clock = 5;
    reportReady();
    let got: boolean | undefined;
    onReady((s) => (got = s.reported));
    expect(got).toBe(true);
  });
});
