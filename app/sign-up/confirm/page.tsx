import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { confirmAction } from "../actions";
import "../../mlo/mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

/** /sign-up/confirm?t= — one button confirms the email (D45). */
export default async function Confirm({ searchParams }: { searchParams: Promise<{ t?: string; done?: string; err?: string }> }) {
  const { t, done, err } = await searchParams;
  return (
    <PageShell>
      <div className="mlo-wrap" style={{ maxWidth: "32rem" }}>
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">{done ? "Thanks" : "Confirm your email"}</h1>
        {done ? (
          <p className="mlo-flash mlo-flash--ok" role="status">Your email is confirmed. A person will check your NMLS record next, and you&apos;ll get an email with your sign-in link when your account is ready.</p>
        ) : err ? (
          <>
            <p className="mlo-flash mlo-flash--err" role="alert">{err.slice(0, 200)}</p>
            <p className="mlo-note"><Link href="/sign-up">Sign up again</Link></p>
          </>
        ) : t ? (
          <form action={confirmAction.bind(null, t.slice(0, 200))} className="mlo-section">
            <p className="mlo-note">One click to confirm this is your email.</p>
            <button type="submit" className="mlo-btn">Confirm my email</button>
          </form>
        ) : (
          <p className="mlo-note">Open the link from your email. <Link href="/sign-up">Sign up</Link></p>
        )}
      </div>
    </PageShell>
  );
}
