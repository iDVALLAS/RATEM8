/**
 * lib/calc.ts — every calculation the site or the agent API performs.
 *
 * Pure, deterministic, no I/O. Rates are annual percentages the USER
 * entered (6.5 = 6.5%). Money in dollars. Time in months unless named.
 * Every function returns an `assumptions` block so a page, a brief, or
 * an API response can show its work.
 *
 * Unit tests: lib/calc.test.ts (`npm test`).
 */

export {
  monthlyPI,
  totalInterest,
  amortizationSchedule,
  payoffWithExtraPayment,
  payoffWithLumpSum,
  extraNeededForTargetMonths,
  biWeeklyComparison,
} from "./calc/mortgage";

import { monthlyPI, totalInterest, amortizationSchedule } from "./calc/mortgage";

export type Assumption = { key: string; label: string; value: string; note?: string };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n}%`;
const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/* ─── Points break-even ─────────────────────────────────────── */

export type PointsBreakevenInput = {
  loanAmount: number;
  rateWithoutPoints: number;
  rateWithPoints: number;
  /** Dollar cost of the points. */
  pointsCost: number;
  termMonths?: number;
  /** How many months to chart. */
  chartMonths?: number;
};

export type PointsBreakevenResult = {
  paymentWithoutPoints: number;
  paymentWithPoints: number;
  monthlySavings: number;
  /** First month where cumulative savings ≥ points cost. Infinity if never. */
  breakevenMonth: number;
  chart: { month: number; cumulativeSavings: number; pointsCost: number }[];
  assumptions: Assumption[];
};

export function pointsBreakeven(input: PointsBreakevenInput): PointsBreakevenResult {
  const term = input.termMonths ?? 360;
  const chartMonths = input.chartMonths ?? 120;
  const paymentWithoutPoints = monthlyPI(input.loanAmount, input.rateWithoutPoints, term);
  const paymentWithPoints = monthlyPI(input.loanAmount, input.rateWithPoints, term);
  const monthlySavings = paymentWithoutPoints - paymentWithPoints;
  const breakevenMonth =
    monthlySavings > 0 && input.pointsCost > 0
      ? Math.ceil(input.pointsCost / monthlySavings)
      : monthlySavings > 0 && input.pointsCost <= 0
      ? 0
      : Infinity;
  const chart = Array.from({ length: chartMonths }, (_, i) => ({
    month: i + 1,
    cumulativeSavings: monthlySavings * (i + 1),
    pointsCost: input.pointsCost,
  }));
  return {
    paymentWithoutPoints,
    paymentWithPoints,
    monthlySavings,
    breakevenMonth,
    chart,
    assumptions: [
      { key: "term", label: "Loan term", value: `${term} months` },
      { key: "amortization", label: "Amortization", value: "Standard fixed-rate, level payment" },
      { key: "savings", label: "Savings basis", value: "Principal & interest only", note: "Taxes, insurance, and MI are unchanged by points and are excluded." },
      { key: "timeValue", label: "Time value of money", value: "Ignored", note: "Break-even is a simple payback, not a discounted one." },
      { key: "rates", label: "Rates", value: "User-entered", note: "The calculators never supply a rate." },
    ],
  };
}

/* ─── Refinance break-even ──────────────────────────────────── */

export type RefinanceBreakevenInput = {
  currentBalance: number;
  currentRate: number;
  currentRemainingTermMonths: number;
  newRate: number;
  newTermMonths: number;
  closingCosts: number;
};

export type RefinanceBreakevenResult = {
  currentPayment: number;
  newPayment: number;
  /** newPayment - currentPayment (negative = lower payment). */
  monthlyChange: number;
  /** Months until closing costs are recovered from payment savings. Infinity if payment does not drop. */
  breakevenMonth: number;
  currentTotalInterest: number;
  newTotalInterest: number;
  /** newTotalInterest + closingCosts - currentTotalInterest (negative = you pay less overall). */
  totalInterestDelta: number;
  assumptions: Assumption[];
};

export function refinanceBreakeven(input: RefinanceBreakevenInput): RefinanceBreakevenResult {
  const currentPayment = monthlyPI(input.currentBalance, input.currentRate, input.currentRemainingTermMonths);
  const newPayment = monthlyPI(input.currentBalance, input.newRate, input.newTermMonths);
  const monthlyChange = newPayment - currentPayment;
  const savings = -monthlyChange;
  const breakevenMonth =
    savings > 0 ? (input.closingCosts > 0 ? Math.ceil(input.closingCosts / savings) : 0) : Infinity;
  const currentTotalInterest = totalInterest(input.currentBalance, input.currentRate, input.currentRemainingTermMonths);
  const newTotalInterest = totalInterest(input.currentBalance, input.newRate, input.newTermMonths);
  return {
    currentPayment,
    newPayment,
    monthlyChange,
    breakevenMonth,
    currentTotalInterest,
    newTotalInterest,
    totalInterestDelta: newTotalInterest + input.closingCosts - currentTotalInterest,
    assumptions: [
      { key: "balance", label: "New loan amount", value: "Equal to current balance", note: "Closing costs are treated as paid in cash, not rolled in." },
      { key: "term", label: "Terms", value: `${input.currentRemainingTermMonths} months remaining vs. ${input.newTermMonths} months new` },
      { key: "pi", label: "Basis", value: "Principal & interest only" },
      { key: "timeValue", label: "Time value of money", value: "Ignored" },
      { key: "rates", label: "Rates", value: "User-entered" },
    ],
  };
}

/* ─── Rent vs. buy ──────────────────────────────────────────── */

export type RentVsBuyInput = {
  monthlyRent: number;
  /** Annual rent increase, %. */
  rentIncreasePct: number;
  homePrice: number;
  /** % of price. */
  downPaymentPct: number;
  rate: number;
  termMonths?: number;
  /** Annual property tax as % of home value. */
  propertyTaxPct: number;
  /** Annual homeowners insurance, dollars. */
  insuranceAnnual: number;
  /** Annual maintenance as % of home value. */
  maintenancePct: number;
  hoaMonthly: number;
  /** Annual home appreciation, %. */
  appreciationPct: number;
  /** Cost to sell as % of sale price. */
  sellingCostPct: number;
  /** Closing costs to buy, dollars. */
  buyingCosts: number;
  horizonYears: number;
  /** Annual return the renter earns on the down payment they did not spend, %. */
  investmentReturnPct: number;
};

export type RentVsBuyResult = {
  /** Total rent paid over the horizon, minus what the invested down payment grew to. */
  rentNetCost: number;
  /** Total cash out to own (payments, taxes, insurance, maintenance, HOA, buying + selling costs) minus equity walked away with. */
  buyNetCost: number;
  totalRentPaid: number;
  totalOwnershipOutlay: number;
  equityAtSale: number;
  homeValueAtHorizon: number;
  /** First year buying nets cheaper than renting; null if never within horizon. */
  breakevenYear: number | null;
  yearly: { year: number; rentNet: number; buyNet: number }[];
  assumptions: Assumption[];
};

export function rentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const term = input.termMonths ?? 360;
  const downPayment = input.homePrice * (input.downPaymentPct / 100);
  const loan = input.homePrice - downPayment;
  const schedule = amortizationSchedule(loan, input.rate, term);
  const payment = monthlyPI(loan, input.rate, term);
  const yearly: RentVsBuyResult["yearly"] = [];

  let rent = input.monthlyRent;
  let totalRent = 0;
  let invested = downPayment + input.buyingCosts;
  let homeValue = input.homePrice;
  let ownershipOutlay = downPayment + input.buyingCosts;
  let breakevenYear: number | null = null;

  for (let y = 1; y <= input.horizonYears; y++) {
    totalRent += rent * 12;
    invested *= 1 + input.investmentReturnPct / 100;
    rent *= 1 + input.rentIncreasePct / 100;

    const tax = homeValue * (input.propertyTaxPct / 100);
    const maint = homeValue * (input.maintenancePct / 100);
    ownershipOutlay += payment * 12 + tax + input.insuranceAnnual + maint + input.hoaMonthly * 12;
    homeValue *= 1 + input.appreciationPct / 100;

    const monthIdx = Math.min(y * 12, schedule.length) - 1;
    const balance = monthIdx >= 0 ? schedule[monthIdx].balance : loan;
    const equity = homeValue - balance - homeValue * (input.sellingCostPct / 100);

    const rentNet = totalRent - (invested - (downPayment + input.buyingCosts));
    const buyNet = ownershipOutlay - equity;
    yearly.push({ year: y, rentNet, buyNet });
    if (breakevenYear === null && buyNet <= rentNet) breakevenYear = y;
  }

  const last = yearly[yearly.length - 1] ?? { rentNet: 0, buyNet: 0 };
  const monthIdx = Math.min(input.horizonYears * 12, schedule.length) - 1;
  const balance = monthIdx >= 0 ? schedule[monthIdx].balance : loan;

  return {
    rentNetCost: finite(last.rentNet),
    buyNetCost: finite(last.buyNet),
    totalRentPaid: totalRent,
    totalOwnershipOutlay: ownershipOutlay,
    equityAtSale: homeValue - balance - homeValue * (input.sellingCostPct / 100),
    homeValueAtHorizon: homeValue,
    breakevenYear,
    yearly,
    assumptions: [
      { key: "rentIncrease", label: "Rent increase", value: `${pct(input.rentIncreasePct)} per year` },
      { key: "appreciation", label: "Home appreciation", value: `${pct(input.appreciationPct)} per year`, note: "Not a forecast. Change it." },
      { key: "tax", label: "Property tax", value: `${pct(input.propertyTaxPct)} of value per year` },
      { key: "maint", label: "Maintenance", value: `${pct(input.maintenancePct)} of value per year` },
      { key: "selling", label: "Selling costs", value: `${pct(input.sellingCostPct)} of sale price` },
      { key: "invest", label: "Renter's alternative return", value: `${pct(input.investmentReturnPct)} per year on the down payment and buying costs` },
      { key: "taxes", label: "Income-tax effects", value: "Ignored", note: "Mortgage-interest deductibility varies. Excluded on purpose." },
      { key: "rates", label: "Rates", value: "User-entered" },
    ],
  };
}

/* ─── Affordability ─────────────────────────────────────────── */

export type AffordabilityInput = {
  annualIncome: number;
  /** Monthly minimum debt payments (cards, auto, student). */
  monthlyDebts: number;
  downPayment: number;
  rate: number;
  termMonths?: number;
  propertyTaxPct?: number;
  insuranceAnnual?: number;
  hoaMonthly?: number;
  /** Front-end (housing) DTI ceiling, %. */
  frontEndDtiPct?: number;
  /** Back-end (total) DTI ceiling, %. */
  backEndDtiPct?: number;
};

export type AffordabilityResult = {
  monthlyIncome: number;
  /** Conservative all-in housing payment (lower of the two DTI tests at the conservative ceilings). */
  conservativePayment: number;
  /** Upper all-in housing payment (at the stated ceilings). */
  upperPayment: number;
  /** Corresponding home-price range at the entered rate and down payment. */
  conservativePrice: number;
  upperPrice: number;
  assumptions: Assumption[];
};

/**
 * Solves for home price given an all-in monthly budget:
 *   budget = PI(price - down) + price*tax/12 + ins/12 + hoa
 */
function priceForBudget(
  budget: number,
  down: number,
  rate: number,
  term: number,
  taxPct: number,
  insuranceAnnual: number,
  hoa: number
): number {
  const fixed = insuranceAnnual / 12 + hoa;
  const available = budget - fixed;
  if (available <= 0) return 0;
  const piPerDollar = monthlyPI(1, rate, term);
  const taxPerDollar = taxPct / 100 / 12;
  // available = piPerDollar*(price - down) + taxPerDollar*price
  const price = (available + piPerDollar * down) / (piPerDollar + taxPerDollar);
  return Math.max(0, price);
}

export function affordability(input: AffordabilityInput): AffordabilityResult {
  const term = input.termMonths ?? 360;
  const taxPct = input.propertyTaxPct ?? 1.0;
  const ins = input.insuranceAnnual ?? 1500;
  const hoa = input.hoaMonthly ?? 0;
  const front = input.frontEndDtiPct ?? 28;
  const back = input.backEndDtiPct ?? 36;
  const monthlyIncome = input.annualIncome / 12;

  const frontCap = monthlyIncome * (front / 100);
  const backCap = monthlyIncome * (back / 100) - input.monthlyDebts;
  const conservativePayment = Math.max(0, Math.min(frontCap, backCap));
  // Upper bound: the common 43% total-DTI guideline, housing-only test relaxed to 31%.
  const upperPayment = Math.max(
    conservativePayment,
    Math.max(0, Math.min(monthlyIncome * 0.31, monthlyIncome * 0.43 - input.monthlyDebts))
  );

  return {
    monthlyIncome,
    conservativePayment,
    upperPayment,
    conservativePrice: priceForBudget(conservativePayment, input.downPayment, input.rate, term, taxPct, ins, hoa),
    upperPrice: priceForBudget(upperPayment, input.downPayment, input.rate, term, taxPct, ins, hoa),
    assumptions: [
      { key: "front", label: "Housing ratio (conservative)", value: pct(front), note: "Housing payment ÷ gross monthly income." },
      { key: "back", label: "Total debt ratio (conservative)", value: pct(back) },
      { key: "upper", label: "Upper range", value: "31% housing / 43% total", note: "A common qualifying guideline. Programs differ." },
      { key: "tax", label: "Property tax", value: `${pct(taxPct)} of price per year` },
      { key: "ins", label: "Insurance", value: `${money(ins)} per year` },
      { key: "hoa", label: "HOA", value: `${money(hoa)} per month` },
      { key: "mi", label: "Mortgage insurance", value: "Excluded", note: "Applies under 20% down on many programs and lowers the range." },
      { key: "credit", label: "Credit, reserves, program limits", value: "Not modeled" },
      { key: "rates", label: "Rates", value: "User-entered" },
    ],
  };
}

/* ─── Second Look demo: points vs. credit toggle ────────────── */

export type PointsVsCreditInput = {
  loanAmount: number;
  /** Rate at zero points / zero credit. */
  parRate: number;
  /** Points paid, as % of loan (e.g. 1 = 1%). */
  pointsPct: number;
  /** Rate reduction bought by those points, in percentage points. */
  rateReductionForPoints: number;
  /** Lender credit received, as % of loan. */
  creditPct: number;
  /** Rate increase accepted for that credit, in percentage points. */
  rateIncreaseForCredit: number;
  termMonths?: number;
};

export type PointsVsCreditResult = {
  points: { rate: number; payment: number; upfront: number };
  credit: { rate: number; payment: number; upfront: number };
  /** Months for the points option's payment savings to repay (points cost + forgone credit). */
  breakevenMonth: number;
  monthlyDifference: number;
  assumptions: Assumption[];
};

export function pointsVsCredit(input: PointsVsCreditInput): PointsVsCreditResult {
  const term = input.termMonths ?? 360;
  const pointsRate = input.parRate - input.rateReductionForPoints;
  const creditRate = input.parRate + input.rateIncreaseForCredit;
  const pointsUpfront = input.loanAmount * (input.pointsPct / 100);
  const creditUpfront = -input.loanAmount * (input.creditPct / 100);
  const pointsPayment = monthlyPI(input.loanAmount, pointsRate, term);
  const creditPayment = monthlyPI(input.loanAmount, creditRate, term);
  const monthlyDifference = creditPayment - pointsPayment;
  const upfrontGap = pointsUpfront - creditUpfront;
  const breakevenMonth = monthlyDifference > 0 ? Math.ceil(upfrontGap / monthlyDifference) : Infinity;
  return {
    points: { rate: pointsRate, payment: pointsPayment, upfront: pointsUpfront },
    credit: { rate: creditRate, payment: creditPayment, upfront: creditUpfront },
    breakevenMonth,
    monthlyDifference,
    assumptions: [
      { key: "sample", label: "Figures", value: "Sample — illustrative only, not an offer." },
      { key: "term", label: "Term", value: `${term} months` },
      { key: "basis", label: "Basis", value: "Principal & interest only" },
    ],
  };
}

/* ─── Shared helpers ────────────────────────────────────────── */

export function clampNumber(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}
