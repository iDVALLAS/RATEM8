import { cookies } from "next/headers";
import ChatExperienceWithToggle from "@/components/ChatExperienceWithToggle";
import DemoPasswordGate from "@/components/DemoPasswordGate";

export const metadata = {
  title: "M8 Preview — RateM8",
  description:
    "Preview the M8 conversation experience. By invitation only.",
  robots: { index: false, follow: false },
};

/**
 * /demo — v10.0 update
 *
 * Now renders ChatExperienceWithToggle after auth, giving testers a
 * two-tab UI: the scripted Sarah demo OR live M8 (preview build).
 *
 * The password gate is unchanged. The "you need password to see the
 * chat" security posture stays. Live M8 is behind the same gate as
 * the scripted demo, exactly as agreed for v10.0.
 */

async function hashPassword(pw: string): Promise<string> {
  if (!pw) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode("ratem8:" + pw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function DemoPage() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get("ratem8_demo_auth");
  const expectedHash = await hashPassword(process.env.DEMO_PASSWORD || "");

  const authed =
    !!authCookie && !!expectedHash && authCookie.value === expectedHash;

  if (!authed) {
    return <DemoPasswordGate />;
  }

  return <ChatExperienceWithToggle />;
}
