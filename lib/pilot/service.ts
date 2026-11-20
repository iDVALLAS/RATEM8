/**
 * lib/pilot/service.ts — the pilot kit (D44). SERVER-ONLY.
 *
 * - "Report a problem" from any Command Center page: masked, kept, and
 *   emailed to the owner with Reply-To set to the loan officer.
 * - The owner's triage: a status and a note, emailed back to the reporter.
 * - "Your first day": six steps, each checked against the real state.
 * - The pilot overview: who has signed in, how far each person is, and
 *   how many of their reports are open.
 * - What's on right now, read from the live settings, for the welcome page.
 */
import { randomUUID } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { isAdmin } from "@/lib/accounts/auth";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { checklist, setupStore, type SetupItem } from "@/lib/setup/checklist";
import { redactChatInput } from "@/lib/m8/redact";
import { incr } from "@/lib/m8/kv";
import { alertEmail, databaseUrl, emailConfig } from "@/lib/m8/server";
import { ccAnthropicKey } from "@/lib/concierge/agent";
import { serviceForCompany, twilioConfig } from "@/lib/messaging/twilio";
import { listenOn } from "@/lib/voice/google";
import { rewardsOn } from "@/lib/membership/service";
import { productionOn } from "@/lib/membership/production";
import { REPORT_KINDS, REPORT_STATUS, reportStore, type Report, type ReportKind, type ReportStatus } from "./store";

export const pilotOn = () => process.env.CC_PILOT?.trim() === "true";

export const REPORT_MAX = 2000;
export const REPORTS_PER_HOUR = 8;
export const HIDE_MARK = "first_day_hidden";

export type Mail = { to: string; subject: string; text: string; replyTo?: string };
export type Mailer = (m: Mail) => Promise<boolean>;

