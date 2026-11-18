/**
 * lib/send-gate/gate.ts — the send gate (D3). Client-safe and pure.
 *
 * The ONLY path by which Command Center may text, call or email anyone
 * (build prompt §2.1, §4.7). It fails closed: a missing fact (unknown
 * state, no do-not-call check, unknown time zone) blocks marketing. Every
 * decision lists its reasons in plain English, for the loan officer and for
 * the audit log.
 */
import type { ConsentSummary } from "@/lib/contacts/service";
import type { Channel, Evidence, Purpose } from "@/lib/contacts/store";
import { ruleFor, STATE_ZONES } from "./rules";

export type GateInput = {
  channel: Channel;
  purpose: Purpose;
  /** A person dialling by hand (calls from you) vs the system (texts, M8 AI calls, automated email). */
  manual: boolean;
  contact: {
    locked: boolean;
    state: string | null;
    hasPhone: boolean;
    hasEmail: boolean;
    relationship: string;
    /** Date a loan with us closed, for the established-business-relationship exception on hand calls. */
    loanClosedOn: string | null;
  };
  consent: ConsentSummary;
  /** States the sending loan officer is licensed in. */
  licensedStates: string[];
  /** Do-not-call: null means not checked in the last 31 days. */
  dnc: { onList: boolean; checkedAt: string | null } | null;
  /** Marketing touches already sent to this person on this channel family. */
  sent: { callsLast24h: number; textsLast24h: number; textsLast7d: number };
  now: Date;
};

export type GateDecision = {
  allowed: boolean;
  reasons: string[];
  /** What allowed it, for the log ("written consent 2026-11-18", "established relationship"). */
  basis: string | null;
  /** Say "this call is recorded" first (an all-party consent state). */
  recordingNotice: boolean;
  /** Next time the quiet-hours window opens, when that was the only block. */
  retryAt: string | null;
};

const PROOF: Evidence[] = ["written", "recorded_call", "web_form", "text_reply"];
/** Prior express WRITTEN consent: a signature, a web form or a texted yes (E-SIGN). A recorded "yes" isn't written. */
const WRITTEN: Evidence[] = ["written", "web_form", "text_reply"];
const PHONE: Channel[] = ["call", "ai_call", "text"];

