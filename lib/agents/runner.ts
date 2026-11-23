/**
 * lib/agents/runner.ts — the team's daily run (D54). SERVER-ONLY.
 *
 *  1. Each agent proposes moves from the loan officer's own data: Today's
 *     cards (replies, promises, new leads, anniversaries, check-ins, refi
 *     watch, loan clocks), their partner agents' last touch, the listing and
 *     new-agent lists they added, and a monthly relocation plan.
 *  2. Compliance reviews each one; one move per key while it matters.
 *  3. A message from an approved playbook becomes a "send"; otherwise it's a
 *     draft or a task. Sends go out through the contact rules (sendDueMoves),
 *     within the daily cap; quiet hours make them wait, other refusals leave
 *     a task with the reason.
 *
 * Agent production numbers from RETR are never read here: RETR's terms bar
 * using its data in automated processes. Partner moves come only from the
 * loan officer's own history with agents they added through the team's lists
 * or who are linked to a client's loan.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { listAll, type Contact } from "@/lib/contacts/store";
import { touchStore } from "@/lib/messaging/store";
import { sendText, type SendOutcome } from "@/lib/messaging/service";
import { sendEmail } from "@/lib/messaging/email";
import { myValues } from "@/lib/templates/service";
import { todayFor } from "@/lib/today/facts";
import { pipelineStore } from "@/lib/pipeline/store";
import { marketingIdeas } from "./marketing";
import { businessIdeas } from "./business";
import type { TodayCard } from "@/lib/today/rank";
import { reviewMessage, reviewMove } from "./compliance";
import { fillPlaybook, playbookById, playbookVersion, type Playbook } from "./playbooks";
import { teamStore, type Move, type MoveKind, type Source, type TeamSettings } from "./store";
import type { AgentKey } from "./team";
import { loaTasks } from "@/lib/loa/service";

const DAY = 86_400_000;

/** Kill switch: CC_TEAM="false" stops every team run and send. */
export const teamOn = () => process.env.CC_TEAM?.trim() !== "false";
const iso = (d: Date) => d.toISOString();
const nameOf = (c: Contact) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Someone";

export type Proposal = Omit<Move, "id" | "ownerUserId" | "status" | "note" | "createdAt" | "updatedAt"> & { to: "client" | "agent"; cooldownDays: number };

type Ctx = { user: User; settings: TeamSettings; now: Date; contacts: Map<string, Contact>; lastTouch: Map<string, string>; values: Record<string, string> };

const has = (s: TeamSettings, src: Source) => s.sources.includes(src);
const approved = (s: TeamSettings, p: Playbook) => s.playbooks[p.id] === playbookVersion(p);

/** A playbook message for this person: a send if approved, else a draft; a task if a field is missing. */
function fromPlaybook(ctx: Ctx, agent: AgentKey, pbId: string, c: Contact, base: { key: string; title: string; why: string; score: number; cooldownDays: number }): Proposal {
  const p = playbookById(pbId)!;
  const reach = p.channel === "email" ? !!c.email : !!c.phone;
  const v = { ...ctx.values, first: c.firstName?.trim() ?? "" };
  const missing = (p.body + p.subject).includes("{first}") && !v.first;
  const kind: MoveKind = !reach || missing ? "task" : approved(ctx.settings, p) ? "send" : "draft";
  return {
    key: base.key,
    agent,
    kind,
    title: base.title,
    why: kind === "task" ? `${base.why} ${!reach ? `No ${p.channel === "email" ? "email address" : "phone number"} on file, so reach them yourself.` : "No first name on file for the message."}` : base.why,
    contactId: c.id,
    loanId: null,
    playbookId: kind === "task" ? null : p.id,
    channel: kind === "task" ? null : p.channel,
    subject: kind === "task" ? "" : fillPlaybook(p.subject, v),
    body: kind === "task" ? "" : fillPlaybook(p.body, v),
    amountCents: null,
    score: base.score,
    until: null,
    to: p.to,
    cooldownDays: base.cooldownDays,
  };
}

