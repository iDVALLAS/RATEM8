/**
 * lib/setup/checklist.ts — "Get set up": everything a loan officer (and
 * the owner) needs before Command Center can do its work, checked against
 * the real state wherever it can be (D24). SERVER-ONLY.
 *
 * A few steps happen outside Command Center (Twilio's opt-out wording, the
 * carrier campaign approval); the loan officer marks those done themselves,
 * stored per person.
 */
import { neon } from "@neondatabase/serverless";
import type { User } from "@/lib/accounts/store";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { hasApplicationUrl, mloById } from "@/lib/config";
import { contactStore, listAll } from "@/lib/contacts/store";
import { summarize } from "@/lib/contacts/service";
import { conciergeStore } from "@/lib/concierge/store";
import { automationStore } from "@/lib/automations/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { rndNeeded } from "@/lib/messaging/service";
import { twilioConfig } from "@/lib/messaging/twilio";
import { textSender } from "@/lib/texting/service";
import { databaseUrl, emailConfig } from "@/lib/m8/server";
import { signatureFor } from "@/lib/profile/signature";
import { mailboxFor } from "@/lib/mail/service";
import { providersOn } from "@/lib/mail/oauth";
import { cardsOn } from "@/lib/cards/thanks";
import { thanksStatus } from "@/lib/cards/service";

export type SetupItem = {
  id: string;
  group: "you" | "texting" | "book" | "assistant" | "owner";
  label: string;
  why: string;
  done: boolean;
  /** A count or a detail ("12 of 40 checked"). */
  detail?: string;
  href?: string;
  /** Happens outside Command Center: the person marks it done. */
  manual?: boolean;
};

export const GROUP_LABELS: Record<SetupItem["group"], string> = { you: "You", texting: "Texting", book: "Your book", assistant: "Your Concierge", owner: "Platform (owner)" };

/** Steps marked done by hand, per person. */
export interface SetupStore {
  marks(userId: string): Promise<string[]>;
  setMark(userId: string, id: string, done: boolean): Promise<void>;
}
class MemorySetupStore implements SetupStore {
  private m = new Map<string, Set<string>>();
  async marks(u: string) {
    return [...(this.m.get(u) ?? [])];
  }
  async setMark(u: string, id: string, done: boolean) {
    const s = this.m.get(u) ?? new Set<string>();
    if (done) s.add(id);
    else s.delete(id);
    this.m.set(u, s);
  }
}
class NeonSetupStore implements SetupStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_setup_marks (user_id text NOT NULL, id text NOT NULL, PRIMARY KEY (user_id, id))`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async marks(u: string) {
    await this.init();
    return (await this.q(`SELECT id FROM cc_setup_marks WHERE user_id = $1`, [u])).map((r) => r.id as string);
  }
  async setMark(u: string, id: string, done: boolean) {
    await this.init();
    if (done) await this.q(`INSERT INTO cc_setup_marks (user_id, id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [u, id]);
    else await this.q(`DELETE FROM cc_setup_marks WHERE user_id = $1 AND id = $2`, [u, id]);
  }
}
let override: SetupStore | null = null;
let neonStore: NeonSetupStore | null = null;
const g = globalThis as unknown as { __lm8SetupMemory?: MemorySetupStore };
const memory = (g.__lm8SetupMemory ??= new MemorySetupStore());
export const setSetupStoreForTests = (s: SetupStore | null) => void (override = s);
export function setupStore(): SetupStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonSetupStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}

export const MANUAL_IDS = ["optout_wording", "campaign_approved", "rnd_account"] as const;

