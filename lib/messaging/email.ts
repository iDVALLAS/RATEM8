/**
 * lib/messaging/email.ts — email to clients, through the send gate (D33).
 * SERVER-ONLY.
 *
 * The research's channel plan (ledger item 14): proactive check-ins go by
 * email first, since Washington's text law and the carriers make marketing
 * texts hard; texts are for replies and loan status.
 *  - Sent through Resend from the loan officer's name, with replies going
 *    to the loan officer's own inbox (Reply-To).
 *  - Every email carries a footer that identifies the sender: the loan
 *    officer, their NMLS number, the sponsoring company with its NMLS
 *    number and street address, and Equal Housing Opportunity. It also
 *    offers a one-click way to stop email (the client's own page; CAN-SPAM,
 *    15 U.S.C. 7704(a)(3)–(5)).
 *  - The subject is checked: no fake "Re:"/"Fwd:", no "approved" or "your
 *    rate", no urgency, no all-caps, no numbers that look like rates or money
 *    (CAN-SPAM 7704(a)(2); Washington RCW 19.190.020(1)(b)).
 *  - The body passes the same checks as every other draft.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { canSee } from "@/lib/contacts/service";
import { contactStore, type Purpose } from "@/lib/contacts/store";
import { mloById } from "@/lib/config";
import { SPONSOR } from "@/config/licensing";
import { checkDraft } from "@/lib/concierge/guard";
import { recordPromises } from "@/lib/concierge/promises";
import { clientLink } from "@/lib/clientpage/link";
import { gateFor, type SendOutcome } from "./service";
import { touchStore } from "./store";

const SUBJECT_BAD: [RegExp, string][] = [
  [/^\s*(re|fwd?|fw)\s*:/i, "looks like a reply or forward"],
  [/\b(pre-?)?approv\w*|\byour rate\b|\blocked\b|\bguarante\w*|\bno[- ]cost\b/i, "sounds like an approval, a rate or a promise"],
  [/\b(urgent|act\s+now|final notice|last chance|limited\s+time|expir\w*|immediately|hurr\w*)\b/i, "sounds urgent"],
  [/\d+(\.\d+)?\s?%|\$\s?\d/, "has a rate or a dollar amount"],
  [/!{2,}/, "has more than one exclamation mark"],
];

/** A subject line a client can trust. */
export function checkSubject(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 3) return { ok: false, reason: "is empty" };
  if (text.length > 78) return { ok: false, reason: "is over 78 characters" };
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) return { ok: false, reason: "is all capitals" };
  for (const [re, why] of SUBJECT_BAD) if (re.test(text)) return { ok: false, reason: why };
  return { ok: true, text };
}

/** Who it's from, where they are, and how to stop. Always at the bottom. */
export function emailFooter(actor: User, stopLink: string | null): string {
  const mlo = mloById(actor.mloId);
  const who = mlo ? `${mlo.name}, NMLS #${mlo.nmls}` : actor.name || "Your loan officer";
  return [
    "--",
    `${who}`,
    `${SPONSOR.legalName} dba ${SPONSOR.dba}, NMLS #${SPONSOR.nmls}`,
    SPONSOR.address,
    "Equal Housing Opportunity.",
    stopLink ? `Don't want these emails? Stop them here: ${stopLink}` : `Don't want these emails? Reply "unsubscribe" and I'll take you off.`,
  ].join("\n");
}

/** Client email needs only the Resend key and the verified sending address. */
function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.LOANM8_FROM_EMAIL?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

export const emailOn = () => !!emailConfig();

export async function sendEmail(actor: User, contactId: string, rawSubject: string, rawBody: string, purpose: Purpose, now = new Date(), send: (msg: { from: string; to: string; replyTo: string; subject: string; text: string }) => Promise<{ ok: boolean; id: string | null }> = resendSend): Promise<SendOutcome> {
  const c = await contactStore().get(contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: "No such contact." };
  if (!c.email) return { ok: false, error: "There's no email address for them." };
  const cfg = emailConfig();
  if (!cfg) return { ok: false, error: "Email isn't connected yet. Add the Resend keys in Vercel." };
  const s = checkSubject(rawSubject);
  if (!s.ok) return { ok: false, error: `The subject ${s.reason}.` };
  const d = checkDraft(rawBody, { names: [c.firstName, c.lastName, actor.name.split(/\s+/)[0]], places: [c.city] });
  if (!d.ok) return { ok: false, error: `The email can't be sent: it ${d.reason}.` };
  const g = await gateFor(actor, c, "email", purpose, now);
  if (!g.allowed) {
    await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "gate.block.email", detail: { contactId, purpose, reason: g.reasons[0] ?? "" } });
    return { ok: false, error: g.reasons[0] ?? "Not allowed right now.", reasons: g.reasons };
  }
  const text = `${d.text}\n\n${emailFooter(actor, clientLink(c.id, c.linkVersion ?? 0))}`;
  const mlo = mloById(actor.mloId);
  const fromName = (mlo?.name ?? actor.name ?? "LoanM8").replace(/[<>"]/g, "");
  const r = await send({ from: `${fromName} <${cfg.from}>`, to: c.email, replyTo: actor.email, subject: s.text, text });
  await touchStore().add({ id: `t_${randomBytes(9).toString("base64url")}`, contactId: c.id, ownerUserId: c.ownerUserId, channel: "email", purpose, direction: "out", body: `${s.text}\n\n${d.text}`, status: r.ok ? "sent" : "failed", providerId: r.id, note: g.basis, at: now.toISOString(), actor: actor.email, origin: "human" });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "gate.send.email", detail: { contactId, purpose, ok: r.ok } });
  if (r.ok) await recordPromises(actor, c, d.text, `email:${r.id ?? now.toISOString()}`, now).catch(() => 0);
  return r.ok ? { ok: true } : { ok: false, error: "Resend didn't accept the email." };
}

async function resendSend(msg: { from: string; to: string; replyTo: string; subject: string; text: string }): Promise<{ ok: boolean; id: string | null }> {
  const cfg = emailConfig();
  if (!cfg) return { ok: false, id: null };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: msg.from, to: [msg.to], reply_to: msg.replyTo, subject: msg.subject, text: msg.text }),
    });
    const out = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: res.ok, id: out.id ?? null };
  } catch {
    return { ok: false, id: null };
  }
}
