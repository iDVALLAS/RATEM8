/**
 * lib/pricing/loansifter.ts — turns a "Send to LoanM8" capture
 * (loansifterBookmarklet.ts) into lender rate grids for the rate rule
 * (compRule.ts).
 *
 * SERVER-ONLY: maps LoanSifter investor names to the panel's lender keys.
 *
 * Rules, with the evidence from the owner's 2026-11-06 capture:
 *  - Investor names carry a channel suffix ("Non-Delegated", "Wholesale",
 *    "Mini-Correspondent"); the lender is the name without it.
 *  - Wholesale prices are shown net of the lender-paid LO comp in the
 *    "LO Comp" column. NexBank at 6.750%: Wholesale 97.670 with 2.250% comp,
 *    Non-Delegated 99.920, and 97.670 + 2.250 = 99.920. So the borrower-paid
 *    price is the shown price plus that comp, and the owner's rule then sets
 *    the compensation (1.7%) the same way for every channel.
 *  - Non-conforming products (jumbo, portfolio, non-QM and the like) are left
 *    out: the daily scenarios are conforming loans.
 *  - A product whose rate grid was not opened is skipped: its one headline
 *    rate can't show the lowest rate inside the points cap.
 */
import { z } from "zod";
import type { GridRow, LenderProduct } from "./compRule";
import type { BandedScenario } from "./types";
import { noteAmount } from "./mi";

const n = z.number().finite().nullable();
const CaptureSchema = z.object({
  kind: z.literal("loansifter-capture"),
  v: z.literal(1),
  capturedAt: z.string(),
  searchedAt: z.string().max(200).optional(),
  /** C11: LoanSifter's "Search Results - …" time, read by the browser in its own time zone. */
  searchedAtIso: z.string().max(40).optional(),
  /** C11: LoanSifter's saved-scenario id, when run from the Scenarios page. */
  scenarioId: z.string().max(40).optional(),
  scenarioName: z.string().max(300).optional(),
  summary: z.object({
    loanType: z.string().max(60),
    lienType: z.string().max(60).optional(),
    loanPurpose: z.string().max(60),
    totalLoanAmount: n,
    propertyValue: n,
    ltv: n.optional(),
    lockDays: n.optional(),
  }),
  products: z
    .array(
      z.object({
        investor: z.string().max(200),
        product: z.string().max(300),
        lockDays: n,
        headline: z.object({ rate: n, price: n }),
        lenderFees: n,
        compPct: n,
        grid: z.array(z.object({ rate: z.number().finite(), price: z.number().finite(), lenderFees: n })).max(100),
      }),
    )
    .max(400),
});
export type LoanSifterCapture = z.infer<typeof CaptureSchema>;

/** Panel lender keys by investor name (channel suffix removed). Order matters: first match wins. */
const INVESTORS: [RegExp, string][] = [
  [/\bunited wholesale\b|\buwm\b/, "uwm"],
  [/\brocket\b/, "rocket-pro"],
  [/\bkind lending\b/, "kind"],
  // Owner 2026-11-07: LoanSifter lists The Loan Store as "Averra".
  [/\bthe loan store\b|\bloan store\b|\baverra\b/, "the-loan-store"],
  [/\bprmg\b|\bparamount residential\b/, "prmg"],
  [/\bpennymac\b/, "pennymac"],
  [/\bfreedom mortgage\b/, "freedom"],
  [/\bremn\b/, "remn"],
  [/\brise\b/, "rise"],
  [/\bnewrez\b/, "newrez"],
  [/\bnations direct\b/, "nations-direct"],
];

const CHANNEL = /\s+(non-delegated|delegated|wholesale|mini-correspondent|correspondent|tpo)\s*$/i;

/** Products that don't belong in a conforming daily scenario. */
const OFF_SCENARIO = /\b(jumbo|portfolio|non-?qm|alternative|bank statement|dscr|interest only|arm)\b/i;
/** Non-QM scenario: fully amortizing 30-year fixed on bank statements only. */
const OFF_NON_QM = /\b(interest only|io|arm|dscr|investor|40 ?(?:yr|year))\b/i;

export function investorKey(investor: string): string | null {
  const base = investor.trim().replace(CHANNEL, "").toLowerCase();
  return INVESTORS.find(([re]) => re.test(base))?.[1] ?? null;
}

export function channelOf(investor: string): string {
  return investor.trim().match(CHANNEL)?.[1] ?? "";
}

export type ParseResult =
  | { ok: true; capture: LoanSifterCapture }
  | { ok: false; errors: string[] };

