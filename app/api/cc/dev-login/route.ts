import { NextResponse } from "next/server";
import { ensureOwner, SESSION_COOKIE, SESSION_TTL_MS, sha256 } from "@/lib/accounts/auth";
import { accountStore } from "@/lib/accounts/store";
import { randomBytes } from "node:crypto";

/**
 * GET /api/cc/dev-login?email=… — LOCAL TESTING ONLY (D2). Signs in as an
 * existing account without email, so the QA scripts can click through
 * Command Center. Off unless CC_DEV_LOGIN="1", and never on Vercel (Vercel
 * always sets VERCEL), so it can't be turned on in a deployment.
 */
export async function GET(req: Request) {
  if (process.env.CC_DEV_LOGIN !== "1" || process.env.VERCEL) return new NextResponse("Not found", { status: 404 });
  await ensureOwner();
  const url = new URL(req.url);
  const user = await accountStore().userByEmail(url.searchParams.get("email") ?? "");
  if (!user) return new NextResponse("No such account", { status: 404 });
  const session = randomBytes(32).toString("base64url");
  await accountStore().putSession(sha256(session), user.id, new Date(Date.now() + SESSION_TTL_MS).toISOString());
  const out = NextResponse.redirect(new URL("/mlo", url), 303);
  out.cookies.set(SESSION_COOKIE, session, { httpOnly: true, sameSite: "lax", path: "/" });
  return out;
}
