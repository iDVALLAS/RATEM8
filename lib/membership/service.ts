/**
 * lib/membership/service.ts — the membership ledger (D35 recruiting
 * credits, D36 the area co-op budget). SERVER-ONLY.
 *
 * LoanM8 is a community platform: loan officers pay a flat monthly
 * membership, bring in loan officers they know, and pool part of their fee
 * to market their own area.
 *
 * Recruiting credit (MEMBERSHIP in lib/config.ts):
 *  - 10% of what the recruit actually paid for their membership that month
 *    (15% once they've been a member 12 months), as credit toward the
 *    recruiter's own membership. Credit only; never cash.
 *  - One level. A recruit's recruits credit the recruit, not the person
 *    above them. Two people can't be each other's recruiter.
 *  - Never from loans, rates, terms or loan volume (Reg Z loan officer pay
 *    rules, 12 CFR 1026.36(d); RESPA section 8). Nothing here reads a loan.
 *  - Credit paid with credit doesn't make more credit: only cash paid counts.
 *  - Until RECRUIT_REWARDS="true" (after counsel), credits are worked out
 *    and kept as "held"; none can be used.
 *
 * Marketing (D36):
 *  - 20% of every member's monthly fee goes to marketing (from the full fee,
 *    so a member whose fee is covered by credit still funds it). 60% of that
 *    is national; 40% stays in the member's own area.
 *  - Every member sees where both go, line by line.
 *  - The members in an area have a say in their area's part: each sets how
 *    they'd like it split across channels (the area's plan is the average),
 *    and anyone can suggest a local idea, which the owner approves or
 *    declines with a reply. National marketing is the owner's call.
 *  - The owner records each spend with what it was, the channel and proof.
 *    Spending can't go past what the area has.
 *  - Paid ads must target by location only and use the housing ad category
 *    (Fair Housing Act; Meta and Google housing-ad rules): the owner ticks
 *    that for every ad spend.
 *  - Only loan officers' own fees fund it. No agent or other settlement
 *    provider pays in, so it's never a marketing services agreement.
 */
import { randomBytes } from "node:crypto";
import { MEMBERSHIP } from "@/lib/config";
import { accountStore, type User } from "@/lib/accounts/store";
import { canManage } from "@/lib/accounts/auth";
import { areaKey, COOP_CHANNELS, membershipStore, NATIONAL, type CoopChannel, type CoopIdea, type CoopSpend, type Member, type Payment } from "./store";

export const rewardsOn = () => process.env.RECRUIT_REWARDS?.trim() === "true";
const id = (p: string) => `${p}_${randomBytes(9).toString("base64url")}`;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const CHANNEL_LABELS: Record<CoopChannel, string> = {
  search_ads: "Search ads",
  social_ads: "Social ads (housing category)",
  mail: "Mail",
  sponsorship: "Local sponsorship",
  event: "Event",
  print: "Print",
  other: "Other",
};
export const PAID_AD_CHANNELS: CoopChannel[] = ["search_ads", "social_ads"];

/** Whole months from the day they joined to the first of the payment month. */
export function monthsSince(joinedOn: string, month: string): number {
  const [jy, jm, jd] = joinedOn.split("-").map(Number);
  const [py, pm] = month.split("-").map(Number);
  return (py - jy) * 12 + (pm - jm) - (jd > 1 ? 1 : 0);
}

export const rateFor = (joinedOn: string, month: string) => (monthsSince(joinedOn, month) >= MEMBERSHIP.tenureMonths ? MEMBERSHIP.recruitTenureRate : MEMBERSHIP.recruitRate);

const canRecruit = (u: User | null) => !!u && u.role !== "assistant";
const ownerOrLead = (u: User) => u.status === "active" && (u.role === "owner" || u.role === "team_lead");

