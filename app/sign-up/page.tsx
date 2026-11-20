import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import CcAuthShell from "@/app/mlo/CcAuthShell";
import { currentUser } from "@/lib/accounts/auth";
import { US_STATES } from "@/lib/us-states";
import SignUpForm from "./SignUpForm";
import { readInvite } from "@/lib/pilot/invite";
import "./sign-up.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Sign up — MLO Command Center" }, robots: { index: false, follow: false } };

/** /sign-up — a licensed loan officer signs up for Command Center (D45). */
export default async function SignUp({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (await currentUser().catch(() => null)) redirect("/mlo");
  // D61: a pilot invite fills in their name and email.
  const { invite: token } = await searchParams;
  const inv = readInvite(token);
  return (
    <CcAuthShell wide>
        <h1>Sign up</h1>
        <p className="cc-auth__lede">For licensed mortgage loan originators, in any state. Tell us who you are and where you&apos;re licensed. We&apos;ll confirm your email, then a person checks your NMLS record before your account opens.</p>
        {token && !inv ? <div className="mlo-flash mlo-flash--err" role="alert"><p>That invite link has expired or isn&apos;t complete. You can still sign up below, or ask for a new invite.</p></div> : null}
        {inv ? <div className="mlo-flash mlo-flash--ok" role="status"><p><strong>{inv.byName || "You"}{inv.byName ? " invited you" : "'re invited"} to the MLO Command Center pilot.</strong> Your email is already confirmed by this link; after you send this, a person checks your NMLS record and emails your sign-in link.</p></div> : null}
        <SignUpForm states={US_STATES.map((s) => ({ code: s.code, name: s.name }))} invite={inv ? { token: token!, name: inv.name, email: inv.email } : null} />
        <p className="cc-auth__alt">Already have an account? <Link href="/sign-in">Sign in</Link>.</p>
    </CcAuthShell>
  );
}