const task = (agent: AgentKey, key: string, title: string, why: string, score: number, extra: Partial<Proposal> = {}): Proposal => ({ key, agent, kind: "task", title, why, contactId: null, loanId: null, playbookId: null, channel: null, subject: "", body: "", amountCents: null, href: null, score, until: null, to: "client", cooldownDays: 7, ...extra });

/** Today's cards, handed to the right agent. */
function fromCards(ctx: Ctx, cards: TodayCard[]): Proposal[] {
  const out: Proposal[] = [];
  for (const card of cards) {
    const c = ctx.contacts.get(card.contactId);
    if (!c) continue;
    const base = { title: card.title, why: card.reason, score: card.score };
    switch (card.kind) {
      case "reply":
        out.push(task("chief", `reply:${c.id}`, base.title, base.why, base.score + 20, { contactId: c.id, cooldownDays: 1 }));
        break;
      case "promise":
        out.push(task("chief", `promise:${c.id}`, base.title, base.why, base.score + 10, { contactId: c.id, cooldownDays: 1 }));
        break;
      case "new_lead":
        if (!has(ctx.settings, "leads")) break;
        out.push(card.next === "call" ? fromPlaybook(ctx, "finder", "lead-first-touch", c, { key: `lead:${c.id}`, ...base, score: base.score + 15, cooldownDays: 30 }) : task("finder", `lead:${c.id}`, base.title, base.why, base.score, { contactId: c.id, cooldownDays: 30 }));
        break;
      case "anniversary":
        if (!has(ctx.settings, "book")) break;
        out.push(fromPlaybook(ctx, "finder", "anniversary-email", c, { key: `anniv:${c.id}:${ctx.now.getUTCFullYear()}`, ...base, cooldownDays: 300 }));
        break;
      case "check_in":
        if (!has(ctx.settings, "book")) break;
        out.push(fromPlaybook(ctx, "finder", "check-in-email", c, { key: `checkin:${c.id}`, ...base, cooldownDays: 90 }));
        break;
      case "rate_gap":
        if (has(ctx.settings, "book")) out.push(task("finder", `refi:${c.id}`, base.title, `${base.why} For your eyes only; never send a rate without pricing their scenario.`, base.score, { contactId: c.id, cooldownDays: 30 }));
        break;
      case "ask_permission":
        if (has(ctx.settings, "book")) out.push(task("finder", `perm:${c.id}`, base.title, base.why, base.score, { contactId: c.id, cooldownDays: 60 }));
        break;
      case "journey":
      case "loan_late":
      case "lock":
      case "closing":
        out.push(task("pipeline", `${card.kind}:${card.loanId ?? c.id}`, base.title, base.why, base.score + 5, { contactId: c.id, loanId: card.loanId ?? null, cooldownDays: 1 }));
        break;
      default:
        break;
    }
  }
  return out;
}

/** Agents the loan officer added through the team, or linked to a client's loan. Never RETR production data. */
function partnerAgents(ctx: Ctx): Contact[] {
  const linked = new Set([...ctx.contacts.values()].map((c) => c.partnerUpdates?.agentContactId).filter(Boolean) as string[]);
  return [...ctx.contacts.values()].filter((c) => c.kind === "agent" && !c.locked && (c.source.startsWith("team:") || linked.has(c.id)));
}

