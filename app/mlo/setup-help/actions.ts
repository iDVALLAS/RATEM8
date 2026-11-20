"use server";

import { headers } from "next/headers";
import { currentUser } from "@/lib/accounts/auth";
import { askSetup, type AskResult, type Turn } from "@/lib/setup/assistant";

/** D50: one turn with the setup assistant. The conversation lives in the browser; nothing is stored. */
export async function askSetupAction(turns: Turn[], topic: string | null): Promise<AskResult> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Sign in with your email to use the setup assistant." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return askSetup(u, Array.isArray(turns) ? turns : [], origin, { topic });
}
