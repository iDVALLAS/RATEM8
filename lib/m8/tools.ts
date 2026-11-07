/**
 * lib/m8/tools.ts — the only two tools M8 may call (C4). Every input and
 * every output is validated on the server with zod; a tool call that fails
 * validation gets an error result, never a guess.
 *
 *  - get_pricing: returns {status:"unavailable"} until live pricing exists
 *    (the L4b pricing robot). When it does, its quotes are the only rates
 *    the output guard lets through. C7: with PRICING_MANUAL on, a borrower
 *    scenario close to one of the daily scenarios (lib/pricing/daily.ts)
 *    gets that day's fresh snapshot as a dated example (kind
 *    "dated_example"): the three options, lenders by letter.
 *  - request_handoff: a contact request for the borrower's assigned loan
 *    officer. Saved in Neon when it's configured and emailed through Resend
 *    when that's configured; if neither is, it says so and M8 points the
 *    borrower to the "Talk to" button.
 */
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "@/lib/config";
import { redactChatInput } from "./redact";
import { saveHandoff } from "./store";
import { emailConfig } from "./server";
import { pctKey } from "./guard";
import { matchDaily } from "@/lib/pricing/daily";
import { manualProvider } from "@/lib/pricing/providers/manual";
import { tenantForState } from "@/lib/pricing/tenants";
import type { LenderQuote, PricingRun } from "@/lib/pricing/types";
import { quoteForPick } from "@/lib/pricing/antiSteering";
import type { PricingCard, PricingCardOption } from "./shared";

export const TOOL_NAMES = ["get_pricing", "request_handoff"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const PricingInput = z.object({
  purpose: z.enum(["purchase", "rate_term_refinance", "cash_out_refinance"]),
  loanAmount: z.number().positive().max(10_000_000),
  propertyValue: z.number().positive().max(20_000_000),
  creditBand: z.enum(["760+", "740-759", "720-739", "700-719", "680-699", "660-679", "640-659", "620-639", "below 620"]),
  zip: z.string().regex(/^\d{5}$/),
  propertyType: z.enum(["single_family", "condo", "townhome", "2-4_unit", "manufactured"]),
  occupancy: z.enum(["primary", "second_home", "investment"]),
  loanType: z.enum(["conventional", "fha", "va", "jumbo"]),
  lockDays: z.number().int().min(15).max(90).default(30),
});

const Quote = z.object({
  option: z.enum(["lowest_rate", "lowest_rate_no_risky_features", "lowest_points_and_fees"]),
  rate: z.number().min(0.5).max(20),
  apr: z.number().min(0.5).max(25),
  points: z.number(),
  lenderFees: z.number().nonnegative(),
  lockDays: z.number().int(),
  lender: z.string().regex(/^Lender [A-Z]{1,2}$/), // anonymized (Mode A)
  /** C7: principal and interest, and the first month's mortgage insurance when there is any. */
  monthlyPrincipalAndInterest: z.number().nonnegative().optional(),
  monthlyMortgageInsurance: z.number().nonnegative().nullable().optional(),
  hasRiskyFeature: z.boolean().optional(),
});

const PricingOutput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unavailable"), message: z.string() }),
  z.object({
    status: z.literal("ok"),
    /** C7: "dated_example" = today's snapshot of a standard scenario like theirs, never their own quote. */
    kind: z.enum(["live", "dated_example"]).optional(),
    scenario: z.string().optional(),
    pricedAt: z.string(),
    assumptions: z.record(z.string(), z.string()),
    quotes: z.array(Quote).min(1),
    instructions: z.string().optional(),
  }),
]);
export type PricingResult = z.infer<typeof PricingOutput>;

const HandoffInput = z.object({
  reason: z.enum(["pricing", "application", "preapproval", "lock", "complaint", "urgent", "question", "other"]),
  summary: z.string().min(2).max(1000),
  email: z.email().max(254).optional(),
});

const HandoffOutput = z.object({ status: z.enum(["sent", "saved", "unavailable"]), message: z.string() });

