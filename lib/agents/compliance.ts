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
import { findRateMentions } from "@/lib/m8/guard";
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

/**
 * D84: the Business Manager's lead-source moves (and D85–D86's plan wording). Never tie a gift to a referral or call
 * it the cost of one, never suggest paying anyone for referrals (RESPA section 8) or buying trigger leads or
 * credit-inquiry data, never suggest contacting leads without their permission, and no rates.
 */
const LEAD_MOVE: [RegExp, string][] = [
  [/\bgifts?\b[^.\n]{0,80}\breferr|\breferr\w*[^.\n]{0,80}\bgifts?\b/i, "ties a gift to referrals"],
  [/\b(cost|price)\s+(of|per)\s+(a\s+)?referrals?\b/i, "describes spending as the cost of a referral"],
  [/\b(pay|paying|paid|buy|buying|reward\w*|compensat\w*|incentiv\w*|split\w*)\b[^.\n]{0,40}\breferr/i, "suggests paying for referrals (RESPA section 8)"],
  [/\b(referral|finder'?s?)\s+(fee|bonus|reward|payment)s?\b|\bkickbacks?\b|\bexclusive\s+(deal|arrangement|partnership)s?\b/i, "suggests paying for referrals (RESPA section 8)"],
  [/\btrigger(ed)?[\s-]*leads?\b|\bcredit[\s-]*(inquiry|pull)\s+(data|lists?|leads?|files?)\b|\binquiry\s+(data|lists?)\b/i, "suggests trigger leads or credit-inquiry data"],
  [/\b(call|text|email|message|contact|reach|dial)\w*\b[^.\n]{0,60}\bwithout\s+(their\s+|the\s+)?(permission|consent)\b|\bignore\s+(the\s+|their\s+)?(consent|permission|opt[\s-]?outs?|do[\s-]not[\s-]call)\b/i, "suggests contacting leads without permission"],
  [/\binterest\s+rates?\b|\bAPR\b|\brates?\s+(of|at|from)\s+\d/i, "mentions a rate"],
];

export function reviewLeadMove(text: string): Review {
  if (!text.trim()) return { ok: false, reason: "is empty" };
  for (const [re, why] of LEAD_MOVE) if (re.test(text)) return { ok: false, reason: why };
  if (findRateMentions(text).length) return { ok: false, reason: "mentions a rate" };
  return { ok: true };
}

/** A move is either fine as is, or held with Compliance's reason. */
export function reviewMove(m: Pick<Move, "kind" | "body" | "subject" | "channel"> & Partial<Pick<Move, "key" | "title" | "why">>, to: "client" | "agent"): Review {
  // D84: a lead-source move is judged on its own words (title and why); it never carries a message.
  if (m.key?.startsWith("lead-source:")) return reviewLeadMove(`${m.title ?? ""}\n${m.why ?? ""}\n${m.body}`);
  if (m.kind === "send" || m.kind === "draft") return reviewMessage(m.body, m.subject, to);
  if (m.kind === "spend") return { ok: true };
  return { ok: true };
}
