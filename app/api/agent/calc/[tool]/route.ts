/**
 * POST /api/agent/calc/{tool}
 *
 * tool ∈ points-breakeven | refi-breakeven | rent-vs-buy | affordability
 *
 * Deterministic. Validates the JSON body with zod, clamps every number
 * into a sane range (and says which fields it clamped), calls lib/calc.ts,
 * and returns `{ tool, inputs, result, assumptions }` inside the standard
 * envelope. Rates are the caller's own numbers; nothing here supplies,
 * suggests, or returns a rate the caller did not send.
 *
 *  400 — bad input, with per-field errors
 *  404 — unknown tool
 *  405 — GET
 *  429 — rate limited
 *  503 — agentApi flag off
 */

import { z } from "zod";
import { CONFIG } from "@/lib/config";
import {
  pointsBreakeven,
  refinanceBreakeven,
  rentVsBuy,
  affordability,
  clampNumber,
  type Assumption,
} from "@/lib/calc";
import {
  envelope,
  json,
  optionsResponse,
  disabledResponse,
  methodNotAllowed,
  withAgentRoute,
  finiteOrNull,
} from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─── Ranges (mirrored in openapi.json) ─────────────────────── */

const RANGES = {
  rate: { min: 0, max: 25 },
  amount: { min: 0, max: 50_000_000 },
  term: { min: 1, max: 480 },
  pct: { min: 0, max: 100 },
  years: { min: 1, max: 40 },
} as const;

type RangeKey = keyof typeof RANGES;

const num = z.number().finite();
const optNum = num.optional();

const SCHEMAS = {
  "points-breakeven": z.object({
    loanAmount: num,
    rateWithoutPoints: num,
    rateWithPoints: num,
    pointsCost: num,
    termMonths: optNum,
    chartMonths: optNum,
  }),
  "refi-breakeven": z.object({
    currentBalance: num,
    currentRate: num,
    currentRemainingTermMonths: num,
    newRate: num,
    newTermMonths: num,
    closingCosts: num,
  }),
  "rent-vs-buy": z.object({
    monthlyRent: num,
    rentIncreasePct: num,
    homePrice: num,
    downPaymentPct: num,
    rate: num,
    termMonths: optNum,
    propertyTaxPct: num,
    insuranceAnnual: num,
    maintenancePct: num,
    hoaMonthly: num,
    appreciationPct: num,
    sellingCostPct: num,
    buyingCosts: num,
    horizonYears: num,
    investmentReturnPct: num,
  }),
  affordability: z.object({
    annualIncome: num,
    monthlyDebts: num,
    downPayment: num,
    rate: num,
    termMonths: optNum,
    propertyTaxPct: optNum,
    insuranceAnnual: optNum,
    hoaMonthly: optNum,
    frontEndDtiPct: optNum,
    backEndDtiPct: optNum,
  }),
};

type Tool = keyof typeof SCHEMAS;
const TOOLS = Object.keys(SCHEMAS) as Tool[];

/** Which range each field is clamped to. */
const FIELD_RANGES: Record<Tool, Record<string, RangeKey>> = {
  "points-breakeven": {
    loanAmount: "amount",
    rateWithoutPoints: "rate",
    rateWithPoints: "rate",
    pointsCost: "amount",
    termMonths: "term",
    chartMonths: "term",
  },
  "refi-breakeven": {
    currentBalance: "amount",
    currentRate: "rate",
    currentRemainingTermMonths: "term",
    newRate: "rate",
    newTermMonths: "term",
    closingCosts: "amount",
  },
  "rent-vs-buy": {
    monthlyRent: "amount",
    rentIncreasePct: "pct",
    homePrice: "amount",
    downPaymentPct: "pct",
    rate: "rate",
    termMonths: "term",
    propertyTaxPct: "pct",
    insuranceAnnual: "amount",
    maintenancePct: "pct",
    hoaMonthly: "amount",
    appreciationPct: "pct",
    sellingCostPct: "pct",
    buyingCosts: "amount",
    horizonYears: "years",
    investmentReturnPct: "pct",
  },
  affordability: {
    annualIncome: "amount",
    monthlyDebts: "amount",
    downPayment: "amount",
    rate: "rate",
    termMonths: "term",
    propertyTaxPct: "pct",
    insuranceAnnual: "amount",
    hoaMonthly: "amount",
    frontEndDtiPct: "pct",
    backEndDtiPct: "pct",
  },
};

