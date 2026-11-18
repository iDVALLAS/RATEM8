/**
 * lib/concierge/guard.ts — what the Concierge may write or remember (D8).
 * Client-safe and pure.
 *
 * Fair lending (ECOA, Fair Housing Act): the Concierge never infers, stores
 * or acts on a protected characteristic or a close proxy for one, even when a
 * client mentions it. A note or draft that touches one is refused; the loan
 * officer can still talk to their client as a person, by hand.
 */
import { guardReply } from "@/lib/m8/guard";
import { redactChatInput } from "@/lib/m8/redact";

/** Words that point to a protected characteristic or a close proxy. Deliberately broad. */
const PROTECTED: [RegExp, string][] = [
  [/\b(pregnan\w*|expecting a|new ?born|baby|babies|kids?|children|child|son|daughter|toddler|school[- ]age)\b/i, "family status"],
  [/\b(married|marriage|wedding|divorc\w*|separat(ed|ion)|widow\w*|spouse|husband|wife|fianc\w*|partner'?s? income|single (mom|dad|parent))\b/i, "marital status"],
  [/\b(religio\w*|church|mosque|synagogue|temple|faith|pray\w*|christian|muslim|jewish|hindu|buddhist|catholic|mormon)\b/i, "religion"],
  [/\b(disab\w*|wheelchair|handicap\w*|blind|deaf|illness|cancer|chemo\w*|diagnos\w*|medical|hospital\w*|surgery|therapy|pregnancy|dementia|autis\w*|ssdi|ssi)\b/i, "health or disability"],
  [/\b(\d{2} ?(years? old|yo)|elderly|senior citizen|retire\w*|social security|medicare|aarp)\b/i, "age"],
  [/\b(race|racial|black|white|hispanic|latin[oax]|asian|african|caucasian|native american|ethnic\w*|immigra\w*|citizenship|green card|visa|national origin|accent|speaks? (spanish|chinese|vietnamese|korean|tagalog|russian))\b/i, "race or national origin"],
  [/\b(gay|lesbian|transgender|sexual orientation|gender identity|nonbinary)\b/i, "sex or orientation"],
  [/\b(food stamps|snap benefits|welfare|section 8|public assistance|housing voucher|unemployment benefits|child support|alimony)\b/i, "public assistance or support income"],
];

export function protectedTopic(text: string): string | null {
  for (const [re, label] of PROTECTED) if (re.test(text)) return label;
  return null;
}

export type DraftCheck = { ok: true; text: string } | { ok: false; reason: string };

/** A text the Concierge drafts for the loan officer to send. */
export function checkDraft(raw: string): DraftCheck {
  const text = redactChatInput(raw.trim()).text.replace(/\s+\n/g, "\n").slice(0, 640);
  if (!text) return { ok: false, reason: "empty draft" };
  const topic = protectedTopic(text);
  if (topic) return { ok: false, reason: `touches ${topic}` };
  // No rate, APR or promise outside a priced result (none is attached to drafts).
  const g = guardReply(text, new Set(), new Set(), false, false);
  if (!g.ok) return { ok: false, reason: `the output guard refused it (${g.reason})` };
  if (/\b(pre-?approved|approved|guarantee\w*|lock(ed)? (in )?your rate)\b/i.test(text)) return { ok: false, reason: "sounds like a promise" };
  return { ok: true, text };
}

/** A fact the client stated, to remember. The quote must be in their own message. */
export function checkMemory(fact: string, quote: string, messages: string[]): { ok: true } | { ok: false; reason: string } {
  const topic = protectedTopic(`${fact} ${quote}`);
  if (topic) return { ok: false, reason: `touches ${topic}` };
  if (fact.trim().length < 4 || fact.length > 240) return { ok: false, reason: "too short or too long" };
  const q = quote.trim().toLowerCase();
  if (q.length < 4 || !messages.some((m) => m.toLowerCase().includes(q))) return { ok: false, reason: "the quote isn't in the client's own messages" };
  return { ok: true };
}
