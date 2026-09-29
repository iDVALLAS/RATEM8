/**
 * GET /api/agent/openapi.json — OpenAPI 3.1 for the agent API.
 *
 * Hand-built object (no generator dependency). Servers come from
 * CONFIG.siteUrl; the disclaimer, states, and consent list come from the
 * same helpers the live responses use, so the document describes what
 * the API actually returns.
 */

import { CONFIG, LICENSED_IN_LINE } from "@/lib/config";
import { absoluteUrl } from "@/lib/site";
import {
  envelope,
  json,
  optionsResponse,
  disabledResponse,
  methodNotAllowed,
  withAgentRoute,
  AGENT_API_VERSION,
  AGENT_DISCLAIMER,
  HUMAN_CONSENT_ITEMS,
  HUMAN_CONSENT_MESSAGE,
  RATE_LIMIT,
} from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/agent/openapi.json";

type Schema = Record<string, unknown>;

const number = (description: string, extra: Schema = {}): Schema => ({ type: "number", description, ...extra });
const rate = (description: string): Schema => number(`${description} Annual percentage the caller enters (6.5 = 6.5%). Clamped to 0–25.`, { minimum: 0, maximum: 25 });
const amount = (description: string): Schema => number(`${description} US dollars. Clamped to 0–50,000,000.`, { minimum: 0, maximum: 50_000_000 });
const term = (description: string): Schema => number(`${description} Months. Clamped to 1–480.`, { minimum: 1, maximum: 480 });
const pct = (description: string): Schema => number(`${description} Percent. Clamped to 0–100.`, { minimum: 0, maximum: 100 });

