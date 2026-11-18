/** lib/messaging/webhook.ts — reading and verifying a Twilio webhook (D4). SERVER-ONLY. */
import { validTwilioRequest } from "./twilio";
import { toE164 } from "@/lib/contacts/normalize";

/** The URL Twilio signed: the public one, as Twilio called it (Vercel forwards the host and protocol). */
export function publicUrl(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}${u.pathname}${u.search}`;
}

export async function readTwilio(req: Request): Promise<Record<string, string> | null> {
  const text = await req.text();
  const params = Object.fromEntries(new URLSearchParams(text));
  return validTwilioRequest(publicUrl(req), params, req.headers.get("x-twilio-signature")) ? params : null;
}

export const fromNumber = (p: Record<string, string>) => toE164(p.From);
