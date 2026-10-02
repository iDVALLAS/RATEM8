/**
 * GET /api/agent/handoff — where to send a borrower who wants a human.
 * Booking links come from env via lib/config.ts; an unconfigured link is
 * returned as null, never as a dead URL.
 */

import { CONFIG, hasBooking, NOT_A_CREDIT_PULL } from "@/lib/config";
import { absoluteUrl } from "@/lib/site";
import {
  envelope,
  json,
  optionsResponse,
  disabledResponse,
  methodNotAllowed,
  withAgentRoute,
  HUMAN_CONSENT_MESSAGE,
} from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/agent/handoff";

const linkOrNull = (url: string): string | null => (hasBooking(url) ? url : null);

export async function GET(req: Request): Promise<Response> {
  if (!CONFIG.featureFlags.agentApi) return disabledResponse();
  return withAgentRoute(req, ROUTE, () =>
    json(
      envelope({
        booking: {
          borrower: linkOrNull(CONFIG.calendly.borrower),
          agent: linkOrNull(CONFIG.calendly.agent),
          mlo: linkOrNull(CONFIG.calendly.mlo),
          secondLook: linkOrNull(CONFIG.calendly.secondLook),
        },
        second_look: absoluteUrl("/second-look"),
        chat: absoluteUrl("/chat"),
        ai_page: absoluteUrl("/ai"),
        message: HUMAN_CONSENT_MESSAGE,
        not_a_credit_pull: NOT_A_CREDIT_PULL,
      })
    )
  );
}

export function POST(): Response {
  return methodNotAllowed(["GET"]);
}

export function OPTIONS(): Response {
  return optionsResponse();
}
