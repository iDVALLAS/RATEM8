import { NextResponse } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { FLOW_COOKIE, FLOW_TTL_MS, newState, sealFlow } from "@/lib/mail/flow";
import { authUrl, newVerifier } from "@/lib/mail/oauth";
import { requestOrigin } from "@/lib/mail/origin";

export const dynamic = "force-dynamic";

/** GET /api/cc/mail/start?provider=google|microsoft — off to Google or Microsoft to allow sending (D52). */
export async function GET(req: Request) {
  const u = await currentUser().catch(() => null);
  const origin = requestOrigin(req.headers);
  if (!u) return NextResponse.redirect(new URL("/sign-in", origin));
  const p = new URL(req.url).searchParams.get("provider");
  if (p !== "google" && p !== "microsoft") return NextResponse.redirect(new URL("/mlo/email", origin));
  const state = newState();
  const verifier = newVerifier();
  const url = authUrl(p, origin, state, verifier, u.email);
  if (!url) return NextResponse.redirect(new URL("/mlo/email", origin));
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(FLOW_COOKIE, sealFlow({ state, verifier, provider: p, userId: u.id, at: Date.now() }), { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/cc/mail", maxAge: FLOW_TTL_MS / 1000 });
  return res;
}
