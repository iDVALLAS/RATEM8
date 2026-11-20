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
import { ruleFor, ruleForStates, STATE_ZONES } from "./rules";

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
    /**
     * D6: the date a loan closed with the loan officer's CURRENT company, from
     * their own loan system (pipeline sync). An established business
     * relationship belongs to the company the loan closed with, so a recruit's
     * loans from a previous employer never count. It only ever covers hand-dialed
     * calls (do-not-call), never texts or AI calls.
     */
    ebrClosedOn: string | null;
    /** D13: the state their phone's area code points to (CT, FL and others presume residence from it). */
    areaState?: string | null;
    /** D13: when they last said no to a sales call (WA: no sales calls for a year after). */
    declinedCallAt?: string | null;
    /** D21: the latest of when permission was given and their last message to us. */
    lastConfirmedOn?: string | null;
  };
  /** D21: the Reassigned Numbers Database answer, if checked. */
  rnd?: { result: "no" | "yes" | "no_data"; since: string; checkedAt: string } | null;
  /**
   * D13: state rules that stay closed until the owner records counsel's
   * clearance (ledger §B): Texas telephone-solicitor registration (Bus. &
   * Com. ch. 302), Arizona telephone solicitation (A.R.S. 44-1271 et seq.),
   * and AI-voice calls to California (Pub. Util. 2871–2876).
   */
  clearances?: { tx302: boolean; azPhone: boolean; caAiVoice: boolean };
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

/** Inside the calling window in every zone the state spans (and, D13, every other state that applies). */
export function inWindow(state: string | null, now: Date, purpose: Purpose, extra: (string | null | undefined)[] = []): boolean {
  const base = state ? STATE_ZONES[state] : undefined;
  if (!base) return false;
  const others = extra.filter((s): s is string => !!s && s !== state);
  const zones = [...new Set([...base, ...others.flatMap((s) => STATE_ZONES[s] ?? [])])];
  const r = others.length ? ruleForStates([state, ...others]) : ruleFor(state);
  return zones.every((z) => {
    const { day, minutes } = localHM(now, z);
    const w = day === 0 && purpose === "marketing" && r.sunday !== undefined ? r.sunday : { start: r.start, end: r.end };
    return !!w && minutes >= w.start * 60 && minutes < w.end * 60;
  });
}