function isTool(t: string): t is Tool {
  return Object.prototype.hasOwnProperty.call(SCHEMAS, t);
}

/** Clamp every present numeric field into its range; report what moved. */
function clampInputs<T extends Record<string, number | undefined>>(tool: Tool, input: T): { inputs: T; clamped: string[] } {
  const clamped: string[] = [];
  const out: Record<string, number | undefined> = { ...input };
  for (const [field, rangeKey] of Object.entries(FIELD_RANGES[tool])) {
    const v = out[field];
    if (v === undefined) continue;
    const r = RANGES[rangeKey];
    const c = clampNumber(v, r.min, r.max, r.min);
    if (c !== v) {
      clamped.push(field);
      out[field] = c;
    }
  }
  return { inputs: out as T, clamped };
}

type CalcOutput = { result: Record<string, unknown>; assumptions: Assumption[] };

function run(tool: Tool, inputs: Record<string, number | undefined>): CalcOutput {
  switch (tool) {
    case "points-breakeven": {
      const { assumptions, breakevenMonth, ...rest } = pointsBreakeven(inputs as Parameters<typeof pointsBreakeven>[0]);
      return { result: { ...rest, breakevenMonth: finiteOrNull(breakevenMonth) }, assumptions };
    }
    case "refi-breakeven": {
      const { assumptions, breakevenMonth, ...rest } = refinanceBreakeven(inputs as Parameters<typeof refinanceBreakeven>[0]);
      return { result: { ...rest, breakevenMonth: finiteOrNull(breakevenMonth) }, assumptions };
    }
    case "rent-vs-buy": {
      const { assumptions, ...rest } = rentVsBuy(inputs as Parameters<typeof rentVsBuy>[0]);
      return { result: rest, assumptions };
    }
    case "affordability": {
      const { assumptions, ...rest } = affordability(inputs as Parameters<typeof affordability>[0]);
      return { result: rest, assumptions };
    }
  }
}

type Ctx = { params: Promise<{ tool: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  if (!CONFIG.featureFlags.agentApi) return disabledResponse();
  const { tool } = await ctx.params;
  const route = `/api/agent/calc/${isTool(tool) ? tool : "unknown"}`;

  return withAgentRoute(req, route, async () => {
    if (!isTool(tool)) {
      return json({ error: "unknown_tool", message: `Unknown tool "${tool.slice(0, 40)}".`, tools: TOOLS }, { status: 404 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: "invalid_json", message: "Body must be a JSON object." }, { status: 400 });
    }

    const parsed = SCHEMAS[tool].safeParse(raw);
    if (!parsed.success) {
      return json(
        {
          error: "invalid_input",
          message: "One or more fields are missing or not finite numbers.",
          fields: parsed.error.issues.map((i) => ({ field: i.path.map(String).join(".") || "(body)", message: i.message })),
        },
        { status: 400 }
      );
    }

    const { inputs, clamped } = clampInputs(tool, parsed.data as Record<string, number | undefined>);
    const { result, assumptions } = run(tool, inputs);

    const clampNote: Assumption[] = clamped.length
      ? [
          {
            key: "clamped",
            label: "Inputs adjusted",
            value: clamped.join(", "),
            note: `Out-of-range values were clamped to: rates ${RANGES.rate.min}–${RANGES.rate.max}%, amounts $${RANGES.amount.min}–$${RANGES.amount.max.toLocaleString("en-US")}, terms ${RANGES.term.min}–${RANGES.term.max} months, percentages ${RANGES.pct.min}–${RANGES.pct.max}%.`,
          },
        ]
      : [];

    return json(
      envelope({
        tool,
        inputs,
        result,
        assumptions: [...assumptions, ...clampNote],
        clamped,
      })
    );
  });
}

export function GET(): Response {
  return methodNotAllowed(["POST"]);
}

export function OPTIONS(): Response {
  return optionsResponse();
}