export async function checklist(user: User, now = new Date()): Promise<SetupItem[]> {
  const mlo = mloById(user.mloId);
  const marks = new Set(await setupStore().marks(user.id));
  const { contacts, total } = await listAll({ ownerUserId: user.id, kind: "contact" });
  const consents = await contactStore().consentsFor(contacts.map((c) => c.id));
  const withPhone = contacts.filter((c) => c.phone && !c.locked);
  const dncFresh = withPhone.filter((c) => c.dnc && now.getTime() - Date.parse(c.dnc.checkedAt) <= 31 * 86_400_000).length;
  const permitted = contacts.filter((c) => Object.values(summarize(consents.filter((e) => e.contactId === c.id))).some((p) => p.service.granted || p.marketing.granted)).length;
  const [keys, loans, s, auto, rnd, sig, box, cards] = await Promise.all([pipelineStore().keys(user.id), pipelineStore().list(user.id), conciergeStore().settings(user.id), automationStore().settings(user.id), rndNeeded(user, now), signatureFor(user).catch(() => ""), mailboxFor(user), cardsOn() ? thanksStatus(user) : Promise.resolve(null)]);
  const service = (await textSender(companyOfMlo(user.mloId), singleCompany()))?.service ?? null;
  const items: SetupItem[] = [
    { id: "record", group: "you", label: "Your account is linked to your loan officer record", why: "Licensing, your NMLS number and your sponsor come from it; without it you can't market in any state.", done: !!mlo, href: "/mlo/team" },
    { id: "portal", group: "you", label: "Your secure application and upload link is set", why: "Application texts and document requests point borrowers to it (your ARIVE borrower portal).", done: !!mlo && hasApplicationUrl(mlo) },
    { id: "booking", group: "you", label: "Your booking link is set", why: "Clients and M8 chat offer it to book time with you.", done: !!mlo && /^https:\/\//.test(mlo.calendly) },
    { id: "signature", group: "you", label: "Your email signature is set", why: "It goes under every email you send from Command Center, above the lines the law asks for.", done: !!sig.trim(), href: "/mlo/signature" },
    ...(providersOn().length || box
      ? [{ id: "mailbox", group: "you" as const, label: "Your email is connected", why: "Emails to clients go from your own Gmail or Microsoft 365 address, land in your Sent folder, and replies come back to you.", done: box?.status === "connected", detail: box ? (box.status === "connected" ? box.email : "needs reconnecting") : undefined, href: "/mlo/email" }]
      : []),
    ...(cards ? [{ id: "cards", group: "you" as const, label: "Thanks.io is connected for cards by mail", why: "Holiday cards and thank-you notes to the people you pick, paid from your own Thanks.io account.", done: cards.connected, detail: cards.reconnect ? "needs reconnecting" : undefined, href: "/mlo/cards" }] : []),
    { id: "texting", group: "texting", label: "Texting is connected for your sponsoring company", why: "Texts go out through your company's own registered Messaging Service.", done: !!twilioConfig() && !!service, href: "/mlo/texting" },
    { id: "campaign_approved", group: "texting", label: "Your Customer Care campaign is approved by the carriers", why: "Carriers filter or block texts from unregistered campaigns.", done: marks.has("campaign_approved"), href: "/mlo/texting", manual: true },
    { id: "optout_wording", group: "texting", label: "The opt-out confirmation only confirms (no \"reply START\")", why: "FCC 26-67 from 2026-11-25. Set it in your Messaging Service's Advanced Opt-Out.", done: marks.has("optout_wording"), href: "/mlo/texting", manual: true },
    { id: "loan_system", group: "book", label: "Your loan system is connected", why: "Loans, stages and dates flow in, so the Loan Journey checks steps off and your updates draft themselves.", done: keys.length > 0 && loans.length > 0, detail: keys.length ? (loans.length ? `${loans.length} loan${loans.length === 1 ? "" : "s"} in` : "key made, no loans yet") : undefined, href: "/mlo/pipeline" },
    { id: "contacts", group: "book", label: "Your contacts are imported", why: "Today, the Concierge and your scripts work from your own book.", done: total > 0, detail: total ? `${total} contact${total === 1 ? "" : "s"}` : undefined, href: "/mlo/contacts/import" },
    { id: "permission", group: "book", label: "Permission you already hold is on file", why: "Texts and M8 calls need it. Record it for past clients in one step.", done: permitted > 0, detail: total ? `${permitted} of ${total}` : undefined, href: "/mlo/contacts/permission" },
    { id: "dnc", group: "book", label: "Do-not-call checks are current", why: "Marketing by phone needs a check in the last 31 days.", done: withPhone.length > 0 && dncFresh === withPhone.length, detail: withPhone.length ? `${dncFresh} of ${withPhone.length} checked` : undefined, href: "/mlo/contacts/permission#dnc" },
    { id: "rnd_account", group: "book", label: "You can check the Reassigned Numbers Database", why: "Texts on permission older than 90 days need a check (reassigned.us, or a vendor).", done: marks.has("rnd_account"), href: "/mlo/contacts/permission#rnd", manual: true },
    { id: "rnd", group: "book", label: "Reassigned-number checks are current", why: "Old permission may reach someone else's phone.", done: permitted > 0 && rnd.length === 0, detail: rnd.length ? `${rnd.length} number${rnd.length === 1 ? "" : "s"} to check` : undefined, href: "/mlo/contacts/permission#rnd" },
    { id: "concierge", group: "assistant", label: "Your Concierge is on, with how you sound", why: "It works your book each morning and drafts in your voice; you approve everything.", done: s.enabled && !!s.voice.trim(), href: "/mlo/concierge" },
    { id: "digest", group: "assistant", label: "The morning email is on", why: "Your day in one email: who to reach, drafts waiting, loans needing a touch.", done: !!s.digest, href: "/mlo/concierge" },
    { id: "automations", group: "assistant", label: "Loan updates and follow-up are chosen", why: "Borrower and agent updates as loans move, and after-closing check-ins.", done: auto.enabled.length > 0, detail: auto.enabled.length ? `${auto.enabled.length} on` : undefined, href: "/mlo/automations" },
  ];
  if (user.role === "owner") {
    items.push(
      { id: "db", group: "owner", label: "The database is connected", why: "Without it, nothing in Command Center is kept between restarts.", done: !!databaseUrl() },
      { id: "email", group: "owner", label: "Email sending is connected (Resend)", why: "Sign-in links, the morning email and alerts.", done: !!emailConfig() },
      { id: "mail_apps", group: "owner", label: "Loan officers can connect Gmail and Microsoft 365", why: "One app registration with Google and one with Microsoft; then everyone's emails go from their own mailbox.", done: providersOn().length === 2, detail: providersOn().length === 1 ? "one of two set" : undefined, href: "/mlo/email" },
      { id: "ai_key", group: "owner", label: "Command Center has its own AI key", why: "CC_ANTHROPIC_API_KEY (Sensitive): a separate workspace with its own spend limit and zero data retention.", done: !!process.env.CC_ANTHROPIC_API_KEY?.trim() },
      { id: "cron", group: "owner", label: "The morning run is on", why: "CRON_SECRET (Sensitive) lets the daily schedule run the Concierge, recipes and email.", done: !!process.env.CRON_SECRET?.trim() },
    );
  }
  return items;
}
