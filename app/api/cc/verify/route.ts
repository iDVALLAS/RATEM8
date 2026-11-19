import { NextResponse } from "next/server";

/**
 * GET /api/cc/verify?t=… — the emailed sign-in link (D1). Since D47 it no
 * longer signs in by itself: it opens /sign-in/link, where a button does,
 * so a mail scanner opening the link ahead of time can't use it up.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = new URL("/sign-in/link", url);
  const t = url.searchParams.get("t");
  if (t) to.searchParams.set("t", t.slice(0, 100));
  const out = NextResponse.redirect(to, 303);
  out.headers.set("Referrer-Policy", "no-referrer");
  return out;
}