function localHM(now: Date, zone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Inside the state's calling window in every zone the state spans. */
export function inWindow(state: string | null, now: Date, purpose: Purpose): boolean {
  const zones = state ? STATE_ZONES[state] : undefined;
  if (!zones) return false;
  const r = ruleFor(state);
  return zones.every((z) => {
    const { day, minutes } = localHM(now, z);
    const w = day === 0 && purpose === "marketing" && r.sunday !== undefined ? r.sunday : { start: r.start, end: r.end };
    return !!w && minutes >= w.start * 60 && minutes < w.end * 60;
  });
}

function nextWindow(state: string | null, now: Date, purpose: Purpose): string | null {
  for (let m = 15; m <= 7 * 24 * 60; m += 15) {
    const t = new Date(now.getTime() + m * 60_000);
    if (inWindow(state, t, purpose)) return t.toISOString();
  }
  return null;
}

const hour = (n: number) => `${n % 12 === 0 ? 12 : n % 12} ${n < 12 ? "AM" : "PM"}`;

const monthsBetween = (a: string, b: Date) => (b.getTime() - Date.parse(a)) / (30.44 * 24 * 3600 * 1000);

export function decide(i: GateInput): GateDecision {
  const reasons: string[] = [];
  const out = (allowed: boolean, basis: string | null = null, retryAt: string | null = null): GateDecision => ({
    allowed,
    reasons,
    basis: allowed ? basis : null,
    recordingNotice: allowed && (i.channel === "call" || i.channel === "ai_call") && ruleFor(i.contact.state).allPartyRecording,
    retryAt,
  });
  const c = i.contact;
  const phone = PHONE.includes(i.channel);
  const marketing = i.purpose === "marketing";

  // 1. Absolute blocks.
  if (c.locked) reasons.push("On hold: this person came from a previous employer's list that hasn't been released.");
  if (phone && !c.hasPhone) reasons.push("No valid phone number.");
  if (i.channel === "email" && !c.hasEmail) reasons.push("No email address.");
  const said = i.consent[i.channel][i.purpose];
  const revoked = (phone ? PHONE : [i.channel]).some((ch) => i.consent[ch].service.evidence === "revoked" || i.consent[ch].marketing.evidence === "revoked");
  if (revoked) reasons.push(phone ? "They said stop to calls or texts." : "They unsubscribed from email.");
  if (i.manual && i.channel !== "call") reasons.push("Only calls can be manual; texts and AI calls go through the system.");
  if (reasons.length) return out(false);

  // 2. Permission strong enough for this channel and purpose.
  let basis: string | null = null;
  const granted = said.granted ? said : null;
  const ev = granted?.evidence ?? null;
  const when = granted?.at ? ` ${granted.at.slice(0, 10)}` : "";
  if (i.channel === "email") {
    basis = granted ? `email permission (${ev})${when}` : marketing ? "commercial email with an unsubscribe link (no prior consent needed)" : "relationship email";
  } else if (i.channel === "call" && i.manual) {
    if (!marketing) basis = granted ? `call permission (${ev})${when}` : "a call you place yourself about their loan";
    else if (granted) basis = `call permission (${ev})${when}`;
    else if (c.relationship === "past_client" && c.loanClosedOn && monthsBetween(c.loanClosedOn, i.now) <= 18) basis = "established business relationship (a loan closed in the last 18 months)";
    else reasons.push("A sales call to someone without permission needs a loan with you in the last 18 months. Record their permission first.");
  } else if (i.channel === "text") {
    if (!granted) reasons.push("No permission to text on file.");
    else if (marketing && !WRITTEN.includes(ev!)) reasons.push("Marketing texts need written permission (a signed form, a web form or a texted yes), not just your word.");
    else basis = `text permission (${ev})${when}`;
  } else if (i.channel === "ai_call") {
    if (!granted) reasons.push("No permission for calls from M8 (an AI voice) on file.");
    else if (!PROOF.includes(ev!)) reasons.push("Calls from M8 need proof of permission, not just your word.");
    else if (marketing && !WRITTEN.includes(ev!)) reasons.push("Marketing calls from M8 need written permission (a signed form, a web form or a texted yes).");
    else basis = `AI call permission (${ev})${when}`;
  }
  if (reasons.length) return out(false);

  // 3. Licensing: marketing a loan only where the loan officer is licensed.
  if (marketing && i.channel !== "email") {
    if (!c.state) reasons.push("Their property state isn't known, so licensing can't be checked.");
    else if (!i.licensedStates.includes(c.state)) reasons.push(`You aren't licensed in ${c.state}.`);
  }

  // 4. Do-not-call, for marketing by phone.
  if (marketing && phone) {
    const fresh = i.dnc?.checkedAt && i.now.getTime() - Date.parse(i.dnc.checkedAt) <= 31 * 24 * 3600 * 1000;
    if (!fresh) reasons.push("Do-not-call lists haven't been checked for this number in the last 31 days.");
    else if (i.dnc!.onList && !(granted && WRITTEN.includes(ev!))) reasons.push("The number is on a do-not-call list and there's no written permission.");
  }

  // 5. Frequency caps, for marketing.
  const r = ruleFor(c.state);
  if (marketing && (i.channel === "call" || i.channel === "ai_call") && i.sent.callsLast24h >= r.callsPerDay) reasons.push(`Already ${i.sent.callsLast24h} calls in 24 hours (the limit is ${r.callsPerDay}).`);
  if (marketing && i.channel === "text") {
    if (i.sent.textsLast24h >= r.textsPerDay) reasons.push(`Already texted today (the limit is ${r.textsPerDay} a day).`);
    else if (i.sent.textsLast7d >= r.textsPerWeek) reasons.push(`Already ${i.sent.textsLast7d} texts this week (the limit is ${r.textsPerWeek}).`);
  }
  if (reasons.length) return out(false);

  // 6. Quiet hours (phone only; service texts and calls follow them too).
  if (phone && !inWindow(c.state, i.now, i.purpose)) {
    const r2 = ruleFor(c.state);
    reasons.push(c.state && STATE_ZONES[c.state] ? `Outside ${hour(r2.start)}–${hour(r2.end)} their local time.` : "Their time zone isn't known (no property state).");
    return out(false, null, nextWindow(c.state, i.now, i.purpose));
  }
  return out(true, basis);
}