function fromPartners(ctx: Ctx, listings: { agentContactId: string | null; address: string; status: string; importedAt: string }[]): Proposal[] {
  const out: Proposal[] = [];
  const agents = partnerAgents(ctx);
  const recentListing = new Map<string, { address: string; status: string }>();
  for (const l of listings) if (l.agentContactId && ctx.now.getTime() - Date.parse(l.importedAt) < 30 * DAY && !recentListing.has(l.agentContactId)) recentListing.set(l.agentContactId, l);
  for (const a of agents) {
    const last = ctx.lastTouch.get(a.id);
    const days = last ? Math.floor((ctx.now.getTime() - Date.parse(last)) / DAY) : null;
    const n = nameOf(a);
    const listing = recentListing.get(a.id);
    if (listing && has(ctx.settings, "listings") && days === null) {
      out.push(fromPlaybook(ctx, "partner", "listing-agent-intro", a, { key: `listing-agent:${a.id}`, title: `Reach ${n} about the ${listing.status} listing at ${listing.address}`, why: "Their listing came off the market. Offer to help their next buyers with financing. Call too: a voice beats an email.", score: 62, cooldownDays: 60 }));
      continue;
    }
    if (a.source.startsWith("team: new agents") && has(ctx.settings, "new_agents") && days === null) {
      out.push(fromPlaybook(ctx, "partner", "new-agent-welcome", a, { key: `new-agent:${a.id}`, title: `Welcome ${n}, new to real estate`, why: "New agents need a lender they can lean on. A welcome and an offer to explain financing builds that early.", score: 55, cooldownDays: 120 }));
      continue;
    }
    if (has(ctx.settings, "partners") && (days === null || days >= 21)) {
      out.push(task("partner", `partner:${a.id}`, `Touch base with ${n}`, days === null ? "You haven't been in touch here yet. CORE: give before you ask: share something useful for their business." : `Last in touch ${days} days ago. CORE: a steady, useful touch every few weeks keeps the relationship warm.`, 45 + Math.min(days ?? 30, 60) / 6, { contactId: a.id, to: "agent", cooldownDays: 21 }));
    }
  }
  return out;
}

export const GIFT_RULES = {
  closing: "Your gift to your client. The agent may hand it over, but it can't replace or pay for the agent's own closing gift (that would cover their expense). Follow your sponsor's closing-gift policy.",
  holiday: "A thank-you, never payment for referrals: not tied to past or future business, and offered the same way to the agents you work with. Keep it modest and within any limit your sponsor sets.",
  lunch: "A business meeting with a real agenda (market update, financing programs, a buyer seminar). Not tied to referrals; keep it occasional and modest.",
} as const;

/** Gift lanes, each a request that waits for the loan officer's yes. */
async function giftIdeas(ctx: Ctx): Promise<Proposal[]> {
  if (!ctx.settings.gifts) return [];
  const out: Proposal[] = [];
  const spend = (agent: AgentKey, key: string, title: string, why: string, gift: "closing" | "holiday" | "lunch", contactId: string | null, loanId: string | null, score: number, cooldownDays: number): Proposal => ({ ...task(agent, key, title, why, score, { contactId, loanId, cooldownDays }), kind: "spend", gift, amountCents: null });
  // Closing gifts: loans that closed in the last two weeks.
  const loans = await pipelineStore().list(ctx.user.id).catch(() => []);
  for (const l of loans) {
    if (!l.closed || !l.contactId || l.dead) continue;
    if (ctx.now.getTime() - Date.parse(l.milestoneAt) > 14 * DAY) continue;
    const c = ctx.contacts.get(l.contactId);
    if (!c) continue;
    out.push(spend("pipeline", `gift-closing:${l.id}`, `Closing gift for ${nameOf(c)}`, GIFT_RULES.closing, "closing", c.id, l.id, 48, 3650));
  }
  // Holiday thank-yous (Nov 15 to Dec 20) and a monthly lunch idea, for agents who've worked a loan with you.
  const linked = new Set([...ctx.contacts.values()].map((c) => c.partnerUpdates?.agentContactId).filter(Boolean) as string[]);
  const agents = [...linked].map((id) => ctx.contacts.get(id)).filter((a): a is Contact => !!a && a.kind === "agent" && !a.locked);
  const md = iso(ctx.now).slice(5, 10);
  const y = ctx.now.getUTCFullYear();
  if (md >= "11-15" && md <= "12-20") for (const a of agents) out.push(spend("partner", `gift-holiday:${a.id}:${y}`, `Holiday thank-you for ${nameOf(a)}`, GIFT_RULES.holiday, "holiday", a.id, null, 44, 300));
  const month = iso(ctx.now).slice(0, 7);
  const quiet = agents.filter((a) => { const t = ctx.lastTouch.get(a.id); return !t || ctx.now.getTime() - Date.parse(t) > 30 * DAY; }).slice(0, 2);
  for (const a of quiet) out.push(spend("partner", `gift-lunch:${a.id}:${month}`, `Lunch meeting with ${nameOf(a)}`, GIFT_RULES.lunch, "lunch", a.id, null, 42, 28));
  return out;
}

