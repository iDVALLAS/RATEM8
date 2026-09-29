import { CONFIG } from "@/lib/config";
import { methodologyMarkdown } from "@/lib/content/calculators";

/**
 * GET /calculators/methodology.md — the calculators' formulas and
 * assumptions as Markdown, for people and for AI agents. Accurate to
 * lib/calc.ts; no rates anywhere.
 */
export const dynamic = "force-static";

export function GET() {
  const body = methodologyMarkdown(CONFIG.siteUrl.replace(/\/$/, ""));
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
