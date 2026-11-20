/**
 * lib/agents/service.ts — what the loan officer does with the team (D54).
 * SERVER-ONLY. Settings, playbook approvals, acting on moves, the gift log,
 * the listing and new-agent lists, and the Coach's numbers.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { parseCsv } from "@/lib/contacts/csv";
import { cleanEmail, cleanState, splitName, toE164, isoDate } from "@/lib/contacts/normalize";
import { saveEntry } from "@/lib/expenses/service";
import { pipelineStore } from "@/lib/pipeline/store";
import { weeklyFor } from "@/lib/report/weekly";
import { reviewMessage } from "./compliance";
import { PLAYBOOKS, playbookById, playbookVersion } from "./playbooks";
import { sendMove, type Senders, realSenders } from "./runner";
import { DEFAULT_GOALS, SOURCES, teamStore, type Goals, type ListingRow, type Move, type Source, type TeamSettings } from "./store";

const iso = (d: Date) => d.toISOString();
const DAY = 86_400_000;

// ---- Settings and playbooks ----

export type SettingsInput = { enabled: boolean; sources: string[]; area: string; dailySends: number; gifts: boolean; giftCapDollars: number; goals: Partial<Record<keyof Goals, number>> };

export async function saveTeamSettings(user: User, input: SettingsInput, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await teamStore().settings(user.id);
  const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const goals: Goals = {
    yearlyIncome: num(input.goals.yearlyIncome ?? s.goals.yearlyIncome, 0, 10_000_000, 0),
    incomePerLoan: num(input.goals.incomePerLoan ?? s.goals.incomePerLoan, 0, 100_000, 0),
    appToClose: num(input.goals.appToClose ?? s.goals.appToClose, 1, 100, DEFAULT_GOALS.appToClose),
    talkToApp: num(input.goals.talkToApp ?? s.goals.talkToApp, 1, 100, DEFAULT_GOALS.talkToApp),
    partnerTouchesPerWeek: num(input.goals.partnerTouchesPerWeek ?? s.goals.partnerTouchesPerWeek, 0, 100, DEFAULT_GOALS.partnerTouchesPerWeek),
  };
  const area = input.area.replace(/[^\p{L}\p{N} ,.'&-]/gu, "").trim().slice(0, 40);
  const sources = SOURCES.filter((x) => input.sources.includes(x)) as Source[];
  const next: TeamSettings = { ...s, enabled: !!input.enabled, sources, area, dailySends: num(input.dailySends, 0, 100, 20), gifts: !!input.gifts, giftCapCents: num(input.giftCapDollars, 0, 100_000, 0) * 100, goals, updatedAt: iso(now) };
  await teamStore().putSettings(next);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "team.settings", detail: { enabled: next.enabled, sources: next.sources.join(","), gifts: next.gifts } });
  return { ok: true };
}

/** Approve a playbook as it reads now; any later change to its text needs a new approval. */
export async function setPlaybook(user: User, id: string, on: boolean, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = playbookById(id);
  if (!p) return { ok: false, error: "No such playbook." };
  if (on) {
    const r = reviewMessage(p.body, p.subject, p.to);
    if (!r.ok) return { ok: false, error: `Compliance won't approve it: it ${r.reason}.` };
  }
  const s = await teamStore().settings(user.id);
  const playbooks = { ...s.playbooks };
  if (on) playbooks[id] = playbookVersion(p);
  else delete playbooks[id];
  await teamStore().putSettings({ ...s, playbooks, updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: on ? "team.playbook.approve" : "team.playbook.revoke", detail: { id, version: playbookVersion(p) } });
  return { ok: true };
}

export const playbookStatus = (s: TeamSettings) => PLAYBOOKS.map((p) => ({ ...p, approved: s.playbooks[p.id] === playbookVersion(p), stale: !!s.playbooks[p.id] && s.playbooks[p.id] !== playbookVersion(p) }));

// ---- Acting on moves ----