export const resendMail: Mailer = async (m) => {
  const cfg = emailConfig();
  if (!cfg) {
    // LOCAL TESTING ONLY (same guard as /api/cc/dev-login): show the email in the server log so QA can follow links. Never on Vercel.
    if (process.env.CC_DEV_LOGIN === "1" && !process.env.VERCEL) console.log(`[dev-mail] ${JSON.stringify({ to: m.to, subject: m.subject, text: m.text })}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `MLO Command Center <${cfg.from}>`, to: [m.to], subject: m.subject, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
      console.error(`[cc-email] Resend refused an email: ${res.status} ${err?.name ?? ""} ${(err?.message ?? "").replace(/[^\s@]+@[^\s@]+/g, "[address]").slice(0, 160)}`);
    }
    return res.ok;
  } catch {
    return false;
  }
};

/** Where reports go: the owner's sign-in email, else the alert address. */
export const reportInbox = () => process.env.MLO_OWNER_EMAIL?.trim().toLowerCase() || alertEmail();

/** A short reference people can quote ("R-4F2A9C"). */
export const refOf = (id: string) => `R-${id.replace(/^r_/, "").slice(0, 6).toUpperCase()}`;

/** The page a report came from: a Command Center path only, never its query or fragment. */
export function cleanPath(raw: unknown): string {
  const p = String(raw ?? "").split(/[?#]/)[0]!.replace(/[^A-Za-z0-9/_\-.]/g, "").slice(0, 160);
  return p === "/mlo" || p.startsWith("/mlo/") || p === "/sign-in" || p.startsWith("/sign-in/") ? p : "/mlo";
}

const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** Masks phone numbers, other people's emails, SSNs, dates of birth and account numbers. */
export function maskReport(text: string, ownEmail: string): { text: string; masked: boolean } {
  let masked = false;
  let t = text.normalize("NFKC").replace(PHONE, () => {
    masked = true;
    return "[phone]";
  });
  t = t.replace(EMAIL, (e) => {
    if (e.toLowerCase() === ownEmail.toLowerCase()) return e;
    masked = true;
    return "[email]";
  });
  const r = redactChatInput(t);
  return { text: r.text, masked: masked || r.kinds.length > 0 };
}

export type ReportInput = { kind: string; message: string; path: string; width?: unknown; theme?: unknown };

export async function submitReport(user: User, input: ReportInput, now = new Date(), send: Mailer = resendMail): Promise<{ ok: true; ref: string; masked: boolean; emailed: boolean } | { ok: false; error: string }> {
  if (user.status !== "active") return { ok: false, error: "Your account is turned off." };
  const kind = (Object.keys(REPORT_KINDS) as ReportKind[]).includes(input.kind as ReportKind) ? (input.kind as ReportKind) : null;
  if (!kind) return { ok: false, error: "Choose what kind of report this is." };
  const raw = String(input.message ?? "").trim();
  if (raw.length < 5) return { ok: false, error: "Say a little more about what happened." };
  if (raw.length > REPORT_MAX) return { ok: false, error: `Keep it under ${REPORT_MAX.toLocaleString("en-US")} characters.` };
  const hour = Math.floor(now.getTime() / 3_600_000);
  if ((await incr(`cc:report:${user.id}:${hour}`, 3700)) > REPORTS_PER_HOUR) return { ok: false, error: "That's a lot of reports in an hour. Try again a little later, or email the owner." };
  const { text, masked } = maskReport(raw, user.email);
  const w = Math.round(Number(input.width));
  const theme = ["night", "dim", "paper"].includes(String(input.theme)) ? String(input.theme) : null;
  const report: Report = {
    id: `r_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    userId: user.id,
    at: now.toISOString(),
    kind,
    path: cleanPath(input.path),
    message: text,
    width: Number.isFinite(w) && w > 0 && w < 10000 ? w : null,
    theme,
    status: "open",
    note: "",
    updatedAt: null,
  };
  await reportStore().put(report);
  const to = reportInbox();
  const ref = refOf(report.id);
  const emailed = to
    ? await send({
        to,
        replyTo: user.email,
        subject: `[Command Center ${ref}] ${REPORT_KINDS[kind]} · ${report.path}`,
        text: [
          `${user.name || user.email} (${user.email}) sent a report.`,
          ``,
          `Kind: ${REPORT_KINDS[kind]}`,
          `Page: ${report.path}`,
          `Screen: ${report.width ? `${report.width}px wide` : "unknown"}${theme ? `, ${theme} theme` : ""}`,
          ``,
          text,
          ``,
          masked ? "Numbers and emails that looked like client details were masked before this was kept." : "",
          `Reply to this email to answer them, or mark it on the Pilot page in Command Center.`,
        ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
      }).catch(() => false)
    : false;
  return { ok: true, ref, masked, emailed };
}

/** Who may see a report: its author, the owner, and team leads in the author's company. */
async function canTriage(actor: User, r: Report): Promise<boolean> {
  if (!isAdmin(actor)) return false;
  if (actor.role === "owner") return true;
  const author = await accountStore().userById(r.userId);
  return !!author && companyOfMlo(author.mloId) === companyOfMlo(actor.mloId);
}

export async function reportsFor(actor: User): Promise<Report[]> {
  if (!isAdmin(actor)) return reportStore().list({ userId: actor.id, limit: 100 });
  const all = await reportStore().list({ limit: 1000 });
  const out: Report[] = [];
  for (const r of all) if (await canTriage(actor, r)) out.push(r);
  return out;
}

export async function triageReport(actor: User, id: string, status: string, rawNote: string, now = new Date(), send: Mailer = resendMail): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const r = await reportStore().get(id);
  if (!r || !(await canTriage(actor, r))) return { ok: false, error: "No such report." };
  if (!(Object.keys(REPORT_STATUS) as ReportStatus[]).includes(status as ReportStatus)) return { ok: false, error: "Choose a status." };
  const note = String(rawNote ?? "").trim().slice(0, 1000);
  const changed = r.status !== status || r.note !== note;
  if (!changed) return { ok: true, emailed: false };
  await reportStore().put({ ...r, status: status as ReportStatus, note, updatedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "report.triage", detail: { reportId: id, status } });
  const author = await accountStore().userById(r.userId);
  const emailed =
    author && author.status === "active" && author.id !== actor.id && status !== "open"
      ? await send({
          to: author.email,
          replyTo: actor.email,
          subject: `Your Command Center report ${refOf(r.id)}: ${REPORT_STATUS[status as ReportStatus]}`,
          text: [`About what you reported on ${r.path} (${REPORT_KINDS[r.kind]}):`, ``, `Status: ${REPORT_STATUS[status as ReportStatus]}`, note ? `\n${actor.name || "The owner"}: ${note}` : "", ``, `Reply to this email with anything else.`].join("\n"),
        }).catch(() => false)
      : false;
  return { ok: true, emailed };
}

export type FirstDayStep = { id: string; label: string; why: string; done: boolean; href: string };

/** "Your first day": seven steps, each checked against the real state. */
export async function firstDay(user: User, setup?: SetupItem[]): Promise<{ steps: FirstDayStep[]; done: number; hidden: boolean }> {
  const [items, mfa, marks, mine] = await Promise.all([setup ?? checklist(user), accountStore().getMfa(user.id), setupStore().marks(user.id), reportStore().list({ userId: user.id, limit: 1 })]);
  const is = (id: string) => !!items.find((i) => i.id === id)?.done;
  const steps: FirstDayStep[] = [
    { id: "mfa", label: "Turn on a code from your phone", why: "Your book holds real client details, so sign-in asks for a second step.", done: !!mfa?.enabledAt, href: "/mlo/security" },
    { id: "details", label: "Check your license, booking and application links", why: "They go on every message you send. Fix your links on Getting started; report anything else.", done: is("record") && is("booking") && is("portal"), href: "/mlo/welcome#details" },
    { id: "signature", label: "Add your email signature", why: "It goes under every email you send from here. Start from your details and edit it.", done: is("signature"), href: "/mlo/signature" },
    { id: "contacts", label: "Import your contacts", why: "Drop an Excel, CSV or phone export. Command Center matches and cleans it.", done: is("contacts"), href: "/mlo/contacts/import" },
    { id: "permission", label: "Record the permission you already hold", why: "Texts and calls only go to people who said yes.", done: is("permission"), href: "/mlo/contacts/permission" },
    { id: "concierge", label: "Turn on your Concierge and say how you sound", why: "It drafts check-ins in your voice each morning. You approve every one.", done: is("concierge"), href: "/mlo/concierge" },
    { id: "report", label: "Tell the owner how day one went", why: "Anything broken, confusing or missing. Use Report a problem on any page.", done: mine.length > 0, href: "/mlo/welcome#report" },
  ];
  return { steps, done: steps.filter((s) => s.done).length, hidden: marks.includes(HIDE_MARK) };
}

export async function setFirstDayHidden(user: User, hidden: boolean): Promise<void> {
  await setupStore().setMark(user.id, HIDE_MARK, hidden);
}

export type PilotRow = { user: User; lastSignIn: string | null; firstDay: number; steps: number; open: number; total: number };

/** The owner's view of the pilot: everyone active they may manage. */
export async function pilotOverview(actor: User): Promise<PilotRow[]> {
  if (!isAdmin(actor)) return [];
  const [users, audit, reports] = await Promise.all([accountStore().listUsers(), accountStore().recentAudit(5000), reportsFor(actor)]);
  const last = new Map<string, string>();
  for (const e of audit) if (e.action === "signin.ok" && (!last.get(e.actor) || e.at > last.get(e.actor)!)) last.set(e.actor, e.at);
  const mine = users.filter((u) => u.status === "active" && (actor.role === "owner" || companyOfMlo(u.mloId) === companyOfMlo(actor.mloId))).slice(0, 60);
  const rows: PilotRow[] = [];
  for (const u of mine) {
    const fd = await firstDay(u).catch(() => null);
    const theirs = reports.filter((r) => r.userId === u.id);
    rows.push({ user: u, lastSignIn: last.get(u.email) ?? null, firstDay: fd?.done ?? 0, steps: fd?.steps.length ?? 7, open: theirs.filter((r) => r.status === "open" || r.status === "seen").length, total: theirs.length });
  }
  return rows.sort((a, b) => (b.lastSignIn ?? "").localeCompare(a.lastSignIn ?? ""));
}

export type LiveItem = { label: string; on: boolean; onText: string; offText: string };

/** What works right now, from the live settings (never their values). */
export function liveStatus(user: User, companyTexting = false): LiveItem[] {
  // D56: companyTexting is true when Command Center's own registration for their company is live.
  const texting = !!twilioConfig() && (companyTexting || !!serviceForCompany(companyOfMlo(user.mloId), singleCompany()));
  return [
    { label: "Saving your work", on: !!databaseUrl(), onText: "Everything you enter is kept.", offText: "Nothing is kept between restarts yet. Don't import your real book until this is on." },
    { label: "Email", on: !!emailConfig(), onText: "Sign-in links, your morning email, and emails to clients in your name, with replies to your own inbox.", offText: "Not connected yet." },
    { label: "AI help", on: !!ccAnthropicKey(), onText: "The Concierge, Tell M8, Help me answer, import matching and receipt reading.", offText: "Not connected yet. Everything else works by hand." },
    { label: "Texting", on: texting, onText: "Texts go through your sponsoring company's registered service once the carriers approve its campaign.", offText: "Not on yet. Texting waits for your sponsoring company's carrier registration; use email and calls meanwhile." },
    { label: "Dictation", on: listenOn(), onText: "Speak call notes and expenses instead of typing.", offText: "Not on. Type instead." },
    { label: "Recruiting credit", on: rewardsOn(), onText: "Credit for loan officers you bring in is applied to your membership.", offText: "Tracked, and applied once the owner turns it on." },
    { label: "Production share", on: productionOn(), onText: "Your share from recruits' closed loans is on your statement.", offText: "Tracked, and paid once the owner turns it on with the sponsoring company's compensation plan." },
  ];
}
