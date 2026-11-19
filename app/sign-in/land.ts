import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_COOKIE, PENDING_COOKIE, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/accounts/auth";
import { MFA_TTL_MS } from "@/lib/accounts/mfa";

/**
 * D47: after the email step (the code or the link), sign in this browser:
 * the phone-code step when it's on (D34), else a session. Always ends in a
 * redirect.
 */
export async function land(res: { session: string } | { mfa: string }): Promise<never> {
  const jar = await cookies();
  const secure = ((await headers()).get("x-forwarded-proto") ?? "https") === "https";
  jar.delete({ name: PENDING_COOKIE, path: "/sign-in" });
  if ("mfa" in res) {
    jar.set(MFA_COOKIE, res.mfa, { httpOnly: true, secure, sameSite: "lax", path: "/sign-in", maxAge: Math.floor(MFA_TTL_MS / 1000) });
    redirect("/sign-in/code");
  }
  jar.set(SESSION_COOKIE, res.session, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  redirect("/mlo");
}
