/**
 * POST /api/agent/quote — an AI assistant asks for a personal estimate on
 * a person's behalf (v37, L4). OFF unless AGENT_PRICING is "true".
 *
 * Body: { scenario, email, email_consent: true }. `email_consent` must
 * come from the person: the estimate is emailed to them, never returned
 * here. The response carries the request id and the closest scenario
 * already approved this week.
 */
import { CONFIG, RATE_DISCLAIMER_LEAD } from "@/lib/config";
import { disabledResponse, envelope, json, methodNotAllowed, optionsResponse, withAgentRoute } from "@/lib/agent-api";
import { nearestSummary } from "@/lib/quotes/public";
import { createQuote } from "@/lib/quotes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/agent/quote";

export async function POST(req: Request): Promise<Response> {
  if (!CONFIG.featureFlags.agentApi || !CONFIG.featureFlags.agentPricing) return disabledResponse();
  return withAgentRoute(req, ROUTE, async () => {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "bad_json", message: "Send JSON." }, { status: 400 });
    }
    const res = await createQuote({ scenario: body.scenario, email: body.email, emailConsent: body.email_consent, source: "agent", agentOrigin: req.headers.get("x-agent-origin") });
    if (!res.ok) return json({ error: "not_accepted", message: res.error, issues: res.issues ?? [] }, { status: res.status });
    return json(
      envelope({
        request_id: res.id,
        status: "awaiting_loan_officer",
        delivery: "The approved estimate is emailed to the person. It is not returned to the assistant.",
        nearest_published_scenario: await nearestSummary(res.nearest),
        rate_disclaimer: RATE_DISCLAIMER_LEAD,
      }),
      { status: 202 }
    );
  });
}

export function GET(): Response {
  return methodNotAllowed(["POST"]);
}

export function OPTIONS(): Response {
  return optionsResponse();
}
