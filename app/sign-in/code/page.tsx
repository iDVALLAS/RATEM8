import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import PageShell from "@/components/PageShell";
import { MFA_COOKIE, openSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/accounts/auth";
import { finishCodeStep } from "@/lib/accounts/mfa";
import "../../mlo/mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enter your code", robots: { index: false, follow: false } };

async function check(fd: FormData) {
  "use server";
  const jar = await cookies();
  const p = jar.get(MFA_COOKIE)?.value ?? "";
  const r = await finishCodeStep(p, String(fd.get("code") ?? ""));
  if (!r.ok) {
    if (r.spent) {
      jar.delete({ name: MFA_COOKIE, path: "/sign-in" });
      redirect(`/sign-in?err=${encodeURIComponent(r.error)}`);
    }
    redirect(`/sign-in/code?err=${encodeURIComponent(r.error)}`);
  }
  const h = await headers();
  const secure = (h.get("x-forwarded-proto") ?? "https") === "https";
  jar.delete({ name: MFA_COOKIE, path: "/sign-in" });
  jar.set(SESSION_COOKIE, await openSession(r.user), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  redirect(r.used === "recovery" ? `/mlo/security?recovery=${r.recoveryLeft}` : "/mlo");
}

/** /sign-in/code — the second sign-in step (D34), after the emailed link. */
export default async function Code({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  if (!(await cookies()).get(MFA_COOKIE)) redirect("/sign-in?e=expired");
  return (
    <PageShell>
      <div className="mlo-wrap" style={{ maxWidth: "28rem" }}>
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Enter your code</h1>
        {err ? <div className="mlo-flash mlo-flash--err" role="alert">{err.slice(0, 200)}</div> : null}
        <form action={check} className="mlo-section">
          <label className="mlo-field">
            <span>The 6-digit code from your authenticator app</span>
            <input name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}|[A-Za-z0-9-]{10,11}" maxLength={11} className="mlo-input" style={{ letterSpacing: "0.2em", fontSize: 22 }} />
          </label>
          <button type="submit" className="mlo-btn">Sign in</button>
          <p className="mlo-note" style={{ marginTop: 12 }}>Lost your phone? Enter one of your recovery codes instead, or ask the owner to reset it. This step expires five minutes after you opened the link.</p>
        </form>
      </div>
    </PageShell>
  );
}