/** Anthropic tool definitions (JSON Schema mirrors of the zod inputs). */
export const M8_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "get_pricing",
    description:
      "Get live, cross-lender pricing for the borrower's scenario. The only source of rates you may quote. Returns status 'unavailable' while live pricing is not connected.",
    input_schema: {
      type: "object",
      properties: {
        purpose: { type: "string", enum: ["purchase", "rate_term_refinance", "cash_out_refinance"] },
        loanAmount: { type: "number" },
        propertyValue: { type: "number" },
        creditBand: { type: "string", enum: ["760+", "740-759", "720-739", "700-719", "680-699", "660-679", "640-659", "620-639", "below 620"] },
        zip: { type: "string", description: "5-digit ZIP of the property" },
        propertyType: { type: "string", enum: ["single_family", "condo", "townhome", "2-4_unit", "manufactured"] },
        occupancy: { type: "string", enum: ["primary", "second_home", "investment"] },
        loanType: { type: "string", enum: ["conventional", "fha", "va", "jumbo"] },
        lockDays: { type: "integer", description: "Lock period in days (default 30)" },
      },
      required: ["purpose", "loanAmount", "propertyValue", "creditBand", "zip", "propertyType", "occupancy", "loanType"],
    },
  },
  {
    name: "request_handoff",
    description:
      "Create a contact request for the borrower's assigned licensed loan officer. Use when they want pricing you can't give, an application, a pre-approval, a lock, to complain, anything urgent, or anything you're unsure about. Never include an SSN, date of birth or account number in the summary.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["pricing", "application", "preapproval", "lock", "complaint", "urgent", "question", "other"] },
        summary: { type: "string", description: "A short summary of what the borrower needs, in plain English." },
        email: { type: "string", description: "The borrower's email, only if they gave it for a reply." },
      },
      required: ["reason", "summary"],
    },
  },
];

export type ToolContext = {
  sessionId: string;
  mloId: string | null;
  mloName: string | null;
  state: string | null;
  /** C7: PRICING_MANUAL is on, so get_pricing may return a dated example. */
  examplesOn?: boolean;
};
export type ToolRun = { content: string; isError: boolean; pricing?: PricingResult; card?: PricingCard };

/** The rates and APRs in a pricing result, as guard keys. */
export function pricedRates(result: PricingResult | undefined): Set<string> {
  const s = new Set<string>();
  // Points as a percent too (a credit is negative; it's written without the sign).
  if (result?.status === "ok") for (const q of result.quotes) s.add(pctKey(q.rate)).add(pctKey(q.apr)).add(pctKey(Math.abs(q.points)));
  return s;
}

function err(message: string): ToolRun {
  return { content: JSON.stringify({ error: message }), isError: true };
}

const OPTION_KEYS = [
  ["lowest_rate", "lowestRate"],
  ["lowest_rate_no_risky_features", "lowestRateWithoutRiskyFeatures"],
  ["lowest_points_and_fees", "lowestPointsAndOrigination"],
] as const;

/** The three options of a run, for the tool result and the chat card. Null below three eligible lenders. */
export function exampleFromRun(run: PricingRun): { quotes: z.infer<typeof Quote>[]; card: PricingCard } | null {
  if (!run.selection.meetsCreditorCount) return null;
  const quotes: z.infer<typeof Quote>[] = [];
  const options: PricingCardOption[] = [];
  for (const [option, key] of OPTION_KEYS) {
    const pick = run.selection[key];
    const q: LenderQuote | undefined = quoteForPick(run.quotes, pick);
    if (!q || q.noteRate === null || q.apr === null || q.monthlyPayment === null) continue;
    quotes.push({
      option, rate: q.noteRate, apr: q.apr, points: q.pointsPct, lenderFees: q.lenderFees, lockDays: q.lockDays, lender: q.lender,
      monthlyPrincipalAndInterest: q.monthlyPayment, monthlyMortgageInsurance: q.monthlyMi, hasRiskyFeature: q.hasRiskyFeature,
    });
    options.push({
      option, lender: q.lender, rate: q.noteRate, apr: q.apr, pointsPct: q.pointsPct, pointsDollars: q.pointsDollars,
      originationFee: q.originationFee, lenderFees: q.lenderFees, lockDays: q.lockDays, payment: q.monthlyPayment,
      mortgageInsurance: q.monthlyMi, risky: q.hasRiskyFeature,
    });
  }
  if (!quotes.length) return null;
  const s = run.scenario;
  return {
    quotes,
    card: {
      title: s.title,
      location: s.location,
      pricedAt: run.pricedAt,
      assumptions: s.assumptions,
      eligibleCount: run.selection.eligibleCreditors,
      options,
    },
  };
}

