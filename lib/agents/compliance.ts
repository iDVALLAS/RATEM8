/**
 * lib/agents/compliance.ts — the Compliance agent (D54). Every move another
 * agent makes passes through here before it's saved, and every send passes
 * again (plus the contact rules in sendText / sendEmail). It can't be turned
 * off.
 *
 *  - Messages: the same wording rules as every draft (no rates or promises,
 *    no pressure, nothing about who a home is for).
 *  - Messages to real estate agents: nothing of value tied to referrals
 *    (RESPA section 8; the CFPB's 2020 FAQs: even small gifts count), and no
 *    co-marketing or cost-splitting offers (those need a written,
 *    fair-market-value arrangement a person sets up).
 *  - Money: a spend is always a request for the loan officer to approve.
 */
import { checkTemplate } from "@/lib/templates/service";
import type { Move } from "./store";

const RESPA: [RegExp, string][] = [
  [/\bgift\s*cards?\b|\b(starbucks|amazon|visa)\s+cards?\b/i, "offers a gift card"],
  [/\b(lunch|dinner|drinks?|coffee|tickets?|golf)\s+(is\s+|are\s+)?on\s+me\b|\bmy\s+treat\b/i, "offers something of value"],
  [/\b(refer|send)\b[^.\n]{0,40}\b(and|&)\s+(i'?ll|i\s+will|we'?ll)\s+(pay|give|send|cover|buy)/i, "ties a reward to referrals"],
  [/\b(referral|finder'?s?)\s+(fee|bonus|reward|gift)\b|\bkickback\b/i, "mentions a referral payment"],
  [/\bco-?market\w*|\bsplit\s+(the\s+)?(cost|ad|marketing)|\bpay\s+(for\s+)?(half|part)\s+of\b/i, "offers co-marketing or cost-splitting (needs a written fair-market-value agreement a person sets up)"],
  [/\bfree\s+(leads?|advertis\w*|marketing|ads?)\b/i, "offers free marketing or leads"],
];

export type Review = { ok: true } | { ok: false; reason: string };

export function reviewMessage(body: string, subject: string, to: "client" | "agent"): Review {
  if (!body.trim()) return { ok: false, reason: "the message is empty" };
  const t = checkTemplate(body, subject);
  if (!t.ok) return { ok: false, reason: t.reason };
  if (to === "agent") {
    const text = `${subject}\n${body}`;
    for (const [re, why] of RESPA) if (re.test(text)) return { ok: false, reason: `${why} (RESPA: nothing of value for referrals)` };
  }
  return { ok: true };
}

/** A move is either fine as is, or held with Compliance's reason. */
export function reviewMove(m: Pick<Move, "kind" | "body" | "subject" | "channel">, to: "client" | "agent"): Review {
  if (m.kind === "send" || m.kind === "draft") return reviewMessage(m.body, m.subject, to);
  if (m.kind === "spend") return { ok: true };
  return { ok: true };
}
