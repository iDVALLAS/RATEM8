import { describe, expect, it } from "vitest";
import { balanceAfter, estimate, payment } from "./watch";

describe("Refi watch estimates (D12)", () => {
  it("matches standard amortization", () => {
    // $400,000 at 7% over 30 years is about $2,661/mo.
    expect(Math.round(payment(400_000, 7, 360))).toBe(2661);
    expect(balanceAfter(400_000, 7, 360, 0)).toBeCloseTo(400_000, 0);
    expect(balanceAfter(400_000, 7, 360, 360)).toBeLessThan(1);
    // After 5 years about $376,500 remains.
    expect(Math.round(balanceAfter(400_000, 7, 360, 60) / 1000)).toBe(377);
  });
  it("estimates the monthly change and months to break even", () => {
    const e = estimate({ amount: 400_000, noteRate: 7.25, closedOn: "2024-11-01" }, 6.25, 4000, new Date("2026-11-17T12:00:00Z"))!;
    expect(e.monthsPaid).toBe(24);
    expect(e.gap).toBe(1);
    expect(e.monthly30).toBeGreaterThan(200);
    expect(e.breakEven30).toBe(Math.ceil(4000 / e.monthly30));
    expect(e.monthlySameTerm).toBeLessThan(e.monthly30);
  });
  it("says nothing it can't back up", () => {
    expect(estimate({ amount: 0, noteRate: 7, closedOn: "2024-01-01" }, 6, 4000, new Date())).toBeNull();
    expect(estimate({ amount: 1, noteRate: 7, closedOn: "not a date" }, 6, 4000, new Date())).toBeNull();
    const higher = estimate({ amount: 300_000, noteRate: 5, closedOn: "2022-01-01" }, 6.5, 4000, new Date("2026-11-17T12:00:00Z"))!;
    expect(higher.monthly30).toBeLessThan(0);
    expect(higher.breakEven30).toBeNull();
  });
});
