import { NextResponse } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { FLOW_TTL_MS, newState, sealFlow } from "@/lib/mail/flow";
import { requestOrigin } from "@/lib/mail/origin";
import { thanksAuthUrl } from "@/lib/cards/thanks";

export const dynamic = "force-dynamic";
const CARDS_COOKIE = "lm8_cc_cards";

/** GET /api/cc/cards/start — off to Thanks.io to connect your account (D53). */
export async function GET(req: Request) {
  const u = await currentUser().catch(() => null);
  const origin = requestOrigin(req.headers);
  if (!u) return NextResponse.redirect(new URL("/sign-in", origin));
  const state = newState();
  const url = thanksAuthUrl(origin, state);
  if (!url) return NextResponse.redirect(new URL("/mlo/cards", origin));
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(CARDS_COOKIE, sealFlow({ state, verifier: "", provider: "thanksio", userId: u.id, at: Date.now() }), { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/cc/cards", maxAge: FLOW_TTL_MS / 1000 });
  return res;
}
