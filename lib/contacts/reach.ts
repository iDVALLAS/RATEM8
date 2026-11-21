/**
 * lib/contacts/reach.ts — how a person can be reached, in plain words (D77).
 * Client-safe and pure. The list's badge ("Can text", "Call only", "Do not
 * contact") and the contact page's one permission line ("Calls OK · Texts:
 * your word only · Email OK") come from the consent summary. They are a
 * summary only: every send still goes through the gate, which can say no
 * for other reasons (quiet hours, do-not-call, caps, licensing).
 */
import type { ConsentState, ConsentSummary } from "./service";
import type { Channel } from "./store";
import { contactPageCopy as cp } from "@/lib/content/contact-page";

const PHONE: Channel[] = ["call", "ai_call", "text"];
const stopped = (s: ConsentSummary, chs: Channel[]) => chs.some((ch) => s[ch].service.evidence === "revoked" || s[ch].marketing.evidence === "revoked");
const PROOF = new Set(["written", "recorded_call", "web_form", "text_reply"]);
/** The strongest "yes" on file for a channel (either purpose). */
const best = (a: ConsentState, b: ConsentState): "proof" | "word" | null => {
  const yes = [a, b].filter((x) => x.granted);
  if (yes.some((x) => x.evidence && PROOF.has(x.evidence))) return "proof";
  return yes.length ? "word" : null;
};

export type ReachInput = { summary: ConsentSummary; hasPhone: boolean; hasEmail: boolean; locked: boolean };
export type ReachBadge = { label: string; tone: "ok" | "warn" | "bad" };

/** One badge for the contacts list. */
export function reachBadge(r: ReachInput): ReachBadge {
  const b = cp.badge;
  if (r.locked) return { label: b.held, tone: "bad" };
  const phoneStop = stopped(r.summary, PHONE);
  const emailStop = stopped(r.summary, ["email"]);
  const phoneOk = r.hasPhone && !phoneStop;
  const emailOk = r.hasEmail && !emailStop;
  if (!phoneOk && !emailOk) return phoneStop || emailStop ? { label: b.dnc, tone: "bad" } : { label: b.none, tone: "bad" };
  if (phoneOk && best(r.summary.text.service, r.summary.text.marketing)) return { label: b.canText, tone: "ok" };
  if (phoneOk) return { label: b.callOnly, tone: "warn" };
  return { label: b.emailOnly, tone: "warn" };
}

/** The contact page's permission line: calls, texts and email, each in a few words. */
export function permissionLine(r: ReachInput): string[] {
  const l = cp.line;
  if (r.locked) return [l.held];
  const phoneStop = stopped(r.summary, PHONE);
  const calls = !r.hasPhone ? l.noPhone : phoneStop ? l.callsStopped : l.callsOk;
  const textYes = best(r.summary.text.service, r.summary.text.marketing);
  const texts = !r.hasPhone ? null : phoneStop ? l.textsStopped : textYes === "proof" ? l.textsOk : textYes === "word" ? l.textsWord : l.textsNone;
  const email = !r.hasEmail ? l.noEmail : stopped(r.summary, ["email"]) ? l.emailStopped : l.emailOk;
  return [calls, texts, email].filter((x): x is string => !!x);
}