async function mine(user: User, id: string): Promise<Move | null> {
  const m = await teamStore().move(id);
  return m && m.ownerUserId === user.id ? m : null;
}

export async function closeMove(user: User, id: string, status: "done" | "dismissed", now = new Date()): Promise<boolean> {
  const m = await mine(user, id);
  if (!m || m.status !== "open") return false;
  await teamStore().putMove({ ...m, status, updatedAt: iso(now) });
  return true;
}

/** Send a drafted message now (the loan officer's own yes for this one). */
export async function sendDraft(user: User, id: string, now = new Date(), senders: Senders = realSenders): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await mine(user, id);
  if (!m || m.status !== "open" || (m.kind !== "draft" && m.kind !== "send")) return { ok: false, error: "That message isn't waiting any more." };
  const r = await sendMove(user, m, now, senders);
  if (!r.ok) return { ok: false, error: r.error };
  await teamStore().putMove({ ...m, status: "sent", note: "Sent with your OK.", updatedAt: iso(now) });
  return { ok: true };
}

/** This year's gifts and lunches to one person, in cents. */
export async function giftsThisYear(user: User, contactId: string, now = new Date()): Promise<number> {
  const y = `${now.getUTCFullYear()}-01-01T00:00:00.000Z`;
  return (await teamStore().moves(user.id, { status: "done", since: y, limit: 2000 })).filter((m) => m.gift && m.contactId === contactId && m.amountCents).reduce((n, m) => n + (m.amountCents ?? 0), 0);
}

/** Yes to a gift or lunch: log it with what it cost, and record it in expenses. */
export async function approveGift(user: User, id: string, dollars: number, what: string, now = new Date()): Promise<{ ok: true; expense: boolean } | { ok: false; error: string }> {
  const m = await mine(user, id);
  if (!m || m.status !== "open" || m.kind !== "spend" || !m.gift) return { ok: false, error: "That request isn't waiting any more." };
  const cents = Math.round(dollars * 100);
  if (!(cents > 0 && cents <= 100_000)) return { ok: false, error: "Enter what it cost (up to $1,000)." };
  const desc = what.replace(/\s+/g, " ").trim().slice(0, 80);
  if (desc.length < 2) return { ok: false, error: "Say what it was (for example: a gift basket, lunch at a café)." };
  if (/\bgift\s*cards?\b|\bcash\b|\bvisa\b/i.test(desc) && m.gift !== "closing") return { ok: false, error: "Not a gift card or cash for an agent: that reads as payment (RESPA)." };
  const s = await teamStore().settings(user.id);
  if (m.contactId && m.gift !== "closing" && s.giftCapCents > 0) {
    const so = await giftsThisYear(user, m.contactId, now);
    if (so + cents > s.giftCapCents) return { ok: false, error: `That would bring them to $${((so + cents) / 100).toFixed(2)} this year, over your $${(s.giftCapCents / 100).toFixed(0)} limit.` };
  }
  const c = m.contactId ? await contactStore().get(m.contactId) : null;
  const first = (c?.firstName ?? "").trim().split(/\s+/)[0] ?? "";
  await teamStore().putMove({ ...m, status: "done", amountCents: cents, note: `${desc} · $${(cents / 100).toFixed(2)}`, updatedAt: iso(now) });
  const day = iso(now).slice(0, 10);
  const e = await saveEntry(user, null, { kind: "expense", date: day, dollars: cents / 100, miles: 0, vendor: desc, category: m.gift === "lunch" ? "meals" : "gifts", businessPct: 100, purpose: m.gift === "closing" ? "Closing gift for a client" : m.gift === "holiday" ? "Holiday thank-you to a real estate agent" : "Business lunch with a real estate agent", recipient: m.gift === "lunch" ? "" : first }, now).catch(() => ({ ok: false as const, error: "" }));
  await accountStore().audit({ at: iso(now), actor: user.email, action: "team.gift", detail: { kind: m.gift, cents, contactId: m.contactId ?? "" } });
  return { ok: true, expense: e.ok };
}

