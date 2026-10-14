import { CONFIG } from "@/lib/config";
import { principles, PRINCIPLES_VERSION } from "@/lib/principles";
import { absoluteUrl } from "@/lib/site";

/**
 * GET /principles.md — the eight principles, verbatim, as markdown.
 * A stable, quotable mirror of /principles for AI agents and anyone
 * who wants the text without the page.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const lines: string[] = [
    `# ${CONFIG.brandName} — The Eight Principles`,
    "",
    `Version: ${PRINCIPLES_VERSION}`,
    `Canonical: ${absoluteUrl("/principles")}`,
    "",
    "Every loan on LoanM8 is closed against these. The text below is the locked, canonical wording.",
    "",
  ];

  for (const p of principles) {
    const body = p.body ? ` ${p.body}` : "";
    lines.push(`${p.number}. **${p.title}**${body}`);
  }

  lines.push("", "---", "", `Source: ${absoluteUrl("/principles")} · Version ${PRINCIPLES_VERSION}`, "");

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
