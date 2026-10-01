import { cookies } from "next/headers";
import ChatExperienceWithToggle from "@/components/ChatExperienceWithToggle";
import DemoPasswordGate from "@/components/DemoPasswordGate";
import { CONFIG } from "@/lib/config";

export const metadata = {
  title: "M8 Preview — LoanM8",
  description: "Tester preview of the M8 chat shell. By invitation only.",
  robots: { index: false, follow: false },
};

/**
 * /demo — the owner's password-gated tester tool.
 *
 * After auth this renders ChatExperienceWithToggle: a "Scripted demo"
 * tab (the same UI-only <ChatShell /> that /chat renders) and a
 * "Live M8 (preview)" tab (<M8LiveChat />, which talks to the Claude API
 * through /api/m8-chat with the draft system prompt).
 *
 * The password gate below is unchanged. The live tab is allowed only
 * behind it; the public /chat route never calls a model while
 * CONFIG.featureFlags.chatLiveAi is false.
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

  return <ChatExperienceWithToggle />;
}
