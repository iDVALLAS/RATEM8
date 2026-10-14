/**
 * GET /ai.md — the /ai page as Markdown. Generated from lib/content/ai.ts,
 * the same module that renders the HTML page, so the two cannot drift.
 */

import { aiMarkdown } from "@/lib/content/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(aiMarkdown(), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