function buildSpec(): Schema {
  const envelopeProps: Schema = {
    disclaimer: { type: "string", const: AGENT_DISCLAIMER },
    as_of: { type: "string", format: "date-time", description: "When this response was generated (UTC)." },
    licensed_states: {
      type: "array",
      description: `Where ${CONFIG.brandName} is licensed: ${LICENSED_IN_LINE}.`,
      items: { $ref: "#/components/schemas/LicensedState" },
    },
    requires_human_consent_for: {
      type: "array",
      description: HUMAN_CONSENT_MESSAGE,
      items: { type: "string", enum: [...HUMAN_CONSENT_ITEMS] },
    },
    version: { type: "string", const: AGENT_API_VERSION },
  };

  const envelopeRequired = ["disclaimer", "as_of", "licensed_states", "requires_human_consent_for", "version"];

  const withEnvelope = (props: Schema, required: string[]): Schema => ({
    type: "object",
    properties: { ...props, ...envelopeProps },
    required: [...required, ...envelopeRequired],
  });

  const errorResponse = (description: string, extra: Schema = {}): Schema => ({
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { error: { type: "string" }, message: { type: "string" }, ...extra },
          required: ["error", "message"],
        },
      },
    },
  });

  const commonErrors: Schema = {
    "429": {
      description: `Rate limited. ${RATE_LIMIT.capacity} requests per ${RATE_LIMIT.windowMs / 60_000} minutes per client IP. Honor Retry-After.`,
      headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait." } },
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { error: { type: "string", const: "rate_limited" }, message: { type: "string" }, retry_after_seconds: { type: "integer" } },
            required: ["error", "message", "retry_after_seconds"],
          },
        },
      },
    },
    "503": errorResponse("The agent API is disabled by feature flag. Read the human page at /ai instead."),
  };

  const agentOriginParam = { $ref: "#/components/parameters/AgentOrigin" };

  const calcInputs: Record<string, Schema> = {
    PointsBreakevenInput: {
      type: "object",
      required: ["loanAmount", "rateWithoutPoints", "rateWithPoints", "pointsCost"],
      properties: {
        loanAmount: amount("Loan amount."),
        rateWithoutPoints: rate("Rate offered with no points."),
        rateWithPoints: rate("Rate offered after paying points."),
        pointsCost: amount("Dollar cost of the points."),
        termMonths: term("Loan term. Default 360."),
        chartMonths: term("How many months to chart. Default 120."),
      },
    },
    RefiBreakevenInput: {
      type: "object",
      required: ["currentBalance", "currentRate", "currentRemainingTermMonths", "newRate", "newTermMonths", "closingCosts"],
      properties: {
        currentBalance: amount("Current loan balance."),
        currentRate: rate("Current rate."),
        currentRemainingTermMonths: term("Months left on the current loan."),
        newRate: rate("Rate on the proposed new loan."),
        newTermMonths: term("Term of the proposed new loan."),
        closingCosts: amount("Closing costs, paid in cash (not rolled in)."),
      },
    },
    RentVsBuyInput: {
      type: "object",
      required: [
        "monthlyRent", "rentIncreasePct", "homePrice", "downPaymentPct", "rate", "propertyTaxPct", "insuranceAnnual",
        "maintenancePct", "hoaMonthly", "appreciationPct", "sellingCostPct", "buyingCosts", "horizonYears", "investmentReturnPct",
      ],
      properties: {
        monthlyRent: amount("Current monthly rent."),
        rentIncreasePct: pct("Annual rent increase."),
        homePrice: amount("Purchase price."),
        downPaymentPct: pct("Down payment as % of price."),
        rate: rate("Mortgage rate."),
        termMonths: term("Loan term. Default 360."),
        propertyTaxPct: pct("Annual property tax as % of value."),
        insuranceAnnual: amount("Annual homeowners insurance."),
        maintenancePct: pct("Annual maintenance as % of value."),
        hoaMonthly: amount("Monthly HOA dues."),
        appreciationPct: pct("Annual home appreciation. Not a forecast."),
        sellingCostPct: pct("Cost to sell as % of sale price."),
        buyingCosts: amount("Closing costs to buy."),
        horizonYears: number("How many years to model. Clamped to 1–40.", { minimum: 1, maximum: 40 }),
        investmentReturnPct: pct("Annual return the renter earns on the unspent down payment and buying costs."),
      },
    },
    AffordabilityInput: {
      type: "object",
      required: ["annualIncome", "monthlyDebts", "downPayment", "rate"],
      properties: {
        annualIncome: amount("Gross annual income."),
        monthlyDebts: amount("Monthly minimum debt payments."),
        downPayment: amount("Cash down payment."),
        rate: rate("Mortgage rate."),
        termMonths: term("Loan term. Default 360."),
        propertyTaxPct: pct("Annual property tax as % of price. Default 1."),
        insuranceAnnual: amount("Annual homeowners insurance. Default 1500."),
        hoaMonthly: amount("Monthly HOA dues. Default 0."),
        frontEndDtiPct: pct("Housing-ratio ceiling. Default 28."),
        backEndDtiPct: pct("Total-debt-ratio ceiling. Default 36."),
      },
    },
  };

  const breakeven = (description: string): Schema => ({ type: ["integer", "null"], description: `${description} null means never.` });

  const calcResults: Record<string, Schema> = {
    PointsBreakevenResult: {
      type: "object",
      properties: {
        paymentWithoutPoints: number("Monthly principal & interest without points."),
        paymentWithPoints: number("Monthly principal & interest with points."),
        monthlySavings: number("Difference per month."),
        breakevenMonth: breakeven("First month where cumulative savings cover the points cost."),
        chart: { type: "array", items: { type: "object", properties: { month: { type: "integer" }, cumulativeSavings: { type: "number" }, pointsCost: { type: "number" } } } },
      },
    },
    RefiBreakevenResult: {
      type: "object",
      properties: {
        currentPayment: number("Current monthly principal & interest."),
        newPayment: number("New monthly principal & interest."),
        monthlyChange: number("newPayment − currentPayment (negative = lower)."),
        breakevenMonth: breakeven("Months until closing costs are recovered from payment savings."),
        currentTotalInterest: number("Remaining interest on the current loan."),
        newTotalInterest: number("Total interest on the new loan."),
        totalInterestDelta: number("newTotalInterest + closingCosts − currentTotalInterest (negative = you pay less overall)."),
      },
    },
    RentVsBuyResult: {
      type: "object",
      properties: {
        rentNetCost: number("Total rent minus investment growth on the unspent down payment."),
        buyNetCost: number("Total ownership outlay minus equity at sale."),
        totalRentPaid: number("Total rent over the horizon."),
        totalOwnershipOutlay: number("All cash out to own over the horizon."),
        equityAtSale: number("Home value minus balance minus selling costs at the horizon."),
        homeValueAtHorizon: number("Modeled home value at the horizon."),
        breakevenYear: { type: ["integer", "null"], description: "First year buying nets cheaper than renting. null = not within the horizon." },
        yearly: { type: "array", items: { type: "object", properties: { year: { type: "integer" }, rentNet: { type: "number" }, buyNet: { type: "number" } } } },
      },
    },
    AffordabilityResult: {
      type: "object",
      properties: {
        monthlyIncome: number("Gross monthly income."),
        conservativePayment: number("All-in housing payment at the conservative ratios."),
        upperPayment: number("All-in housing payment at the upper ratios."),
        conservativePrice: number("Home price at the conservative payment, entered rate, and down payment."),
        upperPrice: number("Home price at the upper payment."),
      },
    },
  };

  const calcResponse = (tool: string, input: string, result: string): Schema =>
    withEnvelope(
      {
        tool: { type: "string", const: tool },
        inputs: { $ref: `#/components/schemas/${input}`, description: "The inputs actually used, after clamping." },
        result: { $ref: `#/components/schemas/${result}` },
        assumptions: { type: "array", items: { $ref: "#/components/schemas/Assumption" } },
        clamped: { type: "array", items: { type: "string" }, description: "Fields that were clamped into range. Empty when none." },
      },
      ["tool", "inputs", "result", "assumptions", "clamped"]
    );

  return {
    openapi: "3.1.0",
    info: {
      title: `${CONFIG.brandName} agent API`,
      version: AGENT_API_VERSION,
      summary: "Deterministic mortgage math, licensing facts, and hand-off links for AI assistants acting for a borrower.",
      description: [
        `Public, read-only, no authentication. Rate limit: ${RATE_LIMIT.capacity} requests per ${RATE_LIMIT.windowMs / 60_000} minutes per client IP (429 with Retry-After).`,
        `Send an X-Agent-Origin header naming your assistant or product; it is the only request header we log, truncated to 64 characters. Request bodies are never logged.`,
        `This API never returns a rate, price, or quote. Calculators use only the rate the caller sends. ${CONFIG.brandName} does not display rates while live pricing is disabled.`,
        HUMAN_CONSENT_MESSAGE,
        `Disclaimer on every response: ${AGENT_DISCLAIMER}`,
        `Human-readable companion: ${absoluteUrl("/ai")} (Markdown: ${absoluteUrl("/ai.md")}).`,
      ].join("\n\n"),
      contact: { url: absoluteUrl("/ai") },
      "x-disclaimer": AGENT_DISCLAIMER,
      "x-rate-limit": { requests: RATE_LIMIT.capacity, window_seconds: RATE_LIMIT.windowMs / 1000, key: "client IP" },
    },
    servers: [{ url: CONFIG.siteUrl.replace(/\/$/, ""), description: "Production" }],
    tags: [
      { name: "calc", description: "Deterministic calculators. Same math as the pages under /calculators." },
      { name: "facts", description: "Config-driven facts: licensing and hand-off links." },
    ],
    paths: {
      "/api/agent/calc/{tool}": {
        post: {
          tags: ["calc"],
          operationId: "calculate",
          summary: "Run one of four deterministic calculators.",
          description: "Pick the request schema by `tool`. Every response includes the assumptions the math used and the fields that were clamped into range.",
          parameters: [
            {
              name: "tool",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["points-breakeven", "refi-breakeven", "rent-vs-buy", "affordability"] },
            },
            agentOriginParam,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/PointsBreakevenInput" },
                    { $ref: "#/components/schemas/RefiBreakevenInput" },
                    { $ref: "#/components/schemas/RentVsBuyInput" },
                    { $ref: "#/components/schemas/AffordabilityInput" },
                  ],
                },
                examples: {
                  "points-breakeven": { value: { loanAmount: 400000, rateWithoutPoints: 6.5, rateWithPoints: 6.25, pointsCost: 4000 } },
                  "refi-breakeven": { value: { currentBalance: 350000, currentRate: 7, currentRemainingTermMonths: 340, newRate: 6.25, newTermMonths: 360, closingCosts: 6000 } },
                  affordability: { value: { annualIncome: 120000, monthlyDebts: 500, downPayment: 60000, rate: 6.5 } },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Result, inputs used, assumptions, plus the standard envelope.",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      { $ref: "#/components/schemas/PointsBreakevenResponse" },
                      { $ref: "#/components/schemas/RefiBreakevenResponse" },
                      { $ref: "#/components/schemas/RentVsBuyResponse" },
                      { $ref: "#/components/schemas/AffordabilityResponse" },
                    ],
                  },
                },
              },
            },
            "400": errorResponse("Invalid JSON or invalid fields.", {
              fields: { type: "array", items: { type: "object", properties: { field: { type: "string" }, message: { type: "string" } } } },
            }),
            "404": errorResponse("Unknown tool.", { tools: { type: "array", items: { type: "string" } } }),
            "405": errorResponse("Use POST."),
            ...commonErrors,
          },
        },
      },
      "/api/agent/states": {
        get: {
          tags: ["facts"],
          operationId: "listStates",
          summary: "Licensed states, service areas, license identifiers, regulator links.",
          description: "Values in [brackets] are not yet published. Do not fill them in from another source.",
          parameters: [agentOriginParam],
          responses: {
            "200": { description: "States from config.", content: { "application/json": { schema: { $ref: "#/components/schemas/StatesResponse" } } } },
            ...commonErrors,
          },
        },
      },
      "/api/agent/handoff": {
        get: {
          tags: ["facts"],
          operationId: "getHandoffLinks",
          summary: "Where to send a borrower who wants a human.",
          description: HUMAN_CONSENT_MESSAGE,
          parameters: [agentOriginParam],
          responses: {
            "200": { description: "Booking and hand-off links.", content: { "application/json": { schema: { $ref: "#/components/schemas/HandoffResponse" } } } },
            ...commonErrors,
          },
        },
      },
      "/api/agent/openapi.json": {
        get: {
          tags: ["facts"],
          operationId: "getOpenApi",
          summary: "This document.",
          parameters: [agentOriginParam],
          responses: { "200": { description: "OpenAPI 3.1 document.", content: { "application/json": { schema: { type: "object" } } } }, ...commonErrors },
        },
      },
    },
    components: {
      parameters: {
        AgentOrigin: {
          name: "X-Agent-Origin",
          in: "header",
          required: false,
          description: "Name of the calling assistant or product (e.g. the product name plus version). Logged, truncated to 64 characters, used only as an analytics dimension.",
          schema: { type: "string", maxLength: 64 },
        },
      },
      schemas: {
        LicensedState: {
          type: "object",
          properties: { code: { type: "string" }, name: { type: "string" }, serviceArea: { type: "string" } },
          required: ["code", "name", "serviceArea"],
        },
        Assumption: {
          type: "object",
          properties: { key: { type: "string" }, label: { type: "string" }, value: { type: "string" }, note: { type: "string" } },
          required: ["key", "label", "value"],
        },
        Envelope: { type: "object", description: "Fields present on every 2xx response.", properties: envelopeProps, required: envelopeRequired },
        ...calcInputs,
        ...calcResults,
        PointsBreakevenResponse: calcResponse("points-breakeven", "PointsBreakevenInput", "PointsBreakevenResult"),
        RefiBreakevenResponse: calcResponse("refi-breakeven", "RefiBreakevenInput", "RefiBreakevenResult"),
        RentVsBuyResponse: calcResponse("rent-vs-buy", "RentVsBuyInput", "RentVsBuyResult"),
        AffordabilityResponse: calcResponse("affordability", "AffordabilityInput", "AffordabilityResult"),
        State: {
          type: "object",
          properties: {
            slug: { type: "string" },
            code: { type: "string" },
            name: { type: "string" },
            serviceArea: { type: "string" },
            entityLicense: { type: "string", description: "May be a [bracketed] placeholder pre-launch." },
            mloLicense: { type: "string", description: "May be a [bracketed] placeholder pre-launch." },
            regulator: { type: "object", properties: { name: { type: "string" }, url: { type: "string" } }, required: ["name", "url"] },
            page: { type: "string", format: "uri" },
          },
          required: ["slug", "code", "name", "serviceArea", "entityLicense", "mloLicense", "regulator", "page"],
        },
        StatesResponse: withEnvelope(
          {
            states: { type: "array", items: { $ref: "#/components/schemas/State" } },
            disclosures: { type: "string", format: "uri" },
            note: { type: "string" },
          },
          ["states", "disclosures", "note"]
        ),
        HandoffResponse: withEnvelope(
          {
            booking: {
              type: "object",
              description: "Calendly links. null when not configured; never a dead URL.",
              properties: {
                borrower: { type: ["string", "null"], format: "uri" },
                agent: { type: ["string", "null"], format: "uri" },
                mlo: { type: ["string", "null"], format: "uri" },
                secondLook: { type: ["string", "null"], format: "uri" },
              },
              required: ["borrower", "agent", "mlo", "secondLook"],
            },
            second_look: { type: "string", format: "uri" },
            chat: { type: "string", format: "uri" },
            ai_page: { type: "string", format: "uri" },
            message: { type: "string", const: HUMAN_CONSENT_MESSAGE },
            not_a_credit_pull: { type: "string" },
          },
          ["booking", "second_look", "chat", "ai_page", "message", "not_a_credit_pull"]
        ),
      },
    },
    "x-example-envelope": envelope({ example: true }),
  };
}

export async function GET(req: Request): Promise<Response> {
  if (!CONFIG.featureFlags.agentApi) return disabledResponse();
  return withAgentRoute(req, ROUTE, () => json(buildSpec()));
}

export function POST(): Response {
  return methodNotAllowed(["GET"]);
}

export function OPTIONS(): Response {
  return optionsResponse();
}
