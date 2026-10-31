import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/agent-api";
import { CHOICE_COOKIE } from "@/lib/routing";
import { nearestSummary } from "@/lib/quotes/public";
import { createQuote } from "@/lib/quotes/service";

/**
 * POST /api/quote — M8 quote mode (v37, L4). Body: { scenario, email,
 * emailConsent }. Saves the request for a licensed loan officer to price
 * and approve, and returns the closest scenario already published this
 * week. Nothing the borrower sent is logged.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(req);
  if (!rl.ok) return rl.response;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const preferred = (await cookies()).get(CHOICE_COOKIE)?.value ?? null;
  try {
    const res = await createQuote({ scenario: body.scenario, email: body.email, emailConsent: body.emailConsent, source: "m8", preferredMloId: preferred });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error, issues: res.issues }, { status: res.status });
    return NextResponse.json({ ok: true, id: res.id, url: res.url, state: res.state, nearest: await nearestSummary(res.nearest) });
  } catch {
    console.error("[quote] could not save a request");
    return NextResponse.json({ ok: false, error: "could not save" }, { status: 500 });
  }
}
