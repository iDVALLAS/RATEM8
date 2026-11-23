import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CcAuthShell from "@/app/mlo/CcAuthShell";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, verifySignIn } from "@/lib/accounts/auth";
import { land, rememberTicked } from "../land";
import RememberBox from "../RememberBox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in on this device", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function openLink(t: string, fd: FormData) {
  "use server";
  const remember = rememberTicked(fd);
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  const r = await verifySignIn(t, Date.now(), { remember, device }).catch(() => null);
  if (!r) redirect("/sign-in?e=expired");
  await land(r, remember);
}

/**
 * /sign-in/link?t= — where the emailed link lands (D47). Signing in takes a
 * button press, because some work email systems open links ahead of time to
 * scan them, which would use up a one-time link.
 */
export default async function SignInLink({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  if (!t) redirect("/sign-in");
  return (
    <CcAuthShell>
      <h1>Sign in on this device</h1>
      <p className="cc-auth__lede">This signs in the browser you&apos;re using now. To sign in on another computer, type the 6-digit code from the same email there instead.</p>
      <form action={openLink.bind(null, t.slice(0, 100))} className="mlo-section">
        <RememberBox />
        <button type="submit" className="mlo-btn">Sign in on this device</button>
      </form>
    </CcAuthShell>
  );
}
