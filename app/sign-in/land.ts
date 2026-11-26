import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { FACEID_COOKIE, MFA_COOKIE, PENDING_COOKIE, REMEMBER_COOKIE, SESSION_COOKIE, sessionTtl } from "@/lib/accounts/auth";
import { MFA_TTL_MS } from "@/lib/accounts/mfa";

export { afterSignIn, FACEID_FIELD, faceIdTicked, REMEMBER_FIELD, rememberTicked, safeNext } from "./fields";
import { afterSignIn } from "./fields";

/**
 * D47: after the email step (the code or the link), sign in this browser:
 * the phone-code step when it's on (D34), else a session. Always ends in a
 * redirect. D89: the session lasts 30 days when Remember was ticked, else
 * 12 hours; the tick rides to the phone-code step in a 5-minute cookie.
 * D94: so does the Face ID tick; once signed in it opens the Face ID setup.
 */
export async function land(res: { session: string } | { mfa: string }, remember = false, faceId = false): Promise<never> {
  const jar = await cookies();
  const secure = ((await headers()).get("x-forwarded-proto") ?? "https") === "https";
  jar.delete({ name: PENDING_COOKIE, path: "/sign-in" });
  if ("mfa" in res) {
    const step = { httpOnly: true, secure, sameSite: "lax" as const, path: "/sign-in", maxAge: Math.floor(MFA_TTL_MS / 1000) };
    jar.set(MFA_COOKIE, res.mfa, step);
    if (remember) jar.set(REMEMBER_COOKIE, "1", step);
    else jar.delete({ name: REMEMBER_COOKIE, path: "/sign-in" });
    if (faceId) jar.set(FACEID_COOKIE, "1", step);
    else jar.delete({ name: FACEID_COOKIE, path: "/sign-in" });
    redirect("/sign-in/code");
  }
  jar.set(SESSION_COOKIE, res.session, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(sessionTtl(remember) / 1000) });
  redirect(afterSignIn(faceId));
}
