import { cookies } from "next/headers";

/**
 * lib/preview-auth.ts — the tester gate (L3: /chat?preview=1, was /demo).
 *
 * The cookie /api/demo-auth sets holds SHA-256("loanm8:" + DEMO_PASSWORD).
 * Changing DEMO_PASSWORD invalidates every cookie. No password set → no
 * tester access at all. Server-only.
 */
export const TESTER_COOKIE = "loanm8_demo_auth";

export async function hashTesterPassword(pw: string): Promise<string> {
  if (!pw) return "";
  const data = new TextEncoder().encode("loanm8:" + pw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isTesterAuthed(): Promise<boolean> {
  const expected = await hashTesterPassword(process.env.DEMO_PASSWORD || "");
  if (!expected) return false;
  const c = (await cookies()).get(TESTER_COOKIE);
  return !!c && c.value === expected;
}
