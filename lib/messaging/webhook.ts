/** lib/messaging/webhook.ts — reading and verifying a Twilio webhook (D4). SERVER-ONLY. */
import { validTwilioRequest } from "./twilio";
import { webhookToken } from "@/lib/texting/service";
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
  const url = publicUrl(req);
  const sig = req.headers.get("x-twilio-signature");
  if (validTwilioRequest(url, params, sig)) return params;
  // D56: a company registered by Command Center texts from its own subaccount, which signs with its own token.
  const sub = params.AccountSid ? await webhookToken(params.AccountSid) : null;
  return sub && validTwilioRequest(url, params, sig, sub) ? params : null;
}

export const fromNumber = (p: Record<string, string>) => toE164(p.From);
