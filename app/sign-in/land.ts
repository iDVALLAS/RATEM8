import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_COOKIE, PENDING_COOKIE, REMEMBER_COOKIE, SESSION_COOKIE, sessionTtl } from "@/lib/accounts/auth";
import { MFA_TTL_MS } from "@/lib/accounts/mfa";

/** D88: the "Remember this computer for 30 days" box, on every form that can finish signing in. */
export const REMEMBER_FIELD = "remember";
export const rememberTicked = (fd: FormData) => fd.get(REMEMBER_FIELD) === "on";

/**
 * D47: after the email step (the code or the link), sign in this browser:
 * the phone-code step when it's on (D34), else a session. Always ends in a
 * redirect. D88: the session lasts 30 days when Remember was ticked, else
 * 12 hours; the tick rides to the phone-code step in a 5-minute cookie.
 */
export async function land(res: { session: string } | { mfa: string }, remember = false): Promise<never> {
  const jar = await cookies();
  const secure = ((await headers()).get("x-forwarded-proto") ?? "https") === "https";
  jar.delete({ name: PENDING_COOKIE, path: "/sign-in" });
  if ("mfa" in res) {
    const step = { httpOnly: true, secure, sameSite: "lax" as const, path: "/sign-in", maxAge: Math.floor(MFA_TTL_MS / 1000) };
    jar.set(MFA_COOKIE, res.mfa, step);
    if (remember) jar.set(REMEMBER_COOKIE, "1", step);
    else jar.delete({ name: REMEMBER_COOKIE, path: "/sign-in" });
    redirect("/sign-in/code");
  }
  jar.set(SESSION_COOKIE, res.session, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(sessionTtl(remember) / 1000) });
  redirect("/mlo");
}