async function datedExample(input: z.infer<typeof PricingInput>): Promise<ToolRun | null> {
  const scenario = matchDaily(input);
  if (!scenario) return null;
  const tenant = tenantForState(scenario.state);
  if (!tenant) return null;
  const run = await manualProvider.priceScenario(tenant.id, scenario).catch(() => null);
  if (!run) return null;
  const ex = exampleFromRun(run);
  if (!ex) return null;
  const s = run.scenario;
  const result = PricingOutput.parse({
    status: "ok",
    kind: "dated_example",
    scenario: `${s.title} · ${s.location}`,
    pricedAt: run.pricedAt,
    assumptions: Object.fromEntries(s.assumptions.map((a, i) => [String(i + 1), a])),
    quotes: ex.quotes,
    instructions:
      "This is today's priced example for a standard scenario close to the borrower's, not their quote. Write each rate, APR and points figure exactly as given here (no other percentages). Say that plainly, give the date and time it was priced (Pacific time), show each option's rate next to its APR, mention the key assumptions, and say it isn't a commitment to lend. The chat also shows these figures as a card. Their own pricing comes from their loan officer.",
  });
  return { content: JSON.stringify(result), isError: false, pricing: result, card: ex.card };
}

async function getPricing(input: unknown, ctx?: ToolContext): Promise<ToolRun> {
  const parsed = PricingInput.safeParse(input);
  if (!parsed.success) return err("Invalid scenario. Ask the borrower for the missing details, one at a time.");
  if (!CONFIG.liveRatesEnabled && ctx?.examplesOn) {
    const example = await datedExample(parsed.data);
    if (example) return example;
    const none = PricingOutput.parse({
      status: "unavailable",
      message: "No dated example matches this scenario today, and live pricing isn't connected. Offer to have the loan officer price their scenario and send it.",
    });
    return { content: JSON.stringify(none), isError: false, pricing: none };
  }
  // Live pricing (L4b) isn't connected: no rates exist to return.
  const result = PricingOutput.parse(
    CONFIG.liveRatesEnabled
      ? { status: "unavailable", message: "Live pricing is temporarily unavailable." }
      : { status: "unavailable", message: "Live pricing isn't connected yet. Offer to have the loan officer send live pricing." },
  );
  return { content: JSON.stringify(result), isError: false, pricing: result };
}

async function requestHandoff(input: unknown, ctx: ToolContext): Promise<ToolRun> {
  const parsed = HandoffInput.safeParse(input);
  if (!parsed.success) return err("Invalid handoff request: give a reason and a short summary.");
  const summary = redactChatInput(parsed.data.summary).text;
  const email = parsed.data.email ?? null;
  const saved = await saveHandoff({ sessionId: ctx.sessionId, mloId: ctx.mloId, state: ctx.state, reason: parsed.data.reason, summary, email });
  let sent = false;
  const cfg = emailConfig();
  if (cfg) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `M8 <${cfg.from}>`,
          to: [cfg.to],
          reply_to: email ?? undefined,
          subject: `M8 handoff (${parsed.data.reason})${ctx.mloName ? ` for ${ctx.mloName}` : ""}${ctx.state ? `, ${ctx.state}` : ""}`,
          text: `${summary}\n\nBorrower email: ${email ?? "not given"}\nState: ${ctx.state ?? "unknown"}\nChat session: ${ctx.sessionId}`,
        }),
      });
      sent = res.ok;
    } catch {
      sent = false;
    }
  }
  const out = HandoffOutput.parse(
    sent
      ? { status: "sent", message: "Sent to the loan officer. They'll reply by email if the borrower gave one; otherwise suggest the Talk to button to book a call." }
      : saved
        ? { status: "saved", message: "Saved for the loan officer. Suggest the Talk to button to book a call or send a question now." }
        : { status: "unavailable", message: "Handoffs can't be sent from the chat right now. Point the borrower to the Talk to button above the chat." },
  );
  return { content: JSON.stringify(out), isError: false };
}

/** Runs one tool call. Unknown tools are refused (only the two above are allowed). */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolRun> {
  if (name === "get_pricing") return getPricing(input, ctx);
  if (name === "request_handoff") return requestHandoff(input, ctx);
  return err(`Unknown tool ${name}.`);
}