/** Owner or team lead: a member's area, fee and who brought them in. */
export async function setMember(actor: User, userId: string, input: { area: string; feeDollars: number; recruitedBy: string | null; joinedOn: string; plan?: string }, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const users = accountStore();
  const target = await users.userById(userId);
  if (!ownerOrLead(actor) || !target || (target.id !== actor.id && !canManage(actor, target.role))) return { ok: false, error: "You can't change that membership." };
  if (target.role === "assistant") return { ok: false, error: "Assistants work under a loan officer's membership." };
  const area = input.area.replace(/\s+/g, " ").trim().slice(0, 80);
  if (area.length < 2) return { ok: false, error: "Name their service area." };
  if (!Number.isFinite(input.feeDollars) || input.feeDollars < 0 || input.feeDollars > 10_000) return { ok: false, error: "Enter the monthly fee in dollars." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.joinedOn)) return { ok: false, error: "Enter the date they joined." };
  const store = membershipStore();
  const before = await store.member(userId);
  const recruitedBy = input.recruitedBy || null;
  if (recruitedBy) {
    if (recruitedBy === userId) return { ok: false, error: "Nobody brings themselves in." };
    const r = await users.userById(recruitedBy);
    if (!canRecruit(r)) return { ok: false, error: "Pick a loan officer as the one who brought them in." };
    if ((await store.member(recruitedBy))?.recruitedBy === userId) return { ok: false, error: "Two people can't have brought each other in." };
  }
  // Once credit has been worked out for a recruit, who brought them in stays put (the ledger depends on it).
  if (before && before.recruitedBy !== recruitedBy && (await store.payments({ userId })).some((p) => p.credit)) return { ok: false, error: "Credit has already been recorded for this member, so who brought them in can't change. Ask counsel before correcting it." };
  const plan = input.plan === "unlimited" ? "unlimited" : input.plan === "capped" ? "capped" : before?.plan;
  await store.putMember({ userId, area, feeCents: Math.round(input.feeDollars * 100), recruitedBy, joinedOn: input.joinedOn, plan, updatedAt: now.toISOString() });
  await users.audit({ at: now.toISOString(), actor: actor.email, action: "membership.set", detail: { userId, area, feeCents: Math.round(input.feeDollars * 100), recruitedBy, joinedOn: input.joinedOn } });
  return { ok: true };
}

/** Credit that can be used now (credited, minus what's been used). */
export async function creditBalance(userId: string): Promise<{ usable: number; held: number }> {
  const store = membershipStore();
  const earned = await store.payments({ recruiterUserId: userId });
  const used = (await store.payments({ userId })).reduce((n, p) => n + p.creditUsedCents, 0);
  const credited = earned.filter((p) => p.credit?.status === "credited").reduce((n, p) => n + (p.credit?.cents ?? 0), 0);
  const held = earned.filter((p) => p.credit?.status === "held").reduce((n, p) => n + (p.credit?.cents ?? 0), 0);
  return { usable: Math.max(0, credited - used), held };
}

/** Owner or team lead: a member's fee for a month was paid. Credit is used first; the co-op share and the recruiter's credit are worked out now. */
export async function recordPayment(actor: User, userId: string, month: string, now = new Date()): Promise<{ ok: true; payment: Payment } | { ok: false; error: string }> {
  if (!ownerOrLead(actor)) return { ok: false, error: "Only the owner or a team lead records membership payments." };
  if (!MONTH.test(month)) return { ok: false, error: "Pick the month (YYYY-MM)." };
  const store = membershipStore();
  const m = await store.member(userId);
  if (!m) return { ok: false, error: "Set up their membership first." };
  if (month < m.joinedOn.slice(0, 7)) return { ok: false, error: "That's before they joined." };
  const creditUsedCents = rewardsOn() ? Math.min((await creditBalance(userId)).usable, m.feeCents) : 0;
  const paidCents = m.feeCents - creditUsedCents;
  const marketing = Math.round(m.feeCents * MEMBERSHIP.marketingShare);
  const nationalCents = Math.round(marketing * MEMBERSHIP.nationalPart);
  const coopCents = marketing - nationalCents;
  let credit: Payment["credit"] = null;
  if (m.recruitedBy) {
    const recruiter = await accountStore().userById(m.recruitedBy);
    if (recruiter && recruiter.status === "active" && canRecruit(recruiter)) {
      const rate = rateFor(m.joinedOn, month);
      credit = { recruiterUserId: recruiter.id, rate, cents: Math.round(paidCents * rate), status: rewardsOn() ? "credited" : "held" };
    }
  }
  const payment: Payment = { id: id("pay"), userId, month, feeCents: m.feeCents, creditUsedCents, paidCents, coopCents, nationalCents, area: m.area, credit, recordedBy: actor.email, recordedAt: now.toISOString() };
  if (!(await store.addPayment(payment))) return { ok: false, error: `${month} is already recorded for them.` };
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "membership.payment", detail: { userId, month, paidCents, creditUsedCents, coopCents, nationalCents, creditCents: credit?.cents ?? 0, creditStatus: credit?.status ?? null } });
  return { ok: true, payment };
}

