import { NextResponse } from "next/server";
import { CONFIG, mloById } from "@/lib/config";
import { isUsState } from "@/lib/us-states";
import { CHOICE_COOKIE, PROPERTY_COOKIE } from "@/lib/routing";

/**
 * POST /api/route-choice — the borrower's own routing inputs (v15, Patch B).
 *
 * Body (JSON, every field optional):
 *   { propertyState: "OR" | null, mloId: "mlo-002" | null }
 *
 * Sets two first-party, httpOnly cookies the middleware reads:
 *   lm8_property_state — the state the property is in (borrower-stated)
 *   lm8_mlo            — the loan officer the borrower picked (choose states)
 * `null` clears a value. Nothing else is stored; the IP region is never
 * written anywhere. 404 while MLO_ROUTING is off.
 */
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: Request) {
  if (!CONFIG.pricing.mloRouting) return new NextResponse("Not found", { status: 404 });

  let body: { propertyState?: unknown; mloId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE };

  if ("propertyState" in body) {
    if (body.propertyState === null) res.cookies.delete(PROPERTY_COOKIE);
    else if (typeof body.propertyState === "string" && isUsState(body.propertyState)) res.cookies.set(PROPERTY_COOKIE, body.propertyState.toUpperCase(), opts);
    else return NextResponse.json({ ok: false, error: "Unknown state." }, { status: 400 });
  }
  if ("mloId" in body) {
    if (body.mloId === null) res.cookies.delete(CHOICE_COOKIE);
    else if (typeof body.mloId === "string" && mloById(body.mloId)) res.cookies.set(CHOICE_COOKIE, body.mloId, opts);
    else return NextResponse.json({ ok: false, error: "Unknown loan officer." }, { status: 400 });
  }
  return res;
}
