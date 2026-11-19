import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PageShell from "@/components/PageShell";
import { currentUser } from "@/lib/accounts/auth";
import { US_STATES } from "@/lib/us-states";
import SignUpForm from "./SignUpForm";
import "../mlo/mlo.css";
import "./sign-up.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign up", robots: { index: false, follow: false } };

/** /sign-up — a licensed loan officer signs up for Command Center (D45). */
export default async function SignUp() {
  if (await currentUser().catch(() => null)) redirect("/mlo");
  return (
    <PageShell>
      <div className="mlo-wrap" style={{ maxWidth: "40rem" }}>
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Sign up</h1>
        <p className="mlo-note">For licensed mortgage loan originators, in any state. Tell us who you are and where you&apos;re licensed. We&apos;ll confirm your email, then a person checks your NMLS record before your account opens.</p>
        <SignUpForm states={US_STATES.map((s) => ({ code: s.code, name: s.name }))} />
        <p className="mlo-note" style={{ marginTop: 16 }}>Already have an account? <Link href="/sign-in">Sign in</Link>.</p>
      </div>
    </PageShell>
  );
}
