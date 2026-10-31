/**
 * GET /api/agent/rates — this week's approved pricing for AI assistants
 * (v37, L4). OFF unless AGENT_PRICING is "true" (counsel first). Only
 * what a licensed loan officer approved and /rates shows: the posted
 * rates and the six weekly scenarios, lenders anonymized. Never adjusted
 * to anyone's numbers; for that, POST /api/agent/quote.
 */
import { CONFIG, RATE_DISCLAIMER_BODY, RATE_DISCLAIMER_LEAD } from "@/lib/config";
import { disabledResponse, envelope, json, methodNotAllowed, optionsResponse, withAgentRoute } from "@/lib/agent-api";
import { weeklyForAgents } from "@/lib/quotes/public";
import { absoluteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/agent/rates";

export async function GET(req: Request): Promise<Response> {
  if (!CONFIG.featureFlags.agentApi || !CONFIG.featureFlags.agentPricing) return disabledResponse();
  return withAgentRoute(req, ROUTE, async () => {
    const { posted, grid } = await weeklyForAgents();
    return json(
      envelope({
        rate_disclaimer: `${RATE_DISCLAIMER_LEAD} ${RATE_DISCLAIMER_BODY}`,
        posted_rates: posted
          ? {
              week_of: posted.weekOf,
              honor_until: posted.honorUntil,
              qualifying_profile: CONFIG.pricing.postedProfile,
              finance_charges_in_apr: posted.financeCharges,
              lines: posted.lines.map((l) => ({ product: l.product, rate: l.rate, apr: l.apr, discount_points: 0, freddie_mac_weekly_average: l.pmms })),
            }
          : null,
        scenarios: grid,
        personal_estimate: { method: "POST", url: absoluteUrl("/api/agent/quote"), note: "A licensed loan officer prices and approves it; the person gets it by email." },
        page: absoluteUrl("/rates"),
      })
    );
  });
}

export function POST(): Response {
  return methodNotAllowed(["GET"]);
}

export function OPTIONS(): Response {
  return optionsResponse();
}