function nextWindow(state: string | null, now: Date, purpose: Purpose, extra: (string | null | undefined)[] = []): string | null {
  for (let m = 15; m <= 7 * 24 * 60; m += 15) {
    const t = new Date(now.getTime() + m * 60_000);
    if (inWindow(state, t, purpose, extra)) return t.toISOString();
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
    recordingNotice: allowed && (i.channel === "call" || i.channel === "ai_call") && ruleForStates([i.contact.state, i.contact.areaState ?? null]).allPartyRecording,
    retryAt,
  });
  const c = i.contact;
  const phone = PHONE.includes(i.channel);
  const marketing = i.purpose === "marketing";
  // D13: every state whose law may apply; the strictest rule wins.
  const states = [...new Set([c.state, c.areaState].filter((s): s is string => !!s))];
  const r = ruleForStates(states);
  const clear = i.clearances ?? { tx302: false, azPhone: false, caAiVoice: false };
  const recentEbr = !!c.ebrClosedOn && monthsBetween(c.ebrClosedOn, i.now) <= 18;

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
    else if (granted && (!r.salesNeedWritten || WRITTEN.includes(ev!))) basis = `call permission (${ev})${when}`;
    else if (recentEbr) basis = "established business relationship (a loan closed with your current company in the last 18 months)";
    // D13: Connecticut: written permission, or an existing customer of your current company, for any sales call.
    else if (r.salesNeedWritten) reasons.push("Connecticut needs written permission for sales calls, except to an existing customer of your current company. Record their written permission first.");
    // Owner decision 2026-11-18: hand-dialed calls to your own past clients are fine. The do-not-call check below still applies.
    else if (c.relationship === "past_client") basis = "your own past client, on a call you place yourself";
    else reasons.push("A sales call to someone without permission needs a loan closed with your current company in the last 18 months, or for them to be your past client. Record their permission first.");
  } else if (i.channel === "text") {
    if (!granted) reasons.push("No permission to text on file.");
    else if (marketing && !WRITTEN.includes(ev!)) reasons.push("Marketing texts need written permission (a signed form, a web form or a texted yes), not just your word.");
    else basis = `text permission (${ev})${when}`;
  } else if (i.channel === "ai_call") {
    if (!granted) reasons.push("No permission for recorded or AI-voice calls (voicemail drops, M8) on file.");
    else if (!PROOF.includes(ev!)) reasons.push("Recorded and AI-voice calls need proof of permission, not just your word.");
    else if (marketing && !WRITTEN.includes(ev!)) reasons.push("Recorded and AI-voice calls with an offer need written permission (a signed form, a web form or a texted yes).");
    else basis = `AI call permission (${ev})${when}`;
  }
  // D21: reassigned numbers (47 CFR 64.1200(m)). A number disconnected since permission was given may belong to
  // someone else now. For texts and AI calls (which rest on permission), permission or a two-way conversation older
  // than 90 days needs a check of the database first, done on or after that date and in the last 30 days.
  if (phone && i.rnd?.result === "yes") reasons.push(`This number was permanently disconnected after ${i.rnd.since.slice(0, 10)} (Reassigned Numbers Database), so it may belong to someone else now. Get their current number.`);
  else if ((i.channel === "text" || i.channel === "ai_call") && c.lastConfirmedOn && i.now.getTime() - Date.parse(c.lastConfirmedOn) > 90 * 24 * 3600 * 1000) {
    const fresh = i.rnd && i.rnd.result !== "yes" && i.now.getTime() - Date.parse(i.rnd.checkedAt) <= 30 * 24 * 3600 * 1000 && i.rnd.since.slice(0, 10) <= c.lastConfirmedOn.slice(0, 10);
    if (!fresh) reasons.push(`Their permission (or last message) is from ${c.lastConfirmedOn.slice(0, 10)}, more than 90 days ago. Check the Reassigned Numbers Database for this number since that date first.`);
  }
  // D13: state switches that stay closed until counsel clears them.
  if (marketing && phone && states.includes("TX") && !clear.tx302) reasons.push("Texas: sales calls and texts need telephone-solicitor registration (Bus. & Com. ch. 302) or a confirmed exemption. The owner turns this on once counsel confirms.");
  if (marketing && phone && states.includes("AZ") && !clear.azPhone) reasons.push("Arizona: sales calls and texts wait for counsel to confirm the state's telephone solicitation rules (A.R.S. 44-1271). The owner turns this on once cleared.");
  if (i.channel === "ai_call" && states.includes("CA") && !clear.caAiVoice) reasons.push("California: recorded and AI-voice calls wait for counsel (Pub. Util. Code 2871–2876).");
  // D13: Washington: after a no, no sales calls for a year.
  if (marketing && i.channel === "call" && r.noCallYearAfterNo && c.declinedCallAt && i.now.getTime() - Date.parse(c.declinedCallAt) < 365 * 24 * 3600 * 1000) reasons.push(`They said no to a call on ${c.declinedCallAt.slice(0, 10)}. Washington doesn't allow another sales call for a year (RCW 80.36.390).`);
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
    // On a list: written permission, or (for a call you dial yourself) a loan closed with your current company in the last 18 months (47 CFR 64.1200(f)(5)).
    else if (i.dnc!.onList && !(granted && WRITTEN.includes(ev!)) && !(i.channel === "call" && i.manual && recentEbr))
      reasons.push(i.channel === "call" && c.relationship === "past_client" ? "The number is on a do-not-call list. A past client on the list needs written permission, or a loan closed with your current company in the last 18 months." : "The number is on a do-not-call list and there's no written permission.");
  }

  // 5. Frequency caps, for marketing (D13: the strictest state; counts are per phone number across the platform).
  if (marketing && (i.channel === "call" || i.channel === "ai_call") && i.sent.callsLast24h >= r.callsPerDay) reasons.push(`Already ${i.sent.callsLast24h} calls in 24 hours (the limit is ${r.callsPerDay}).`);
  if (marketing && i.channel === "text") {
    if (i.sent.textsLast24h >= r.textsPerDay) reasons.push(`Already texted today (the limit is ${r.textsPerDay} a day).`);
    else if (i.sent.textsLast7d >= r.textsPerWeek) reasons.push(`Already ${i.sent.textsLast7d} texts this week (the limit is ${r.textsPerWeek}).`);
  }
  if (reasons.length) return out(false);

  // 6. Quiet hours (phone only; service texts and calls follow them too).
  if (phone && !inWindow(c.state, i.now, i.purpose, [c.areaState])) {
    reasons.push(c.state && STATE_ZONES[c.state] ? `Outside ${hour(r.start)}–${hour(r.end)} their local time${states.length > 1 ? ` (the strictest of ${states.join(" and ")})` : ""}.` : "Their time zone isn't known (no property state).");
    return out(false, null, nextWindow(c.state, i.now, i.purpose, [c.areaState]));
  }
  return out(true, basis);
}