// ---- Lists the loan officer adds: canceled/expired listings and new agents ----

const pick = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(h.toLowerCase().trim()));

async function upsertAgent(user: User, a: { first: string; last: string; email: string | null; phone: string | null; brokerage: string; city: string | null; state: string | null }, source: string, now: Date): Promise<{ contact: Contact; created: boolean } | null> {
  if (!a.first && !a.last) return null;
  const store = contactStore();
  const dup = a.phone || a.email ? await store.findDuplicate(user.id, a.phone, a.email) : null;
  if (dup) return { contact: dup, created: false };
  const at = iso(now);
  const c: Contact = { id: `c_${randomBytes(9).toString("base64url")}`, ownerUserId: user.id, kind: "agent", provenance: "unknown", locked: false, source, firstName: a.first, lastName: a.last, email: a.email, phone: a.phone, phone2: null, street: null, city: a.city, state: a.state, zip: null, relationship: "agent", tags: [], notes: null, loan: null, agent: { brokerage: a.brokerage || null, units: null, volume: null, buyerUnits: null, listingUnits: null, avgPrice: null, topLender: null }, createdAt: at, updatedAt: at };
  await store.put(c);
  return { contact: c, created: true };
}

export type ListImport = { ok: true; rows: number; added: number; agents: number; skipped: number } | { ok: false; error: string };

/** A canceled/expired/withdrawn listings export (MLS hot sheet or a vendor). */
export async function importListings(user: User, text: string, now = new Date()): Promise<ListImport> {
  const csv = parseCsv(text);
  const h = csv.headers;
  const col = { status: pick(h, /status|type/), address: pick(h, /address|street/), city: pick(h, /city/), state: pick(h, /^state|st$/), zip: pick(h, /zip|postal/), price: pick(h, /price/), date: pick(h, /date|expir|cancel|withdr/), agent: pick(h, /agent|list(ing)? ?(member|name)/), first: pick(h, /first/), last: pick(h, /last/), email: pick(h, /e-?mail/), phone: pick(h, /phone|mobile|cell/), office: pick(h, /office|brokerage|firm|company/) };
  if (col.address < 0 || (col.agent < 0 && col.first < 0)) return { ok: false, error: "The file needs at least an address column and the listing agent's name." };
  let added = 0, agents = 0, skipped = 0;
  for (const r of csv.rows.slice(0, 2000)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const raw = get(col.status).toLowerCase();
    const status: ListingRow["status"] = /cancel/.test(raw) ? "canceled" : /withdr/.test(raw) ? "withdrawn" : "expired";
    const address = get(col.address).slice(0, 120);
    const [f, l] = col.first >= 0 ? [get(col.first), get(col.last)] : splitName(get(col.agent));
    if (!address || (!f && !l)) {
      skipped++;
      continue;
    }
    const up = await upsertAgent(user, { first: f, last: l, email: cleanEmail(get(col.email)), phone: toE164(get(col.phone)), brokerage: get(col.office).slice(0, 80), city: get(col.city) || null, state: cleanState(get(col.state)) }, "team: canceled listings", now);
    if (up?.created) agents++;
    const agent = up?.contact ?? null;
    const price = Number(get(col.price).replace(/[^0-9.]/g, ""));
    await teamStore().putListing({ id: `ls_${randomBytes(8).toString("base64url")}`, ownerUserId: user.id, status, address, city: get(col.city).slice(0, 60), state: cleanState(get(col.state)) ?? "", zip: get(col.zip).slice(0, 10), price: price > 0 ? price : null, date: isoDate(get(col.date)), agentContactId: agent?.id ?? null, agentName: [f, l].filter(Boolean).join(" "), brokerage: get(col.office).slice(0, 80), importedAt: iso(now) });
    added++;
  }
  await accountStore().audit({ at: iso(now), actor: user.email, action: "team.import.listings", detail: { added, agents, skipped } });
  return { ok: true, rows: csv.rows.length, added, agents, skipped };
}

