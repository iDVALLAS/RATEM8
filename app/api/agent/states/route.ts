/**
 * GET /api/agent/states — licensed states, service areas, license
 * identifiers, and regulator links, straight from lib/config.ts.
 *
 * Bracketed values are unfilled placeholders and are returned as-is on
 * purpose: an agent should see that a license number is not yet
 * published rather than an invented one.
 */

import { CONFIG, STATES } from "@/lib/config";
import { absoluteUrl } from "@/lib/site";
import { envelope, json, optionsResponse, disabledResponse, methodNotAllowed, withAgentRoute } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/agent/states";

export async function GET(req: Request): Promise<Response> {
  if (!CONFIG.featureFlags.agentApi) return disabledResponse();
  return withAgentRoute(req, ROUTE, () =>
    json(
      envelope({
        states: STATES.map((s) => ({
          slug: s.slug,
          code: s.code,
          name: s.name,
          serviceArea: s.serviceArea,
          entityLicense: s.entityLicense,
          mloLicense: s.mloLicense,
          regulator: { name: s.regulatorName, url: s.regulatorUrl },
          page: absoluteUrl(`/states/${s.slug}`),
        })),
        disclosures: absoluteUrl("/disclosures"),
        note: "Values in [brackets] are not yet published. Do not fill them in from another source.",
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
