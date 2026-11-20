/**
 * lib/mail/flow.ts — the short-lived cookie that ties a mailbox sign-in to
 * the person who started it (D52). Sealed, 10 minutes, one use, only sent
 * to /api/cc/mail.
 */
import { randomBytes } from "node:crypto";
import { seal, unseal } from "./seal";
import type { MailProvider } from "./store";

export const FLOW_COOKIE = "lm8_cc_mail";
export const FLOW_TTL_MS = 10 * 60 * 1000;
export type Flow = { state: string; verifier: string; provider: MailProvider; userId: string; at: number };

export const newState = () => randomBytes(24).toString("base64url");
export const sealFlow = (f: Flow) => seal(JSON.stringify(f));

export function openFlow(raw: string | undefined, provider: string, state: string | null, userId: string, now = Date.now()): Flow | null {
  const txt = unseal(raw);
  if (!txt || !state) return null;
  try {
    const f = JSON.parse(txt) as Flow;
    if (f.provider !== provider || f.userId !== userId || f.state !== state || now - f.at > FLOW_TTL_MS || now < f.at - 60_000) return null;
    return f;
  } catch {
    return null;
  }
}