function relocationPlan(ctx: Ctx): Proposal[] {
  if (!has(ctx.settings, "relocation")) return [];
  const month = iso(ctx.now).slice(0, 7);
  const steps = [
    "Ask two brokerages in your area who runs their relocation desk, and introduce yourself to that person.",
    "List three larger employers near you that hire from out of state; find their HR or talent lead and offer a short homebuying session for new hires (no gifts, no payment for referrals).",
    "Check whether your sponsoring company is on any relocation company's lender list; many relocation companies use their own lender, so ask before you invest time.",
    "Add the relocation contacts you meet as agents or contacts here, so the Partner keeps the touch going.",
  ];
  return [task("finder", `relocation:${month}`, "This month's relocation plan", steps.map((s, i) => `${i + 1}. ${s}`).join("\n"), 40, { kind: "plan", cooldownDays: 28 })];
}

/** Every proposal for today, before Compliance and de-duplication. */
export async function proposeAll(user: User, settings: TeamSettings, now: Date): Promise<Proposal[]> {
  const { contacts } = await listAll({ ownerUserId: user.id });
  const mine = contacts.filter((c) => c.ownerUserId === user.id);
  const touches = await touchStore().since(user.id, iso(new Date(now.getTime() - 400 * DAY)));
  const lastTouch = new Map<string, string>();
  for (const t of touches) if ((lastTouch.get(t.contactId) ?? "") < t.at) lastTouch.set(t.contactId, t.at);
  const mv = myValues(user);
  const ctx: Ctx = { user, settings, now, contacts: new Map(mine.map((c) => [c.id, c])), lastTouch, values: { myFirst: mv.myFirst, myName: mv.myName, company: mv.company, area: settings.area.trim() || "your area" } };
  const { cards } = await todayFor(user, now, { ownOnly: true }).catch(() => ({ cards: [] as TodayCard[] }));
  const listings = await teamStore().listings(user.id);
  const marketing = await marketingIdeas(ctx, task).catch(() => []);
  const business = await businessIdeas(user, now, task).catch(() => []);
  // D62: the LOA's file work across open loans (deadlines, drafts to send, conditions for you).
  // D70: a prepared message waiting for Approve is a "draft" move that opens the LOA's approval queue.
  const loa = (await loaTasks(user, now).catch(() => [])).slice(0, 12).map((t) => task("loa", `loa:${t.loanId}:${t.title}`, `${t.borrower}: ${t.title}`, t.why, t.urgent ? 70 : 40, { loanId: t.loanId, href: t.href, cooldownDays: 1, ...(t.kind === "draft" ? { kind: "draft" as const } : {}) }));
  return [...loa, ...fromCards(ctx, cards), ...fromPartners(ctx, listings), ...relocationPlan(ctx), ...(await giftIdeas(ctx)), ...marketing, ...business];
}

export type RunResult = { proposed: number; added: number; held: number; sent: number; waiting: number };

/** Plan the day: propose, review, de-duplicate and store. Sends go out in sendDueMoves. */
export async function runTeam(user: User, now = new Date(), opts: { send?: boolean } = {}): Promise<RunResult> {
  const store = teamStore();
  const settings = await store.settings(user.id);
  const out: RunResult = { proposed: 0, added: 0, held: 0, sent: 0, waiting: 0 };
  if (!settings.enabled || !teamOn()) return out;
  const props = await proposeAll(user, settings, now);
  out.proposed = props.length;
  for (const p of props) {
    const prev = await store.moveByKey(user.id, p.key);
    if (prev && (prev.status === "open" || now.getTime() - Date.parse(prev.updatedAt) < p.cooldownDays * DAY)) continue;
    // D84: a lead-source move whose wording Compliance won't pass is never saved.
    if (p.key.startsWith("lead-source:") && !reviewMove(p, p.to).ok) {
      out.held++;
      continue;
    }
    let kind = p.kind;
    let note = "";
    // An LOA draft carries no message here: it's checked when it's sent from the LOA's queue.
    if ((kind === "send" || kind === "draft") && !(p.agent === "loa" && !p.body)) {
      const r = reviewMessage(p.body, p.subject, p.to);
      if (!r.ok) {
        kind = "task";
        note = `Compliance held the message: it ${r.reason}.`;
        out.held++;
      }
    }
    const { to: _to, cooldownDays: _cd, ...rest } = p;
    void _to;
    void _cd;
    await store.putMove({ ...rest, kind, id: `mv_${randomBytes(9).toString("base64url")}`, ownerUserId: user.id, status: "open", note, createdAt: iso(now), updatedAt: iso(now) });
    out.added++;
  }
  await store.putSettings({ ...settings, lastRunAt: iso(now) });
  if (opts.send) {
    const s = await sendDueMoves(user, now);
    out.sent = s.sent;
    out.waiting = s.waiting;
  }
  return out;
}

