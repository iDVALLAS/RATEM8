/**
 * lib/messaging/twilio.ts — Twilio over its REST API (D4). SERVER-ONLY.
 *
 * A switch, like every LoanM8 service: on with TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN (Sensitive) and TWILIO_MESSAGING_SERVICE_SID (the
 * Messaging Service holding the 10DLC-registered numbers and campaign);
 * every call is a no-op without them. No client library.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const env = (k: string) => process.env[k]?.trim() || undefined;

export function twilioConfig(): { sid: string; token: string; service: string | null } | null {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  // D23: which Messaging Service sends is chosen per company. D56: Command Center can also
  // register a company's own service, so the keys alone mean "connected".
  const service = env("TWILIO_MESSAGING_SERVICE_SID") ?? Object.entries(process.env).find(([k, v]) => k.startsWith("TWILIO_MESSAGING_SERVICE_SID_") && v?.trim())?.[1]?.trim() ?? null;
  return sid && token ? { sid, token, service } : null;
}

const auth = (c: { sid: string; token: string }) => `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`;

export type SendResult = { ok: true; sid: string; status: string; from: string | null } | { ok: false; error: string };

/**
 * D23: the Messaging Service (one 10DLC brand and campaign) for a sponsoring
 * company, by the sponsor's NMLS number: TWILIO_MESSAGING_SERVICE_SID_<NMLS>.
 * With one sponsor on the platform, TWILIO_MESSAGING_SERVICE_SID works too.
 * With more than one, a company without its own service can't text (one
 * company's texts never go out under another's registration).
 */
export function serviceForCompany(company: string | null, single: boolean): string | null {
  const own = company ? env(`TWILIO_MESSAGING_SERVICE_SID_${company.replace(/\D/g, "")}`) : undefined;
  if (own) return own;
  return single ? (env("TWILIO_MESSAGING_SERVICE_SID") ?? null) : null;
}

/**
 * Sends through a Messaging Service. `account` is the company's own Twilio
 * subaccount when Command Center registered it (D56); the platform's keys
 * may act for its subaccounts.
 */
export async function sendSms(to: string, body: string, statusCallback: string | null, service?: string, account?: string | null): Promise<SendResult> {
  const c = twilioConfig();
  if (!c) return { ok: false, error: "Texting isn't connected yet (Twilio)." };
  const via = service ?? c.service;
  if (!via) return { ok: false, error: "Texting isn't registered for this company yet." };
  const form = new URLSearchParams({ To: to, Body: body, MessagingServiceSid: via });
  if (statusCallback) form.set("StatusCallback", statusCallback);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account && /^AC[0-9a-f]{32}$/i.test(account) ? account : c.sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: auth(c), "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
    });
    const out = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number; from?: string | null };
    if (!res.ok || !out.sid) return { ok: false, error: out.code === 21610 ? "This number has replied STOP to our texting number." : "Twilio didn't accept the text." };
    return { ok: true, sid: out.sid, status: out.status ?? "queued", from: out.from ?? null };
  } catch {
    return { ok: false, error: "Couldn't reach Twilio." };
  }
}

/** Line type (mobile, landline, voip) from Twilio Lookup v2, or null. */
export async function lookupLineType(e164: string): Promise<{ type: string; carrier: string | null } | null> {
  const c = twilioConfig();
  if (!c) return null;
  try {
    const res = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`, { headers: { Authorization: auth(c) }, cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { line_type_intelligence?: { type?: string; carrier_name?: string } };
    return j.line_type_intelligence?.type ? { type: j.line_type_intelligence.type, carrier: j.line_type_intelligence.carrier_name ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Twilio's webhook signature: base64 HMAC-SHA1 of the full URL followed by
 * each POST parameter name and value, sorted by name, keyed with the auth token.
 */
export function twilioSignature(token: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

export function validTwilioRequest(url: string, params: Record<string, string>, signature: string | null, token?: string | null): boolean {
  const key = token ?? twilioConfig()?.token;
  if (!key || !signature) return false;
  const a = Buffer.from(twilioSignature(key, url, params));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Words that revoke consent. STOP, QUIT, END, REVOKE, OPT-OUT, CANCEL and
 * UNSUBSCRIBE are always valid (FCC); the phrases catch "any reasonable
 * means" in plain English ("please stop texting me", "remove me").
 */
/**
 * A revocation in any reasonable words (47 CFR 64.1200(a)(10)–(11); FCC 26-67
 * from 2026-11-25). We name no exclusive method, so casual phrasings and
 * Spanish count too (D8.1). Erring toward "stop" is deliberate.
 */
export function isOptOut(body: string): boolean {
  const t = body.normalize("NFKC").trim().toLowerCase().replace(/[’]/g, "'").replace(/[.!¡]+$/, "").replace(/^[¡!]+/, "");
  if (/^(stop|stop all|stopall|stop please|please stop|quit|end|revoke|opt[ -]?out|cancel|unsubscribe|remove|para|alto|basta|cancelar|no más|no mas)$/.test(t)) return true;
  return /\b(stop (texting|messaging|contacting|calling|sending)|(don'?t|do not|never) (text|call|contact|message) (me|us)( again)?|remove me|take me off|unsubscribe me|opt me out|no more (texts|messages|calls)|leave me alone|wrong number|lose my number|delete my (number|info)|i'?m good,? no more|not interested,? (stop|please stop)|no me (escribas|llames|envíes|envies|contactes)|deja de (escribir|enviar|llamar)|ya no (me )?(escribas|envíes|envies|llames))\b/.test(t);
}

export const isOptIn = (body: string) => /^(start|unstop|yes)$/i.test(body.trim());