/** A roster of agents new to the area (an MLS or brokerage roster). */
export async function importNewAgents(user: User, text: string, now = new Date()): Promise<ListImport> {
  const csv = parseCsv(text);
  const h = csv.headers;
  const col = { name: pick(h, /^name$|full ?name|agent/), first: pick(h, /first/), last: pick(h, /last/), email: pick(h, /e-?mail/), phone: pick(h, /phone|mobile|cell/), office: pick(h, /office|brokerage|firm|company/), city: pick(h, /city/), state: pick(h, /^state|st$/) };
  if (col.name < 0 && col.first < 0) return { ok: false, error: "The file needs the agent's name (one Name column, or First and Last)." };
  let added = 0, skipped = 0;
  for (const r of csv.rows.slice(0, 2000)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const [f, l] = col.first >= 0 ? [get(col.first), get(col.last)] : splitName(get(col.name));
    const email = cleanEmail(get(col.email));
    const phone = toE164(get(col.phone));
    if ((!f && !l) || (!email && !phone)) {
      skipped++;
      continue;
    }
    const dup = await contactStore().findDuplicate(user.id, phone, email);
    if (dup) {
      skipped++;
      continue;
    }
    await upsertAgent(user, { first: f, last: l, email, phone, brokerage: get(col.office).slice(0, 80), city: get(col.city) || null, state: cleanState(get(col.state)) }, "team: new agents", now);
    added++;
  }
  await accountStore().audit({ at: iso(now), actor: user.email, action: "team.import.new_agents", detail: { added, skipped } });
  return { ok: true, rows: csv.rows.length, added, agents: added, skipped };
}

// ---- The Coach ----

export type GoalPlan = { loansPerYear: number; loansPerWeek: number; appsPerWeek: number; talksPerWeek: number; partnerTouchesPerWeek: number } | null;

/** Work the income goal back to weekly numbers (48 working weeks). */
export function goalPlan(g: Goals): GoalPlan {
  if (!(g.yearlyIncome > 0 && g.incomePerLoan > 0)) return null;
  const loansPerYear = g.yearlyIncome / g.incomePerLoan;
  const loansPerWeek = loansPerYear / 48;
  const appsPerWeek = loansPerWeek / (g.appToClose / 100);
  const talksPerWeek = appsPerWeek / (g.talkToApp / 100);
  const r = (n: number) => Math.round(n * 10) / 10;
  return { loansPerYear: Math.ceil(loansPerYear), loansPerWeek: r(loansPerWeek), appsPerWeek: r(appsPerWeek), talksPerWeek: Math.ceil(talksPerWeek), partnerTouchesPerWeek: g.partnerTouchesPerWeek };
}

export type Scorecard = { talks: number; apps: number; closed: number; partnerTouches: number; sentByTeam: number; plan: GoalPlan };

/** The last seven days against the plan. */
export async function scorecard(user: User, now = new Date()): Promise<Scorecard> {
  const s = await teamStore().settings(user.id);
  const since = iso(new Date(now.getTime() - 7 * DAY));
  const [w, loans, done, sent] = await Promise.all([
    weeklyFor(user, now).catch(() => null),
    pipelineStore().list(user.id).catch(() => []),
    teamStore().moves(user.id, { status: "done", since, limit: 2000 }),
    teamStore().moves(user.id, { status: "sent", since, limit: 2000 }),
  ]);
  const apps = loans.filter((l) => (l.history ?? []).some((h) => /appl/i.test(h.milestone) && h.at >= since) || (l.keyDates?.application && l.keyDates.application >= since.slice(0, 10))).length;
  const n = w?.week;
  return { talks: n ? n.callsTalked + n.replies : 0, apps, closed: n?.loansClosed ?? 0, partnerTouches: done.filter((m) => m.agent === "partner").length + sent.filter((m) => m.agent === "partner").length, sentByTeam: sent.length, plan: goalPlan(s.goals) };
}
