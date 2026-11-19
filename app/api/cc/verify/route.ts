import { NextResponse } from "next/server";
import { MFA_COOKIE, SESSION_COOKIE, SESSION_TTL_MS, verifySignIn } from "@/lib/accounts/auth";
import { MFA_TTL_MS } from "@/lib/accounts/mfa";

/** GET /api/cc/verify?t=… — the emailed sign-in link (D1). One use, 15 minutes. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = await verifySignIn(url.searchParams.get("t") ?? "").catch(() => null);
  if (!res) return NextResponse.redirect(new URL("/sign-in?e=expired", url), 303);
  if ("mfa" in res) {
    // D34: the code step. The ticket rides in an httpOnly cookie, never the address bar.
    const step = NextResponse.redirect(new URL("/sign-in/code", url), 303);
    step.cookies.set(MFA_COOKIE, res.mfa, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/sign-in", maxAge: Math.floor(MFA_TTL_MS / 1000) });
    return step;
  }
  const out = NextResponse.redirect(new URL("/mlo", url), 303);
  out.cookies.set(SESSION_COOKIE, res.session, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return out;
}
