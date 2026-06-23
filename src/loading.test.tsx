/**
 * @jest-environment jsdom
 */
// R3-133 — the in-app loading primitives (LOADING_UX_SPEC §9, brief 19).
// Uses the SDK's createRoot + act test convention (see boot.test.tsx); plain-DOM
// assertions (no @testing-library/jest-dom).
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Skeleton, SkeletonRow, Spinner, LoadingRegion, LOADING_TIMINGS } from "./loading";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderC(ui: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    rerender: (u: ReactNode) => act(() => root.render(u)),
    unmount: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  document.getElementById("ir-sdk-loading-styles")?.remove();
});

describe("loading primitives (R3-133)", () => {
  it("exports the platform-matching timing constants", () => {
    expect(LOADING_TIMINGS.spinThresholdMs).toBe(150);
    expect(LOADING_TIMINGS.fadeMs).toBe(150);
  });

  it("injects the shimmer/spin keyframes once (self-contained, no CSS import)", () => {
    renderC(<SkeletonRow />);
    expect(document.querySelectorAll("#ir-sdk-loading-styles")).toHaveLength(1);
    renderC(<Skeleton archetype="panel.list" />);
    expect(document.querySelectorAll("#ir-sdk-loading-styles")).toHaveLength(1); // still once
  });

  it("Skeleton renders a decorative shaped silhouette (in-app a11y, not host chrome)", () => {
    const { container } = renderC(<Skeleton archetype="panel.list" />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("aria-hidden")).toBe("true"); // decorative
    expect(container.querySelectorAll(".ir-sdk-shim").length).toBeGreaterThan(0);
    // NEVER imitates trusted host chrome: no wordmark, no host landmark, no controls.
    expect(container.textContent).toBe("");
    expect(container.querySelector('[role="region"], button, a')).toBeNull();
  });

  it("renders a silhouette for every archetype", () => {
    for (const a of ["panel.list", "panel.tree", "panel.editor", "panel.conversation", "generic"] as const) {
      const { container, unmount } = renderC(<Skeleton archetype={a} />);
      expect(container.querySelectorAll(".ir-sdk-shim").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("Spinner respects the 150 ms floor — no flash on a fast wait", () => {
    jest.useFakeTimers();
    try {
      const { container } = renderC(<Spinner />);
      expect(container.querySelector('[role="status"]')).toBeNull(); // nothing yet
      act(() => {
        jest.advanceTimersByTime(150);
      });
      const spin = container.querySelector('[role="status"]');
      expect(spin).not.toBeNull();
      expect(spin!.classList.contains("ir-sdk-spin")).toBe(true); // reduced-motion stills this via CSS
      expect(spin!.getAttribute("aria-label")).toBe("Loading");
    } finally {
      act(() => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it("LoadingRegion shows an aria-busy indicator while loading, then the children", () => {
    const { container, rerender } = renderC(
      <LoadingRegion loading fallback={<Skeleton archetype="generic" />}>
        <div>real content</div>
      </LoadingRegion>,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain("real content");
    rerender(
      <LoadingRegion loading={false} fallback={<Skeleton archetype="generic" />}>
        <div>real content</div>
      </LoadingRegion>,
    );
    expect(container.textContent).toContain("real content");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
