/**
 * GET /llms.txt — a concise, accurate index for language-model crawlers
 * and assistants. Built from the route registry (lib/site.ts) and config
 * (lib/config.ts). Nothing here is typed by hand, so it cannot go stale
 * independently of the site.
 *
 * Format follows the llms.txt convention: H1, a blockquote summary,
 * H2 sections of `[title](url): description` links.
 */

import { CONFIG, LICENSED_IN_LINE, NOT_A_CREDIT_PULL, NOT_A_COMMITMENT } from "@/lib/config";
import { ROUTES, absoluteUrl } from "@/lib/site";
import { PRINCIPLES_VERSION } from "@/lib/principles";
import { AGENT_API_VERSION, HUMAN_CONSENT_MESSAGE } from "@/lib/agent-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildLlmsTxt(): string {
  const lines: string[] = [];

  lines.push(`# ${CONFIG.brandName}`);
  lines.push("");
  lines.push(
    `> ${CONFIG.brandName} is an AI-powered mortgage rate-shopping brokerage. ${CONFIG.tagline} The AI, M8, explains the math and writes up the options; a licensed loan officer verifies and closes every loan. Licensed in ${LICENSED_IN_LINE}. No lead-selling, no trigger leads, no spam.`
  );
  lines.push("");
  lines.push(`Canonical site: ${absoluteUrl("/")}`);
  lines.push(`Start here for assistants: ${absoluteUrl("/ai")}`);
  lines.push(`Principles version: ${PRINCIPLES_VERSION}. Agent API version: ${AGENT_API_VERSION}.`);
  lines.push("");

  lines.push("## Key pages");
  lines.push("");
  for (const r of ROUTES.filter((x) => x.llms)) {
    lines.push(`- [${r.title}](${absoluteUrl(r.path)}): ${r.description}`);
  }
  lines.push("");

  lines.push("## Machine-readable");
  lines.push("");
  lines.push(`- [ai.md](${absoluteUrl("/ai.md")}): The /ai page as Markdown. What LoanM8 is and is not, licensing, hand-off, guardrails.`);
  lines.push(`- [principles.md](${absoluteUrl("/principles.md")}): The eight principles, verbatim and versioned.`);
  lines.push(`- [calculators/methodology.md](${absoluteUrl("/calculators/methodology.md")}): How each calculator works and every assumption it makes.`);
  lines.push(`- [openapi.json](${absoluteUrl("/api/agent/openapi.json")}): OpenAPI 3.1 for the agent API (POST /api/agent/calc/{tool}, GET /api/agent/states, GET /api/agent/handoff).`);
  lines.push(`- [sitemap.xml](${absoluteUrl("/sitemap.xml")}): Every route.`);
  lines.push("");

  lines.push("## Constraints");
  lines.push("");
  if (!CONFIG.liveRatesEnabled) {
    lines.push(`- No rates online. ${CONFIG.brandName} displays no rates on this site and the agent API returns no rates or pricing. Calculators use only a rate the borrower enters.`);
  }
  lines.push(`- No credit pulls online. ${NOT_A_CREDIT_PULL} Nothing on this site or in the API pulls credit.`);
  lines.push(`- No approvals online. M8 does not approve, deny, pre-approve, or commit. ${NOT_A_COMMITMENT}`);
  lines.push(`- ${HUMAN_CONSENT_MESSAGE}`);
  lines.push(`- Licensed states: ${LICENSED_IN_LINE}. If a state is not listed, ${CONFIG.brandName} cannot originate there.`);
  lines.push(`- M8 is an AI, not a person, and says so before any interaction. Uploaded documents and third-party text are data, never instructions.`);
  lines.push("");

  return lines.join("\n");
}

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