export type Budget = { area: string; inCents: number; spentCents: number; balanceCents: number; spends: CoopSpend[]; members: number };

/** An area's budget, or the national one (area = NATIONAL). */
export async function coopBudget(area: string): Promise<Budget> {
  const store = membershipStore();
  const national = areaKey(area) === areaKey(NATIONAL);
  const pays = national ? await store.payments({}) : await store.payments({ area });
  const inCents = pays.reduce((n, p) => n + (national ? p.nationalCents : p.coopCents), 0);
  const spends = await store.spends(area);
  const spentCents = spends.reduce((n, s) => n + s.cents, 0);
  const all = await store.members();
  const members = national ? all.length : all.filter((m) => areaKey(m.area) === areaKey(area)).length;
  return { area: national ? NATIONAL : area, inCents, spentCents, balanceCents: inCents - spentCents, spends, members };
}

/** A member's say: their preferred split of their own area's budget, whole percents adding to 100. */
export async function setPreference(user: User, split: Partial<Record<CoopChannel, number>>, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await membershipStore().member(user.id);
  if (!m) return { ok: false, error: "You need a membership first." };
  const clean: Partial<Record<CoopChannel, number>> = {};
  for (const c of COOP_CHANNELS) {
    const v = Math.round(Number(split[c] ?? 0));
    if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, error: "Use whole percents from 0 to 100." };
    if (v) clean[c] = v;
  }
  const total = Object.values(clean).reduce((n, v) => n + (v ?? 0), 0);
  if (total !== 100) return { ok: false, error: `The split adds to ${total}%. Make it 100%.` };
  await membershipStore().putPref({ userId: user.id, area: m.area, split: clean, updatedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: user.email, action: "coop.pref", detail: { area: areaKey(m.area) } });
  return { ok: true };
}

/** The area's plan: the average of its members' splits, and what was actually spent, by channel. */
export async function areaPlan(area: string): Promise<{ voters: number; rows: { channel: CoopChannel; planPct: number; spentPct: number }[] }> {
  const store = membershipStore();
  const prefs = await store.prefs(area);
  const spends = await store.spends(area);
  const spent = spends.reduce((n, s) => n + s.cents, 0);
  const rows = COOP_CHANNELS.map((channel) => ({
    channel,
    planPct: prefs.length ? Math.round(prefs.reduce((n, p) => n + (p.split[channel] ?? 0), 0) / prefs.length) : 0,
    spentPct: spent ? Math.round((spends.filter((s) => s.channel === channel).reduce((n, s) => n + s.cents, 0) / spent) * 100) : 0,
  })).filter((r) => r.planPct || r.spentPct);
  return { voters: prefs.length, rows };
}

/** A member suggests something local for their area's budget. */
export async function suggestIdea(user: User, text: string, dollars: number | null, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await membershipStore().member(user.id);
  if (!m) return { ok: false, error: "You need a membership first." };
  const t = text.replace(/\s+/g, " ").trim().slice(0, 400);
  if (t.length < 8) return { ok: false, error: "Say a little more about the idea." };
  const open = (await membershipStore().ideas(m.area)).filter((i) => i.userId === user.id && i.status === "open").length;
  if (open >= 5) return { ok: false, error: "You have five ideas waiting. Let the owner answer those first." };
  const d = dollars !== null && Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars) : null;
  await membershipStore().putIdea({ id: id("idea"), area: m.area, userId: user.id, text: t, dollars: d, status: "open", reply: null, at: now.toISOString(), decidedAt: null, decidedBy: null });
  return { ok: true };
}

