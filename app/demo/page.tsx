import { cookies } from "next/headers";
import ChatExperience from "@/components/ChatExperience";
import DemoPasswordGate from "@/components/DemoPasswordGate";

export const metadata = {
  title: "M8 Demo — RateM8",
  description: "Preview the M8 conversation experience. By invitation only.",
  robots: { index: false, follow: false },
};

/**
 * /demo — the chat preview, gated by password.
 *
 * The gate is server-side: we check for the auth cookie before rendering
 * the chat. If absent or invalid, we render the password form instead.
 *
 * Password is set via DEMO_PASSWORD env var. Set it to something
 * memorable but not guessable (e.g. "loanmates2026"). Share with
 * friendly testers via email/text.
 *
 * Cookie session is 30 days. Long enough that testers don't have to
 * re-enter on every visit, short enough that revoking access is easy
 * (rotate DEMO_PASSWORD; old cookies stop working immediately).
 *
 * To rotate: change DEMO_PASSWORD in Vercel env. All existing cookies
 * become invalid because the cookie value is a hash of the password.
 *
 * This is INTENTIONALLY a soft gate, not a real auth system. It's
 * meant to prevent random crawlers and Google indexing, not to secure
 * confidential data. The compliance disclosure on /demo still applies.
 */
export default async function DemoPage() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get("ratem8_demo_auth");
  const expectedHash = await hashPassword(process.env.DEMO_PASSWORD || "");

  const authed =
    !!authCookie &&
    !!expectedHash &&
    authCookie.value === expectedHash;

  if (!authed) {
    return <DemoPasswordGate />;
  }

  return <ChatExperience />;
}

/**
 * Hash the password for cookie comparison. Using Web Crypto API
 * (SubtleCrypto) which is available in Next.js server runtime.
 * We don't need cryptographic-grade security here — this is a soft
 * gate. But we don't want the password sitting in plaintext in cookies either.
 */
async function hashPassword(pw: string): Promise<string> {
  if (!pw) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode("ratem8:" + pw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
