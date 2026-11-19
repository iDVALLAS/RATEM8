import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import CcAuthShell from "@/app/mlo/CcAuthShell";
import { currentUser } from "@/lib/accounts/auth";
import { US_STATES } from "@/lib/us-states";
import SignUpForm from "./SignUpForm";
import "./sign-up.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign up", robots: { index: false, follow: false } };

/** /sign-up — a licensed loan officer signs up for Command Center (D45). */
export default async function SignUp() {
  if (await currentUser().catch(() => null)) redirect("/mlo");
  return (
    <CcAuthShell wide>
        <h1>Sign up</h1>
        <p className="cc-auth__lede">For licensed mortgage loan originators, in any state. Tell us who you are and where you&apos;re licensed. We&apos;ll confirm your email, then a person checks your NMLS record before your account opens.</p>
        <SignUpForm states={US_STATES.map((s) => ({ code: s.code, name: s.name }))} />
        <p className="cc-auth__alt">Already have an account? <Link href="/sign-in">Sign in</Link>.</p>
    </CcAuthShell>
  );
}
