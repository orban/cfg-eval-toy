import { describe, it, expect } from "vitest";
import { wilsonCI, confidenceLabel } from "./stats";

describe("wilsonCI", () => {
  it("returns [0, 0] for n=0", () => {
    expect(wilsonCI(0, 0)).toEqual({ low: 0, high: 0 });
  });

  it("matches the canonical Wilson formula at n=100, k=50 (expected ≈ [40.4, 59.6])", () => {
    const ci = wilsonCI(50, 100);
    expect(ci.low).toBeGreaterThan(0.4);
    expect(ci.low).toBeLessThan(0.42);
    expect(ci.high).toBeGreaterThan(0.59);
    expect(ci.high).toBeLessThan(0.61);
  });

  it("is wide at n=10, k=8 — the exact case the Loom narrative hinges on", () => {
    // At n=10 and 80% observed pass rate, the 95% Wilson interval is ~[44, 97].
    // The width itself is the insight: ten trials isn't enough to commit.
    const ci = wilsonCI(8, 10);
    expect(ci.low).toBeGreaterThan(0.44);
    expect(ci.low).toBeLessThan(0.50);
    expect(ci.high).toBeGreaterThan(0.94);
    expect(ci.high).toBeLessThan(0.98);
  });

  it("handles p=1 without blowing up (the normal approximation fails here)", () => {
    const ci = wilsonCI(10, 10);
    expect(ci.high).toBe(1);
    expect(ci.low).toBeGreaterThan(0.65);
    expect(ci.low).toBeLessThan(0.75);
  });

  it("handles p=0 symmetrically", () => {
    const ci = wilsonCI(0, 10);
    expect(ci.low).toBe(0);
    expect(ci.high).toBeLessThan(0.35);
    expect(ci.high).toBeGreaterThan(0.25);
  });

  it("narrows as n grows — hold pass rate at 100%, sweep n", () => {
    const widths = [10, 50, 200].map((n) => {
      const ci = wilsonCI(n, n);
      return ci.high - ci.low;
    });
    // Width is monotonically non-increasing
    expect(widths[1]).toBeLessThan(widths[0]);
    expect(widths[2]).toBeLessThan(widths[1]);
  });
});

describe("confidenceLabel", () => {
  it("labels a 5-trial 100%-pass interval as LOW (width > 0.30)", () => {
    expect(confidenceLabel(wilsonCI(5, 5))).toBe("LOW");
  });

  it("labels n=10 with 8/10 passes as LOW", () => {
    expect(confidenceLabel(wilsonCI(8, 10))).toBe("LOW");
  });

  it("labels a very narrow interval at n=200 as HIGH", () => {
    expect(confidenceLabel(wilsonCI(190, 200))).toBe("HIGH");
  });
});