export function parseCapture(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    return { ok: false, errors: ["That isn't the text from the Send to LoanM8 button. Run it on a LoanSifter results page, press Copy, and paste here."] };
  }
  const r = CaptureSchema.safeParse(raw);
  if (!r.success) return { ok: false, errors: ["The pasted capture is incomplete or from a different version of the button. Run it again and paste the new text."] };
  if (Number.isNaN(Date.parse(r.data.capturedAt))) return { ok: false, errors: ["The capture has no valid time."] };
  return { ok: true, capture: r.data };
}

/** Does this capture describe this scenario? Returns the problems, empty when it matches. */
export function scenarioMismatch(c: LoanSifterCapture, s: BandedScenario): string[] {
  const out: string[] = [];
  const amt = c.summary.totalLoanAmount ?? 0;
  if (Math.abs(amt - s.loanAmount) > 1 && Math.abs(amt - noteAmount(s)) > 1) out.push(`loan amount $${amt.toLocaleString("en-US")} (scenario: $${s.loanAmount.toLocaleString("en-US")})`);
  if (Math.abs((c.summary.propertyValue ?? 0) - s.propertyValue) > 1) out.push(`value $${(c.summary.propertyValue ?? 0).toLocaleString("en-US")} (scenario: $${s.propertyValue.toLocaleString("en-US")})`);
  const purpose = c.summary.loanPurpose.toLowerCase();
  const kind = purpose.includes("purchase") ? "purchase" : /cash/.test(purpose) ? "cash_out_refi" : "rate_term_refi";
  if (kind !== s.purpose) out.push(`purpose ${c.summary.loanPurpose}`);
  const program = s.program ?? "conventional";
  // Non-QM searches are told apart by amount and value; LoanSifter's loan type label for them varies.
  if (program !== "non_qm" && !c.summary.loanType.toLowerCase().includes(program === "fha" ? "fha" : "conventional")) out.push(`loan type ${c.summary.loanType}`);
  return out;
}

/** The first scenario this capture matches, or null. */
export function matchScenario(c: LoanSifterCapture, scenarios: BandedScenario[]): BandedScenario | null {
  return scenarios.find((s) => scenarioMismatch(c, s).length === 0) ?? null;
}

export type Skipped = { investor: string; product: string; reason: string };

/**
 * Rate grids per panel lender product, borrower-paid prices. `allow` decides
 * which lender keys may be used (active, showable, first mortgage) and gives
 * the reason when not.
 */
export function productsFromCapture(c: LoanSifterCapture, allow: (key: string) => string | null, program: BandedScenario["program"] = "conventional"): { products: LenderProduct[]; skipped: Skipped[]; withoutGrid: number } {
  const products: LenderProduct[] = [];
  const skipped: Skipped[] = [];
  let withoutGrid = 0;
  for (const p of c.products) {
    const key = investorKey(p.investor);
    const skip = (reason: string) => skipped.push({ investor: p.investor, product: p.product, reason });
    if (!key) { skip("not on your lender panel"); continue; }
    const blocked = allow(key);
    if (blocked) { skip(blocked); continue; }
    if (program === "non_qm") {
      if (OFF_NON_QM.test(p.product)) { skip("not a fully amortizing bank-statement product"); continue; }
    } else if (OFF_SCENARIO.test(p.product)) { skip("not a conforming product for this scenario"); continue; }
    const comp = p.compPct && p.compPct > 0 ? p.compPct : 0;
    // One headline rate can't show the lowest rate inside the cap, so a
    // product counts only with its whole grid.
    if (!p.grid.length) { withoutGrid++; skip("rate grid wasn't opened"); continue; }
    const rows = p.grid;
    const grid: GridRow[] = rows.map((r) => ({ rate: r.rate, price: Math.round((r.price + comp) * 1000) / 1000 }));
    const fees = rows.find((r) => r.lenderFees !== null)?.lenderFees ?? p.lenderFees ?? 0;
    products.push({
      lenderKey: key,
      productLabel: `${p.product}${channelOf(p.investor) ? ` (${channelOf(p.investor)})` : ""}`,
      lenderFees: fees,
      lockDays: p.lockDays ?? c.summary.lockDays ?? 30,
      grid,
    });
  }
  return { products, skipped, withoutGrid };
}

/**
 * One line per reason, for the admin. Lender-level reasons list lenders;
 * product-level ones (non-conforming, grid not opened) name the product, so
 * "UWM" isn't read as skipped when only its jumbo product was.
 */
export function summarizeSkipped(skipped: Skipped[]): string[] {
  const byReason = new Map<string, Set<string>>();
  for (const s of skipped) {
    const productLevel = /product|grid|rate and price/.test(s.reason);
    const names = byReason.get(s.reason) ?? new Set<string>();
    names.add(productLevel ? `${s.investor} (${s.product})` : s.investor);
    byReason.set(s.reason, names);
  }
  return [...byReason].map(([reason, names]) => `Skipped (${reason}): ${[...names].join(", ")}.`);
}
