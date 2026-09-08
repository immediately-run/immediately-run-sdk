// Pause + resume for a run whose surface the user cannot see (R3-562;
// AGENT_RUN_DURABILITY_SPEC §7 R-ARD-20a).
//
// WHY. The host now keeps a chrome region MOUNTED and merely hides it when the user
// switches activity, so coming back does not reboot the app's iframe and destroy the
// run (§7 R-ARD-20 — the T1 teardown). But hiding stops a frame PAINTING, not
// executing, and a loop that keeps executing behind `display:none` + `inert` breaks a
// requirement `LLM_AND_AGENTS_SPEC` §3.3 calls normative: the **loop observability
// contract** wants a streaming transcript, a tool-call log rendered in order, a
// reachable **stop button**, and every write visible at or before contribute. None of
// that survives an inert subtree. It also contradicts R-ARD-15 one section earlier,
// which forbids an agent writing files with no human present.
//
// So: kept-mounted, not kept-executing. The run pauses at its next turn boundary and
// continues when the region is revealed. It costs nothing — the frame, the in-memory
// loop state and the transcript all survive, so a reveal continues with zero waste, no
// repair pass and no resume gate. The run is never torn down; it is only not advancing
// while nobody can see or stop it.
//
// THE THREE VERBS ARE NOT THE SAME.
//   * STOP   — `RunAgentOptions.signal`. Ends the run. The transcript so far is kept.
//   * STEER  — `agentSteering.ts`. Ends the current TURN, injects a correction, CONTINUES.
//   * PAUSE  — this controller. Ends nothing and injects nothing: the loop simply does
//              not start its next turn until the pause lifts. The user did not ask for
//              it and never sees it as an interruption — it is the host's fact about
//              whether anyone is watching, so it leaves no mark in the transcript.
//
// WHY IT NEVER INTERRUPTS A TURN. The loop checks this at the TOP of an iteration, after
// the previous iteration's tool batch has appended every `tool_result`. Pausing anywhere
// else could leave a `tool_use` block without its pair, and the next request would then be
// malformed and rejected by the provider for the whole conversation — the same property
// `agentSteering` states for an interrupt, and for the same reason.

/** What the loop needs from a pause source (so it can be faked in tests). */
export interface PauseSource {
  /** Is the run currently not allowed to advance? Read at each turn boundary. */
  isPaused(): boolean;
  /**
   * Resolves when the pause lifts — or immediately if it is already lifted.
   *
   * `signal` is the RUN's stop signal, and passing it is not optional in practice: a run
   * stopped (or signed out) while its region is hidden would otherwise await a resume
   * that never comes, and the awaited promise would keep the whole loop — transcript,
   * tools, client — alive for the life of the tab. Resolving on abort hands control back
   * to the loop, which re-checks `signal.aborted` and breaks.
   */
  whenResumed(signal?: AbortSignal): Promise<void>;
}

/**
 * The live pause state. Owned by the app (which sets it from the host's
 * `onRegionVisibilityChange`) and read by the loop.
 *
 * Deliberately NOT wired to the visibility channel in here: the controller is the
 * mechanism and knows nothing about why a run is paused, which keeps it usable for a
 * second reason later (a phone backgrounding, a user "hold" button) without this file
 * having an opinion about which reasons exist.
 */
export class PauseController implements PauseSource {
  private paused = false;
  private waiters = new Set<() => void>();
  private listeners = new Set<(paused: boolean) => void>();

  /** Set the pause state. Idempotent — setting the value it already holds does nothing. */
  set(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) {
      // Copy before draining: a waiter's continuation may synchronously pause again,
      // and iterating the live set while it is being added to is how that turns into a
      // lost or double-fired wake.
      const waiting = [...this.waiters];
      this.waiters.clear();
      for (const w of waiting) w();
    }
    for (const l of this.listeners) l(this.paused);
  }

  isPaused(): boolean {
    return this.paused;
  }

  whenResumed(signal?: AbortSignal): Promise<void> {
    if (!this.paused || signal?.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = (): void => {
        this.waiters.delete(done);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      this.waiters.add(done);
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  /** Subscribe to pause changes (a UI showing "paused — this view is hidden"). */
  onChange(listener: (paused: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
