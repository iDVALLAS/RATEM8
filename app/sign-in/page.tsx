import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import CcAuthShell from "@/app/mlo/CcAuthShell";
import { currentUser, LINK_TTL_MS, PENDING_COOKIE, requestSignIn, verifySignInCode } from "@/lib/accounts/auth";
import { hashIp } from "@/lib/m8/limits";
import { land } from "./land";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Sign in — MLO Command Center" }, robots: { index: false, follow: false } };

const NOTES: Record<string, string> = {
  expired: "That link has expired or was already used. Ask for a new code.",
  out: "You're signed out.",
};

async function send(fd: FormData) {
  "use server";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const res = await requestSignIn(String(fd.get("email") ?? ""), origin, await hashIp(ip));
  if (!res.ok) redirect(`/sign-in?err=${encodeURIComponent(res.error)}`);
  // D47: this browser waits for the code; the code only works here.
  (await cookies()).set(PENDING_COOKIE, res.pending, { httpOnly: true, secure: (h.get("x-forwarded-proto") ?? "https") === "https", sameSite: "lax", path: "/sign-in", maxAge: Math.floor(LINK_TTL_MS / 1000) });
  redirect("/sign-in?e=sent");
}

async function enterCode(fd: FormData) {
  "use server";
  const jar = await cookies();
  const r = await verifySignInCode(jar.get(PENDING_COOKIE)?.value, String(fd.get("code") ?? ""));
  if ("error" in r) {
    if (r.spent) {
      jar.delete({ name: PENDING_COOKIE, path: "/sign-in" });
      redirect(`/sign-in?err=${encodeURIComponent(r.error)}`);
    }
    redirect(`/sign-in?e=sent&err=${encodeURIComponent(r.error)}`);
  }
  await land(r);
}

function EmailForm({ again = false }: { again?: boolean }) {
  return (
    <form action={send} className="mlo-section">
      <label className="mlo-field">
        <span>Work email</span>
        <input type="email" name="email" required autoComplete="email" className="mlo-input" />
      </label>
      <button type="submit" className={again ? "mlo-btn mlo-btn--ghost" : "mlo-btn"}>{again ? "Send a new code" : "Email me a sign-in code"}</button>
    </form>
  );
}

/** /sign-in — Command Center sign-in: an emailed code for this device, or a link for the device that reads it (D1, D47). */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ e?: string; err?: string }> }) {
  const { e, err } = await searchParams;
  if (await currentUser().catch(() => null)) redirect("/mlo");
  const waiting = e === "sent" && !!(await cookies()).get(PENDING_COOKIE)?.value;
  return (
    <CcAuthShell>
      {waiting ? (
        <>
          <h1>Check your email</h1>
          <p className="cc-auth__lede">If that email has a Command Center account, we sent a 6-digit code. Type it here to sign in on this device. You can read the email on your phone.</p>
          {err ? <div className="mlo-flash mlo-flash--err" role="alert">{err.slice(0, 200)}</div> : null}
          <form action={enterCode} className="mlo-section">
            <label className="mlo-field">
              <span>Sign-in code</span>
              <input name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} className="mlo-input cc-auth__code" />
            </label>
            <button type="submit" className="mlo-btn">Sign in</button>
          </form>
          <p className="mlo-note" style={{ marginTop: 12 }}>The code works for 15 minutes. Nothing yet? Check Junk or Quarantine; work email can hold new senders for a few minutes.</p>
          <details className="mlo-details" style={{ marginTop: 12 }}>
            <summary>Send a new code</summary>
            <EmailForm again />
          </details>
        </>
      ) : (
        <>
          <h1>Sign in</h1>
          <p className="cc-auth__lede">We&apos;ll email you a code. No password to remember.</p>
          {e && NOTES[e] ? <div className="mlo-flash mlo-flash--ok" role="status">{NOTES[e]}</div> : null}
          {err ? <div className="mlo-flash mlo-flash--err" role="alert">{err.slice(0, 200)}</div> : null}
          <EmailForm />
        </>
      )}
      <p className="cc-auth__alt">New loan officer? <a href="/sign-up">Sign up</a><br />Still on the shared admin login? <a href="/mlo?basic=1">Use it here</a>.</p>
    </CcAuthShell>
  );
}
