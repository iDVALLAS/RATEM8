/**
 * lib/leads/alert.ts — "New lead" alerts to the loan officer (D79).
 * SERVER-ONLY.
 *
 * Speed to lead: when a lead vendor or web form sends a new person, the
 * loan officer hears about it right away by text, email or both (their
 * setting; email by default), with a link to the person's page. The alert
 * goes to the loan officer, not the lead, so it isn't a message to a
 * consumer and needs no consent from the lead. It still carries as little
 * as the morning email does: first name, state and where the lead came
 * from. Never their phone, email or what they wrote.
 *
 *  - "off" sends nothing (and drops anything waiting).
 *  - Outside the loan officer's notification hours it waits, and goes as one
 *    alert when the hours open (the morning run, or their next page view).
 *  - At most ALERTS_PER_HOUR alerts an hour; a burst waits and goes as one.
 *  - A text needs texting set up for their company and their mobile number,
 *    and never goes to a number that texted STOP; when a text can't go, the
 *    alert goes by email so the lead isn't missed.
 */
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { CONFIG } from "@/lib/config";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { incr } from "@/lib/m8/kv";
import { inHours, zoneLabel } from "@/lib/inbox/state";
import { holdAlert, prefsFor, takeHeld, type Prefs } from "@/lib/profile/prefs";
import { leadAlertCopy as la } from "@/lib/content/inbox";

export const ALERTS_PER_HOUR = 10;

export type AlertMail = (m: { to: string; subject: string; text: string }) => Promise<boolean>;
export type AlertSms = (to: string, body: string, user: User) => Promise<boolean>;
export type AlertDeps = { mail?: AlertMail; sms?: AlertSms };
export type AlertOutcome = { outcome: "sent" | "held" | "off" | "failed"; via: ("email" | "text")[] };

