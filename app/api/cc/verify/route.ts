import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, verifySignIn } from "@/lib/accounts/auth";

/** GET /api/cc/verify?t=… — the emailed sign-in link (D1). One use, 15 minutes. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = await verifySignIn(url.searchParams.get("t") ?? "").catch(() => null);
  if (!res) return NextResponse.redirect(new URL("/sign-in?e=expired", url), 303);
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
