import { describe, it, expect } from "vitest";
import {
  monthlyPI,
  totalInterest,
  pointsBreakeven,
  refinanceBreakeven,
  rentVsBuy,
  affordability,
  pointsVsCredit,
  clampNumber,
} from "./calc";

describe("monthlyPI", () => {
  it("matches the standard amortization formula", () => {
    // $300,000 at 6% for 30 years ≈ $1,798.65
    expect(monthlyPI(300_000, 6, 360)).toBeCloseTo(1798.65, 1);
  });
  it("handles a 0% rate as straight-line", () => {
    expect(monthlyPI(120_000, 0, 120)).toBeCloseTo(1000, 6);
  });
  it("returns 0 for empty inputs", () => {
    expect(monthlyPI(0, 6, 360)).toBe(0);
    expect(monthlyPI(100, 6, 0)).toBe(0);
  });
});

describe("totalInterest", () => {
  it("is payment × n − principal", () => {
    const p = monthlyPI(300_000, 6, 360);
    expect(totalInterest(300_000, 6, 360)).toBeCloseTo(p * 360 - 300_000, 4);
  });
});

describe("pointsBreakeven", () => {
  it("computes savings and the first month cumulative savings cover the cost", () => {
    const r = pointsBreakeven({
      loanAmount: 400_000,
      rateWithoutPoints: 6.75,
      rateWithPoints: 6.5,
      pointsCost: 4_000,
    });
    expect(r.monthlySavings).toBeGreaterThan(0);
    expect(r.breakevenMonth).toBe(Math.ceil(4_000 / r.monthlySavings));
    expect(r.chart[r.breakevenMonth - 1].cumulativeSavings).toBeGreaterThanOrEqual(4_000);
    expect(r.chart[r.breakevenMonth - 2].cumulativeSavings).toBeLessThan(4_000);
  });
  it("never breaks even when the points rate is not lower", () => {
    const r = pointsBreakeven({ loanAmount: 400_000, rateWithoutPoints: 6.5, rateWithPoints: 6.5, pointsCost: 4_000 });
    expect(r.breakevenMonth).toBe(Infinity);
  });
  it("carries an assumptions block", () => {
    const r = pointsBreakeven({ loanAmount: 1, rateWithoutPoints: 6, rateWithPoints: 5, pointsCost: 0 });
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.assumptions.some((a) => a.key === "rates")).toBe(true);
  });
});

describe("refinanceBreakeven", () => {
  it("recovers closing costs from monthly savings", () => {
    const r = refinanceBreakeven({
      currentBalance: 350_000,
      currentRate: 7.25,
      currentRemainingTermMonths: 336,
      newRate: 6.25,
      newTermMonths: 360,
      closingCosts: 6_000,
    });
    expect(r.monthlyChange).toBeLessThan(0);
    expect(r.breakevenMonth).toBe(Math.ceil(6_000 / -r.monthlyChange));
  });
  it("reports Infinity when the payment goes up", () => {
    const r = refinanceBreakeven({
      currentBalance: 350_000,
      currentRate: 5,
      currentRemainingTermMonths: 300,
      newRate: 7,
      newTermMonths: 360,
      closingCosts: 6_000,
    });
    expect(r.breakevenMonth).toBe(Infinity);
  });
  it("includes closing costs in the total interest delta", () => {
    const r = refinanceBreakeven({
      currentBalance: 100_000,
      currentRate: 6,
      currentRemainingTermMonths: 360,
      newRate: 6,
      newTermMonths: 360,
      closingCosts: 3_000,
    });
    expect(r.totalInterestDelta).toBeCloseTo(3_000, 4);
  });
});

describe("rentVsBuy", () => {
  const base = {
    monthlyRent: 2_500,
    rentIncreasePct: 3,
    homePrice: 500_000,
    downPaymentPct: 20,
    rate: 6.5,
    propertyTaxPct: 1,
    insuranceAnnual: 1_500,
    maintenancePct: 1,
    hoaMonthly: 0,
    appreciationPct: 3,
    sellingCostPct: 6,
    buyingCosts: 10_000,
    horizonYears: 7,
    investmentReturnPct: 5,
  };
  it("produces one row per year and finite totals", () => {
    const r = rentVsBuy(base);
    expect(r.yearly).toHaveLength(7);
    expect(Number.isFinite(r.rentNetCost)).toBe(true);
    expect(Number.isFinite(r.buyNetCost)).toBe(true);
    expect(r.homeValueAtHorizon).toBeCloseTo(500_000 * Math.pow(1.03, 7), 2);
  });
  it("makes buying cheaper when appreciation is very high", () => {
    const r = rentVsBuy({ ...base, appreciationPct: 15 });
    expect(r.buyNetCost).toBeLessThan(r.rentNetCost);
    expect(r.breakevenYear).not.toBeNull();
  });
  it("makes renting cheaper when the home does not appreciate and rent is cheap", () => {
    const r = rentVsBuy({ ...base, appreciationPct: 0, monthlyRent: 800, rentIncreasePct: 0 });
    expect(r.rentNetCost).toBeLessThan(r.buyNetCost);
  });
});

describe("affordability", () => {
  it("applies the lower of the front-end and back-end limits", () => {
    const r = affordability({ annualIncome: 120_000, monthlyDebts: 800, downPayment: 60_000, rate: 6.5 });
    const income = 10_000;
    expect(r.conservativePayment).toBeCloseTo(Math.min(income * 0.28, income * 0.36 - 800), 6);
    expect(r.upperPayment).toBeGreaterThanOrEqual(r.conservativePayment);
    expect(r.upperPrice).toBeGreaterThanOrEqual(r.conservativePrice);
  });
  it("round-trips: the price it returns costs the budget it was given", () => {
    const r = affordability({
      annualIncome: 120_000,
      monthlyDebts: 0,
      downPayment: 50_000,
      rate: 6,
      propertyTaxPct: 1.2,
      insuranceAnnual: 1_200,
      hoaMonthly: 100,
    });
    const price = r.conservativePrice;
    const allIn = monthlyPI(price - 50_000, 6, 360) + (price * 0.012) / 12 + 100 + 100;
    expect(allIn).toBeCloseTo(r.conservativePayment, 4);
  });
  it("returns zero when debts exceed the ratio", () => {
    const r = affordability({ annualIncome: 30_000, monthlyDebts: 2_000, downPayment: 0, rate: 6 });
    expect(r.conservativePayment).toBe(0);
    expect(r.conservativePrice).toBe(0);
  });
});

describe("pointsVsCredit", () => {
  it("prices both branches and a break-even month", () => {
    const r = pointsVsCredit({
      loanAmount: 400_000,
      parRate: 6.5,
      pointsPct: 1,
      rateReductionForPoints: 0.25,
      creditPct: 1,
      rateIncreaseForCredit: 0.25,
    });
    expect(r.points.rate).toBeCloseTo(6.25);
    expect(r.credit.rate).toBeCloseTo(6.75);
    expect(r.points.upfront).toBe(4_000);
    expect(r.credit.upfront).toBe(-4_000);
    expect(r.monthlyDifference).toBeGreaterThan(0);
    expect(r.breakevenMonth).toBe(Math.ceil(8_000 / r.monthlyDifference));
  });
});

describe("clampNumber", () => {
  it("clamps and falls back", () => {
    expect(clampNumber(5, 0, 3, 1)).toBe(3);
    expect(clampNumber("x", 0, 3, 1)).toBe(1);
    expect(clampNumber(NaN, 0, 3, 2)).toBe(2);
  });
});
