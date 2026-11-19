import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PageShell from "@/components/PageShell";
import { currentUser, requestSignIn } from "@/lib/accounts/auth";
import { hashIp } from "@/lib/m8/limits";
import "../mlo/mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const NOTES: Record<string, string> = {
  sent: "If that email has a Command Center account, a sign-in link is on its way. It works once, for 15 minutes.",
  expired: "That link has expired or was already used. Ask for a new one.",
  out: "You're signed out.",
};

async function send(fd: FormData) {
  "use server";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const res = await requestSignIn(String(fd.get("email") ?? ""), origin, await hashIp(ip));
  redirect(res.ok ? "/sign-in?e=sent" : `/sign-in?err=${encodeURIComponent(res.error)}`);
}

/** /sign-in — Command Center sign-in by emailed link (D1). */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ e?: string; err?: string }> }) {
  const { e, err } = await searchParams;
  if (await currentUser().catch(() => null)) redirect("/mlo");
  return (
    <PageShell>
      <div className="mlo-wrap" style={{ maxWidth: "28rem" }}>
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Sign in</h1>
        {e && NOTES[e] ? <div className="mlo-flash mlo-flash--ok" role="status">{NOTES[e]}</div> : null}
        {err ? <div className="mlo-flash mlo-flash--err" role="alert">{err.slice(0, 200)}</div> : null}
        <form action={send} className="mlo-section">
          <label className="mlo-field">
            <span>Work email</span>
            <input type="email" name="email" required autoComplete="email" className="mlo-input" />
          </label>
          <button type="submit" className="mlo-btn">Email me a sign-in link</button>
          <p className="mlo-note" style={{ marginTop: 12 }}>No password to remember. New loan officer? <a href="/sign-up">Sign up</a>.</p>
        </form>
        <p className="mlo-note" style={{ marginTop: 16 }}>
          Still on the shared admin login? <a href="/mlo?basic=1">Use it here</a>.
        </p>
      </div>
    </PageShell>
  );
}
