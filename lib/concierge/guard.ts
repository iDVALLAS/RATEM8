/**
 * lib/concierge/guard.ts — what the Concierge may write or remember (D8,
 * hardened in D8.1). Client-safe and pure.
 *
 * Fair lending (ECOA, Fair Housing Act): the Concierge never infers, stores
 * or acts on a protected characteristic or a close proxy for one. When a
 * client raises one, the message goes to the loan officer to answer
 * personally (it is never silently ignored: "can my Social Security count?"
 * deserves a real answer, from a person). The loan officer can always talk
 * to their client as a person, by hand.
 *
 * D8.1 (research 2026-11-18): names and places are taken out before the
 * scan (so "Hi Christian", Temple TX and White Salmon pass); every string a
 * model writes is checked, not only drafts; drafts may carry only the loan
 * officer's own links and numbers, and no dollar figures or calendar dates.
 */
import { findRateMentions, guardReply } from "@/lib/m8/guard";
import { redactChatInput } from "@/lib/m8/redact";
import { ccAllMlos, CONFIG } from "@/lib/config";
import { SPONSOR } from "@/config/licensing";

/** Bump when the rules change; recorded on every approval. */
export const GUARD_VERSION = "d8.1-2026-11-18";

/** Words that point to a protected characteristic or a close proxy. Deliberately broad. */
const PROTECTED: [RegExp, string][] = [
  [/\b(pregnan\w*|expecting a|new ?born|baby|babies|kids?|children|child|son|daughter|toddler|twins|school[- ]age|stepkids?|grandkids?|grandchild\w*)\b/i, "family status"],
  [/\b(married|marriage|wedding|divorc\w*|separat(ed|ion)|widow\w*|spouse|husband|hubby|wife|wifey|fianc\w*|partner'?s? income|single (mom|dad|parent)|ex-?(wife|husband))\b/i, "marital status"],
  [/\b(religio\w*|church|mosque|synagogue|faith|pray\w*|christian(ity)?|muslim|islam\w*|jewish|judaism|hindu|buddhist|catholic|mormon|lds|creed|christmas|easter|ramadan|hanukk?ah|diwali|passover|eid|sabbath)\b/i, "religion"],
  [/\b(disab\w*|wheelchair|handicap\w*|blind|deaf|illness|cancer|chemo\w*|diagnos\w*|medical|hospital\w*|surgery|therapy|pregnancy|dementia|autis\w*|ssdi|ssi|accessib\w* (ramp|bathroom|remodel))\b/i, "health or disability"],
  [/\b(\d{2} ?(years? old|yo)|elderly|senior citizen|retire(d|e|es|ment|ing)?\b(?! (my|the|your|a|that|this|our) (heloc|loan|debt|mortgage|balance|card))|social security|medicare|aarp|pension)\b/i, "age"],
  [/\b(race|racial|(black|white|brown) (family|families|people|neighborhoods?|communit(y|ies)|buyers?|owners?)|hispanic|latin[oax]|asian|african|caucasian|native american|ethnic\w*|immigra\w*|citizenship|green card|(work|student|tourist) visa|national origin|accent|speaks? (spanish|chinese|vietnamese|korean|tagalog|russian)|en español|habla español)\b/i, "race or national origin"],
  [/\b(gay|lesbian|transgender|sexual orientation|gender identity|nonbinary)\b/i, "sex or orientation"],
  [/\b(food stamps|snap benefits|welfare|section ?8|hcv|public assistance|housing (choice )?voucher|unemployment benefits|child support|alimony|spousal support)\b/i, "public assistance or support income"],
];

/** Names and places to take out before scanning (a client named Faith, a home in Temple, TX). */
export type ScanContext = { names?: (string | null | undefined)[]; places?: (string | null | undefined)[] };

function scrub(text: string, ctx: ScanContext): string {
  let t = text;
  for (const w of [...(ctx.names ?? []), ...(ctx.places ?? [])]) {
    const s = (w ?? "").trim();
    if (s.length < 2) continue;
    t = t.replace(new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "X");
  }
  return t;
}

export function protectedTopic(text: string, ctx: ScanContext = {}): string | null {
  const t = scrub(text, ctx);
  for (const [re, label] of PROTECTED) if (re.test(t)) return label;
  return null;
}

/** A hard life event: the loan officer replies personally; no drafts and no marketing for 30 days. */
const HARDSHIP = /\b(passed away|died|funeral|lost (my|our|his|her) (job|husband|wife|mom|dad|mother|father)|laid off|got fired|lost work|behind on (the |my |our )?(payments?|mortgage)|can'?t (make|pay|afford) (the |my |our )?(payments?|mortgage)|foreclos\w*|bankrupt\w*|in the hospital|cancer|divorc\w*|separat(ed|ing))\b/i;
export const isHardship = (text: string) => HARDSHIP.test(text);

/** URLs, emails and phone numbers in a string. */
const URL_RE = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/** The only links and numbers a draft may carry: the loan officers' own booking and application links, the site, and their lines. */
export function allowedLinks(): { urls: string[]; phones: string[] } {
  const urls = [CONFIG.siteUrl, ...ccAllMlos().flatMap((m) => [m.calendly, m.applicationUrl])].filter((u) => /^https:\/\/[^\s[\]]+$/.test(u ?? "")).map((u) => u.replace(/\/$/, "").toLowerCase());
  const phones = [SPONSOR.phone, ...ccAllMlos().map((m) => m.phone)].filter(Boolean).map((p) => digits(String(p)));
  return { urls, phones };
}

/** Links and numbers that aren't the loan officers' own, or null. */
export function foreignContact(text: string): string | null {
  const ok = allowedLinks();
  for (const u of text.match(URL_RE) ?? []) {
    const low = u.toLowerCase().replace(/[.,;:!?]+$/, "");
    if (!ok.urls.some((a) => low === a || low.startsWith(`${a}/`) || low.startsWith(`${a}?`))) return "a link that isn't yours";
  }
  if (EMAIL_RE.test(text)) return "an email address";
  for (const p of text.match(PHONE_RE) ?? []) if (!ok.phones.includes(digits(p))) return "a phone number that isn't yours";
  return null;
}

const MONTH = "(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)";
const DATE_RE = new RegExp(`\\b${MONTH}\\.? \\d{1,2}(st|nd|rd|th)?\\b|\\b\\d{1,2}/\\d{1,2}(/\\d{2,4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`, "i");
const DOLLARS = /\$\s?\d/;

const PROMISE_WORDS = /\b(pre-?approved|approved|guarante\w*|lock(ed)? (in )?your rate|you(?:'ll| will) (qualify|be approved|close)|no[- ]cost|odds|chances? of (approval|qualifying)|underwriting will|the appraisal will)\b/i;
/** Never-list (research 2026-11-18): rewards for referrals, product recommendations. */
const NEVER = /\b(gift cards?|reward|referral bonus|thank-you gift|you should (get|take|choose) (a|an|the) (heloc|arm|fha|va|cash-?out|refi\w*))\b/i;

export type DraftCheck = { ok: true; text: string } | { ok: false; reason: string };

/** A text the Concierge drafts for the loan officer to send. */
export function checkDraft(raw: string, ctx: ScanContext = {}): DraftCheck {
  const text = redactChatInput(String(raw ?? "").trim()).text.replace(/\s+\n/g, "\n").slice(0, 640);
  if (!text) return { ok: false, reason: "empty draft" };
  const topic = protectedTopic(text, ctx);
  if (topic) return { ok: false, reason: `touches ${topic}` };
  // No rate, APR or promise outside a priced result (none is attached to drafts).
  const g = guardReply(text, new Set(), new Set(), false, false);
  if (!g.ok) return { ok: false, reason: `the output guard refused it (${g.reason})` };
  if (PROMISE_WORDS.test(text)) return { ok: false, reason: "sounds like a promise" };
  if (NEVER.test(text)) return { ok: false, reason: "offers a reward or recommends a product" };
  // On the raw text: redaction masks digit runs, which would hide a phone number.
  const fc = foreignContact(String(raw ?? ""));
  if (fc) return { ok: false, reason: `carries ${fc}` };
  if (DOLLARS.test(text)) return { ok: false, reason: "carries a dollar figure" };
  if (DATE_RE.test(text)) return { ok: false, reason: "carries a date" };
  return { ok: true, text };
}

/** Any other string a model writes (why, a reminder, an answer): no protected topic, promise, rate or foreign contact. */
export function checkNote(raw: string, ctx: ScanContext = {}): DraftCheck {
  const text = redactChatInput(String(raw ?? "").trim()).text.replace(/\s+/g, " ").slice(0, 400);
  if (!text) return { ok: false, reason: "empty" };
  const topic = protectedTopic(text, ctx);
  if (topic) return { ok: false, reason: `touches ${topic}` };
  const g = guardReply(text, new Set(), new Set(), false, true);
  if (!g.ok) return { ok: false, reason: g.reason };
  if (PROMISE_WORDS.test(text)) return { ok: false, reason: "sounds like a promise" };
  const fc = foreignContact(String(raw ?? ""));
  if (fc) return { ok: false, reason: `carries ${fc}` };
  return { ok: true, text };
}

/**
 * D84–D85: lead-source advice (the Business Manager's moves, the planner's wording and the Concierge's answers on
 * Lead sources). Never tie a gift to a referral or call it the cost of one (owner decision 3: closing gifts are
 * allowed, never tied to referrals), never suggest paying anyone for referrals or an "exclusive" deal that works as a
 * referral payment (RESPA section 8), never trigger leads or credit-inquiry data, never contacting leads without their
 * permission, and no rates. Detectors, not copy: banned words are spelled in pieces so check:copy passes.
 */
/** "referral", "referred", "refers", "refer". */
const REFERR = "refer(?:r|s\\b|\\b)";
export const LEAD_ADVICE: [RegExp, string][] = [
  [new RegExp(`\\bgifts?\\b[^.\\n]{0,80}\\b${REFERR}|\\b${REFERR}\\w*[^.\\n]{0,80}\\bgifts?\\b`, "i"), "ties a gift to referrals"],
  [/\b(gifts?|lunch(es)?|dinners?|tickets?|gift\s*cards?|bonus(es)?|perks?|swag)\b[^.\n]{0,60}\b(for|in exchange for|in return for|when(ever)? they|every time they|if they|each time they)\b[^.\n]{0,30}\b(send|sends|sent|bring|brings|hand|hands|steer|steers|refer\w*)\b/i, "ties a gift to referrals"],
  [/\b(cost|price)\s+(of|per)\s+(a\s+)?referrals?\b/i, "describes spending as the cost of a referral"],
  [new RegExp(`\\b(pay|paying|paid|buy|buying|reward\\w*|compensat\\w*|incentiv\\w*|split\\w*)\\b[^.\\n]{0,40}\\b${REFERR}`, "i"), "suggests paying for referrals (RESPA section 8)"],
  [new RegExp(`\\b(refer{2}al|finder'?s?)\\s+(fee|bonus|reward|payment)s?\\b|\\bkick-?backs?\\b|\\bexclusive\\s+(deal|arrangement|partnership|agreement)s?\\b`, "i"), "suggests paying for referrals (RESPA section 8)"],
  [/\b(pay|paying|paid|give|giving|send|sending|offer|offering)\b[^.\n]{0,30}\b(real estate agents?|agents?|realtors?|brokers?|builders?|title (reps?|officers?)|escrow officers?)\b[^.\n]{0,40}\b(for|per|each)\b[^.\n]{0,20}\b(lead|leads|client|clients|deal|deals|buyer|buyers|loan|loans|closing|closings)\b/i, "suggests paying for referrals (RESPA section 8)"],
  [/\bexclusive\b[^.\n]{0,60}\b(real estate agents?|agents?|realtors?|brokers?|builders?)\b|\b(real estate agents?|agents?|realtors?|brokers?|builders?)\b[^.\n]{0,60}\bexclusive\b/i, "suggests an exclusive deal that works as a referral payment (RESPA section 8)"],
  [/\btrigger(ed)?[\s-]*leads?\b|\bcredit[\s-]*(inquiry|inquiries|pull|pulls|bureau)\s+(data|lists?|leads?|files?|alerts?)\b|\binquiry\s+(data|lists?|leads?|alerts?)\b|\b(buy|buying|purchase|purchasing)\b[^.\n]{0,30}\bcredit\s+(data|lists?|inquir\w*)\b/i, "suggests trigger leads or credit-inquiry data"],
  [/\b(call|text|email|message|contact|reach|dial|blast|robocall)\w*\b[^.\n]{0,60}\b(without|no)\s+(their\s+|the\s+|any\s+)?(permission|consent|opt[\s-]?ins?)\b|\bignor\w*\s+(the\s+|their\s+)?(consent|permission|opt[\s-]?outs?|do[\s-]not[\s-]call|dnc|stops?)\b|\b(call|text|email|message|contact|dial)\w*\b[^.\n]{0,60}\b(don'?t|do not|didn'?t|did not|never)\s+(give|gave|have|had|say|said)\s+(me\s+|you\s+)?(permission|consent|yes)\b|\b(call|text|dial)\w*\b[^.\n]{0,40}\b(who|that)\s+(said|texted|replied)\s+stop\b|\b(get around|bypass|skip|work around)\b[^.\n]{0,30}\b(consent|permission|opt[\s-]?outs?|do[\s-]not[\s-]call|dnc)\b/i, "suggests contacting leads without permission"],
  [/\binterest\s+rates?\b|\bAPR\b|\brates?\s+(of|at|from)\s+\d|\bmortgage\s+rates?\b|\brate\s+(quotes?|sheets?|locks?)\b|\bquot\w*\b[^.\n]{0,30}\brates?\b/i, "mentions a rate"],
];

/** The first lead-advice rule a text breaks, or null. Rates are also caught by `findRateMentions` where this runs. */
export function leadAdviceIssue(text: string): string | null {
  for (const [re, why] of LEAD_ADVICE) if (re.test(text)) return why;
  return null;
}

export type LeadQuestionIssue = { code: "trigger" | "referral" | "gift" | "contact" | "rate" | "protected"; reason: string };

/**
 * D85: a question on Lead sources the Concierge won't take to the model at all: one that asks how to do something
 * the guard would never let an answer recommend, a rate, or a protected trait (fair housing: ads and audiences are
 * never aimed by who people are).
 */
export function leadQuestionIssue(q: string): LeadQuestionIssue | null {
  const why = leadAdviceIssue(q);
  if (why) {
    const code: LeadQuestionIssue["code"] = /trigger/.test(why) ? "trigger" : /gift/.test(why) ? "gift" : /without permission/.test(why) ? "contact" : /rate/.test(why) && !/RESPA/.test(why) ? "rate" : "referral";
    return { code, reason: why };
  }
  // A question about rates (not "conversion rate" or "close rate").
  if (findRateMentions(q).length) return { code: "rate", reason: "mentions a rate" };
  if (/\b(what|which|best|lowest|good|today'?s|current|par|note)\s+(interest\s+)?rates?\b|\brates?\s+(should|to)\s+(i\s+)?(quote|offer|give)\b|\bwhat\s+rate\b/i.test(q) && !/\b(conversion|close|closing|response|contact|answer|pull[- ]?through|success)\s+rates?\b/i.test(q)) return { code: "rate", reason: "mentions a rate" };
  // A trigger-shaped question that names the bureaus' data without the words above.
  if (/\b(credit\s+bureau|equifax|experian|transunion)\b[^.?\n]{0,40}\b(leads?|lists?|data|alerts?)\b/i.test(q)) return { code: "trigger", reason: "suggests trigger leads or credit-inquiry data" };
  if (/\b(pay|paying|reward|compensat\w*|kick\w*)\b[^.?\n]{0,30}\b(real estate agents?|realtors?|agents?)\b/i.test(q)) return { code: "referral", reason: "suggests paying for referrals (RESPA section 8)" };
  const topic = protectedTopic(q);
  if (topic) return { code: "protected", reason: `touches ${topic}` };
  return null;
}

/** A fact the client stated, to remember. The quote must be in their own message. */
export function checkMemory(fact: string, quote: string, messages: string[], ctx: ScanContext = {}): { ok: true } | { ok: false; reason: string } {
  const topic = protectedTopic(`${fact} ${quote}`, ctx);
  if (topic) return { ok: false, reason: `touches ${topic}` };
  if (fact.trim().length < 4 || fact.length > 240) return { ok: false, reason: "too short or too long" };
  const n = checkNote(fact, ctx);
  if (!n.ok) return { ok: false, reason: n.reason };
  // D8.1: a real quote, not a few letters: at least three words, found in one of their messages.
  const q = quote.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.split(" ").length < 3 || !messages.some((m) => m.toLowerCase().replace(/\s+/g, " ").includes(q))) return { ok: false, reason: "the quote isn't in the client's own messages" };
  return { ok: true };
}