export type Senders = {
  text: (actor: User, contactId: string, body: string, purpose: Playbook["purpose"], now: Date) => Promise<SendOutcome>;
  email: (actor: User, contactId: string, subject: string, body: string, purpose: Playbook["purpose"], now: Date) => Promise<SendOutcome>;
};
export const realSenders: Senders = {
  text: (a, c, b, p, now) => sendText(a, c, b, p, null, now, { origin: "agent" }),
  email: (a, c, s, b, p, now) => sendEmail(a, c, s, b, p, now, undefined, { origin: "agent" }),
};

/** Send one move's message through Compliance and the contact rules. */
export async function sendMove(user: User, m: Move, now: Date, senders: Senders = realSenders): Promise<{ ok: true } | { ok: false; error: string; wait?: boolean }> {
  const p = m.playbookId ? playbookById(m.playbookId) : null;
  if (!p || !m.contactId || !m.channel) return { ok: false, error: "Nothing to send." };
  const r = reviewMessage(m.body, m.subject, p.to);
  if (!r.ok) return { ok: false, error: `Compliance held it: it ${r.reason}.` };
  const res = m.channel === "text" ? await senders.text(user, m.contactId, m.body, p.purpose, now) : await senders.email(user, m.contactId, m.subject, m.body, p.purpose, now);
  if (res.ok) return { ok: true };
  if (res.retryAt && Date.parse(res.retryAt) > now.getTime()) return { ok: false, error: res.error, wait: true };
  return { ok: false, error: res.error };
}

/** Approved-playbook sends that are due, within the daily cap. */
export async function sendDueMoves(user: User, now = new Date(), senders: Senders = realSenders): Promise<{ sent: number; waiting: number; refused: number }> {
  const store = teamStore();
  const settings = await store.settings(user.id);
  const out = { sent: 0, waiting: 0, refused: 0 };
  if (!settings.enabled || !teamOn()) return out;
  const today = iso(now).slice(0, 10);
  const sentToday = (await store.moves(user.id, { status: "sent", since: `${today}T00:00:00.000Z` })).filter((m) => m.kind === "send").length;
  let budget = Math.max(0, settings.dailySends - sentToday);
  for (const m of await store.moves(user.id, { status: "open" })) {
    if (m.kind !== "send") continue;
    const p = m.playbookId ? playbookById(m.playbookId) : null;
    // Approval was taken back (or the text changed): back to a draft for the loan officer.
    if (!p || !approved(settings, p)) {
      await store.putMove({ ...m, kind: "draft", note: "Waiting for you: the playbook isn't approved.", updatedAt: iso(now) });
      continue;
    }
    if (budget <= 0) {
      out.waiting++;
      continue;
    }
    const r = await sendMove(user, m, now, senders);
    if (r.ok) {
      await store.putMove({ ...m, status: "sent", note: `Sent by your ${m.agent === "partner" ? "Partner" : "Business Finder"} from an approved playbook.`, updatedAt: iso(now) });
      out.sent++;
      budget--;
    } else if (r.wait) {
      await store.putMove({ ...m, note: `Waiting: ${r.error}`, updatedAt: m.updatedAt });
      out.waiting++;
    } else {
      await store.putMove({ ...m, kind: "task", note: `Not sent: ${r.error}`, updatedAt: iso(now) });
      out.refused++;
    }
  }
  if (out.sent || out.refused) await accountStore().audit({ at: iso(now), actor: user.email, action: "team.send", detail: out });
  return out;
}