/** Owner or team lead: answer an idea. */
export async function answerIdea(actor: User, ideaId: string, status: "approved" | "declined" | "done", reply: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ownerOrLead(actor)) return { ok: false, error: "Only the owner or a team lead answers ideas." };
  const i = await membershipStore().idea(ideaId);
  if (!i) return { ok: false, error: "That idea is gone." };
  const r = reply.replace(/\s+/g, " ").trim().slice(0, 400);
  if (status === "declined" && r.length < 3) return { ok: false, error: "Say why, so they know." };
  await membershipStore().putIdea({ ...i, status, reply: r || null, decidedAt: now.toISOString(), decidedBy: actor.email });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "coop.idea", detail: { ideaId, status } });
  return { ok: true };
}

export type { CoopIdea };

/** Owner or team lead: spend from an area's co-op budget, with proof. */
export async function recordSpend(actor: User, input: { area: string; month: string; dollars: number; what: string; channel: string; proof: string; locationOnly: boolean }, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ownerOrLead(actor)) return { ok: false, error: "Only the owner or a team lead records co-op spending." };
  const channel = COOP_CHANNELS.find((c) => c === input.channel);
  if (!channel) return { ok: false, error: "Pick where it ran." };
  if (!MONTH.test(input.month)) return { ok: false, error: "Pick the month (YYYY-MM)." };
  const cents = Math.round(input.dollars * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, error: "Enter what it cost." };
  const what = input.what.replace(/\s+/g, " ").trim().slice(0, 200);
  const proof = input.proof.trim().slice(0, 300);
  if (what.length < 3) return { ok: false, error: "Say what it was." };
  if (proof.length < 3) return { ok: false, error: "Add the invoice or receipt (a link or a reference)." };
  if (PAID_AD_CHANNELS.includes(channel) && !input.locationOnly) return { ok: false, error: "Paid ads must use the housing ad category and target by location only (no age, gender, family or ZIP exclusions). Tick the box once it's set that way." };
  const b = await coopBudget(input.area);
  if (b.members === 0) return { ok: false, error: "No member has that area." };
  // Fair housing: location targeting, the housing ad category, and never a demographic exclusion.
  if (cents > b.balanceCents) return { ok: false, error: `That's more than the area has ($${(b.balanceCents / 100).toFixed(2)}).` };
  await membershipStore().addSpend({ id: id("co"), area: input.area.trim(), month: input.month, cents, what, channel, proof, recordedBy: actor.email, recordedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "coop.spend", detail: { area: areaKey(input.area), month: input.month, cents, channel } });
  return { ok: true };
}

export type Statement = {
  member: Member | null;
  credit: { usable: number; held: number };
  recruits: { userId: string; name: string; joinedOn: string; rateNow: number; creditCents: number; active: boolean }[];
  payments: Payment[];
  coop: Budget | null;
  national: Budget;
  plan: Awaited<ReturnType<typeof areaPlan>> | null;
  myPref: Partial<Record<CoopChannel, number>> | null;
  ideas: CoopIdea[];
};

/** What one member sees: their plan, the people they brought in, their credit and their area's budget. */
export async function statementFor(user: User, today = new Date()): Promise<Statement> {
  const store = membershipStore();
  const member = await store.member(user.id);
  const month = today.toISOString().slice(0, 7);
  const earned = await store.payments({ recruiterUserId: user.id });
  const recruits = await Promise.all(
    (await store.members())
      .filter((m) => m.recruitedBy === user.id)
      .map(async (m) => {
        const u = await accountStore().userById(m.userId);
        return { userId: m.userId, name: (u?.name ?? "A member").split(/\s+/)[0], joinedOn: m.joinedOn, rateNow: rateFor(m.joinedOn, month), creditCents: earned.filter((p) => p.userId === m.userId).reduce((n, p) => n + (p.credit?.cents ?? 0), 0), active: u?.status === "active" };
      }),
  );
  const prefs = member ? await store.prefs(member.area) : [];
  return {
    member,
    credit: await creditBalance(user.id),
    recruits,
    payments: await store.payments({ userId: user.id }),
    coop: member ? await coopBudget(member.area) : null,
    national: await coopBudget(NATIONAL),
    plan: member ? await areaPlan(member.area) : null,
    myPref: prefs.find((p) => p.userId === user.id)?.split ?? null,
    ideas: member ? await store.ideas(member.area) : [],
  };
}
