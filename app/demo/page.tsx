import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DemoPasswordGate from "@/components/DemoPasswordGate";
import { CONFIG } from "@/lib/config";

export const metadata = {
  title: "Tester access",
  description: "Tester access to the pre-launch site. By invitation only.",
  robots: { index: false, follow: false },
};

/**
 * /demo — the tester password page (C1).
 *
 * The scripted demo and the scripted/live tabs are gone; the live M8 chat
 * is public at /chat. This page stays only as the way testers unlock the
 * rest of the pre-launch site: the password sets the cookie middleware.ts
 * checks. Once in, testers land on the homepage. L3 removes it with the
 * stealth gate.
 */

async function hashPassword(pw: string): Promise<string> {
  if (!pw) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode("loanm8:" + pw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function DemoPage() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get("loanm8_demo_auth");
  const expectedHash = await hashPassword(process.env.DEMO_PASSWORD || "");

  const authed =
    !!authCookie && !!expectedHash && authCookie.value === expectedHash;

  if (!authed) {
    return <DemoPasswordGate contactEmail={CONFIG.demoContactEmail} />;
  }

  redirect("/");
}