const base = () => CONFIG.siteUrl.replace(/\/$/, "");
/** Lead-supplied words (a name, a vendor) cut to plain letters, so an alert can't carry a link or anything else. */
const plain = (s: string | null | undefined, max = 30) => (s ?? "").normalize("NFKC").replace(/[^\p{L}\p{N} .&'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);

/** "Maria, WA, from Zillow" — first name, state and source only. */
export function leadLabel(c: Pick<Contact, "firstName" | "state" | "source">): string {
  const vendor = plain((c.source ?? "").replace(/^lead:\s*/i, ""));
  return [plain(c.firstName) || la.someone, /^[A-Z]{2}$/.test(c.state ?? "") ? c.state : null].filter(Boolean).join(", ") + (vendor ? `, ${la.from(vendor)}` : "");
}

export const contactUrl = (id: string) => `${base()}/mlo/contacts/${encodeURIComponent(id)}`;

/** One lead: the text and the email. */
export function alertOne(c: Pick<Contact, "id" | "firstName" | "state" | "source">): { subject: string; text: string; sms: string } {
  const label = leadLabel(c);
  return { subject: la.subject(label), sms: la.sms(label, contactUrl(c.id)), text: [la.sms(label, contactUrl(c.id)), "", la.footer(`${base()}/mlo/settings`)].join("\n") };
}

/** Several leads that waited: one alert. */
export function alertMany(cs: Pick<Contact, "id" | "firstName" | "state" | "source">[]): { subject: string; text: string; sms: string } {
  if (cs.length === 1) return alertOne(cs[0]);
  const lines = cs.slice(0, 10).map((c) => `- ${leadLabel(c)}: ${contactUrl(c.id)}`);
  const more = cs.length > 10 ? [la.more(cs.length - 10, `${base()}/mlo/contacts?rel=lead`)] : [];
  return { subject: la.manySubject(cs.length), sms: la.manySms(cs.length, `${base()}/mlo/inbox`), text: [la.manyIntro(cs.length), "", ...lines, ...more, "", la.footer(`${base()}/mlo/settings`)].join("\n") };
}

async function defaultMail(m: { to: string; subject: string; text: string }): Promise<boolean> {
  const { resendMail } = await import("@/lib/pilot/service");
  return resendMail(m);
}

/** Through the company's registered texting sender (the same one client texts use). */
async function defaultSms(to: string, body: string, user: User): Promise<boolean> {
  const { twilioConfig, sendSms } = await import("@/lib/messaging/twilio");
  if (!twilioConfig()) return false;
  const { textSender } = await import("@/lib/texting/service");
  const { companyOfMlo, singleCompany } = await import("@/lib/accounts/company");
  const sender = await textSender(companyOfMlo(user.mloId), singleCompany());
  if (!sender?.service) return false;
  const r = await sendSms(to, body, null, sender.service, sender.account);
  return r.ok;
}

/** Sends by the loan officer's choice. A text that can't go becomes an email. */
async function deliver(user: User, p: Prefs, msg: { subject: string; text: string; sms: string }, deps: AlertDeps): Promise<("email" | "text")[]> {
  const via: ("email" | "text")[] = [];
  let emailToo = p.leadAlert === "email" || p.leadAlert === "both";
  if (p.leadAlert === "text" || p.leadAlert === "both") {
    const { touchStore } = await import("@/lib/messaging/store");
    const stopped = p.alertPhone ? await touchStore().optedOut(p.alertPhone).catch(() => true) : true;
    const ok = !stopped && p.alertPhone ? await (deps.sms ?? defaultSms)(p.alertPhone, msg.sms, user).catch(() => false) : false;
    if (ok) via.push("text");
    else emailToo = true;
  }
  if (emailToo && (await (deps.mail ?? defaultMail)({ to: user.email, subject: msg.subject, text: msg.text }).catch(() => false))) via.push("email");
  return via;
}

/** After a new lead is saved. Never throws (a lead is never lost over an alert). */
export async function alertNewLead(user: User, c: Contact, now = new Date(), deps: AlertDeps = {}): Promise<AlertOutcome> {
  try {
    const p = await prefsFor(user);
    if (p.leadAlert === "off" || user.status !== "active" || c.ownerUserId !== user.id) return { outcome: "off", via: [] };
    const burst = (await incr(`cc:leadalert:${user.id}:${Math.floor(now.getTime() / 3_600_000)}`, 4000)) > ALERTS_PER_HOUR;
    if (burst || !inHours(now, p.timeZone, p.alertFrom, p.alertTo)) {
      await holdAlert(user, c.id, now.toISOString());
      await audit(user, now, "held", [], burst ? "burst" : "hours");
      return { outcome: "held", via: [] };
    }
    const via = await deliver(user, p, alertOne(c), deps);
    await audit(user, now, via.length ? "sent" : "failed", via, null);
    return { outcome: via.length ? "sent" : "failed", via };
  } catch {
    return { outcome: "failed", via: [] };
  }
}

/** Alerts that waited, as one, once the hours are open. Run by the morning run and on page views. */
export async function sendHeldAlerts(user: User, now = new Date(), deps: AlertDeps = {}): Promise<AlertOutcome & { leads: number }> {
  const p = await prefsFor(user);
  if (!p.held.length) return { outcome: "off", via: [], leads: 0 };
  if (p.leadAlert === "off" || user.status !== "active") {
    await takeHeld(user);
    return { outcome: "off", via: [], leads: 0 };
  }
  if (!inHours(now, p.timeZone, p.alertFrom, p.alertTo)) return { outcome: "held", via: [], leads: p.held.length };
  const held = await takeHeld(user);
  const people = (await Promise.all(held.map((h) => contactStore().get(h.contactId).catch(() => null)))).filter((c): c is Contact => !!c && c.ownerUserId === user.id);
  if (!people.length) return { outcome: "off", via: [], leads: 0 };
  const via = await deliver(user, p, alertMany(people), deps);
  await audit(user, now, via.length ? "sent" : "failed", via, `held:${people.length}`);
  return { outcome: via.length ? "sent" : "failed", via, leads: people.length };
}

/** Counts and channels only. */
async function audit(user: User, now: Date, outcome: string, via: string[], why: string | null) {
  await accountStore().audit({ at: now.toISOString(), actor: "lead-alert", action: "lead.alert", detail: { owner: user.id, outcome, via: via.join(",") || null, why } }).catch(() => undefined);
}

/** For the settings page: when alerts arrive, in words. */
export const hoursLine = (p: Pick<Prefs, "alertFrom" | "alertTo" | "timeZone">) => la.hoursLine(p.alertFrom, p.alertTo, zoneLabel(p.timeZone));
