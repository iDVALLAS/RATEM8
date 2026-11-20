import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests, type Contact } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryExpenseStore, setExpenseStoreForTests, expenseStore } from "@/lib/expenses/store";
import { reviewMessage } from "./compliance";
import { PLAYBOOKS } from "./playbooks";
import { runTeam, sendDueMoves, type Senders } from "./runner";
import { approveGift, goalPlan, importListings, importNewAgents, saveTeamSettings, sendDraft, setPlaybook } from "./service";
import { MemoryTeamStore, setTeamStoreForTests, teamStore } from "./store";
import { MemoryCampaignStore, setCampaignStoreForTests } from "@/lib/campaigns/store";
import { saveEntry } from "@/lib/expenses/service";
import { snapshot } from "./business";
import { CONTENT } from "./marketing";
import { COACH_SCENARIOS } from "./practice";
import { practiceTurn } from "@/lib/academy/service";
import { checkTemplate } from "@/lib/templates/service";

const NOW = new Date("2026-12-02T16:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = (first: string, extra: Record<string, unknown> = {}) => ({ firstName: first, lastName: "Lee", email: `${first.toLowerCase()}@example.com`, phone: `+1206555${String(1000 + first.charCodeAt(0) * 7 + first.length).slice(-4)}`, phone2: null, street: "12 Elm St", city: "Bellevue", state: "WA", zip: "98004", relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...extra });

type Sent = { channel: string; contactId: string; body: string; subject?: string };
function senders(log: Sent[], result: (n: number) => { ok: true } | { ok: false; error: string; retryAt?: string } = () => ({ ok: true })): Senders {
  return {
    text: async (_a, contactId, body) => (log.push({ channel: "text", contactId, body }), result(log.length)),
    email: async (_a, contactId, subject, body) => (log.push({ channel: "email", contactId, subject, body }), result(log.length)),
  };
}

describe("The Concierge team (D54)", () => {
  let contacts: MemoryContactStore;
  let pipeline: MemoryPipelineStore;
  const settingsOn = { enabled: true, sources: ["book", "partners", "leads", "listings", "new_agents", "relocation"], area: "the Eastside", dailySends: 20, gifts: true, giftCapDollars: 0, goals: {} };
  beforeEach(async () => {
    contacts = new MemoryContactStore();
    pipeline = new MemoryPipelineStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(new MemoryTouchStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(pipeline);
    setExpenseStoreForTests(new MemoryExpenseStore());
    setTeamStoreForTests(new MemoryTeamStore());
    setCampaignStoreForTests(new MemoryCampaignStore());
    // A past client whose home anniversary is in 3 days, one gone quiet with permission, and a RETR-imported agent.
    await importBatch(me, "contacts", [rec("Ann", { loan: { closedOn: "2023-12-05", amount: 400000, noteRate: 6.5 } }), rec("Bo")], "a.csv", "personal", new Date("2026-01-01T00:00:00Z"));
    const bo = await by("Bo");
    await recordConsent(me, bo.id, { channel: "email", purpose: "marketing", granted: true, evidence: "written", proof: "signed form" }, new Date("2026-01-01T00:00:00Z"));
    await importBatch(me, "agents", [rec("Rex", { relationship: "agent" })], "retr.csv", "unknown", new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setExpenseStoreForTests, setTeamStoreForTests, setCampaignStoreForTests]) f(null);
  });
  const by = async (n: string): Promise<Contact> => (await contacts.list({})).contacts.find((c) => c.firstName === n)!;
  const open = async () => teamStore().moves("lo1", { status: "open" });

  it("every playbook passes Compliance", () => {
    for (const p of PLAYBOOKS) expect(reviewMessage(p.body, p.subject, p.to), p.id).toEqual({ ok: true });
  });

  it("holds anything of value for referrals in messages to agents (RESPA), and rates or promises for anyone", () => {
    for (const bad of ["Lunch is on me if you send me a buyer", "Here's a $10 gift card to say thanks", "Refer a buyer and I'll pay for your open house", "Want to co-market and split the ad cost?", "There's a referral bonus for every closing"]) {
      expect(reviewMessage(bad, "Hi", "agent").ok, bad).toBe(false);
    }
    expect(reviewMessage("Rates are 5.9% this week!", "Hi", "client").ok).toBe(false);
    expect(reviewMessage("Would a short call this week work?", "Hi", "agent").ok).toBe(true);
  });

  it("does nothing until it's turned on", async () => {
    expect(await runTeam(me, NOW)).toMatchObject({ added: 0 });
    expect(await open()).toHaveLength(0);
  });

  it("plans the day: drafts until a playbook is approved, sends after, and never repeats itself", async () => {
    await saveTeamSettings(me, settingsOn, NOW);
    const r = await runTeam(me, NOW);
    expect(r.added).toBeGreaterThan(0);
    const moves = await open();
    const anniv = moves.find((m) => m.key.startsWith("anniv:"))!;
    expect(anniv).toMatchObject({ agent: "finder", kind: "draft", channel: "email", playbookId: "anniversary-email" });
    expect(anniv.body).toContain("Hi Ann");
    expect(anniv.body).not.toMatch(/\{|\[first\]/);
    expect(moves.some((m) => m.key.startsWith("relocation:") && m.kind === "plan")).toBe(true);
    // RETR-imported agents are never worked automatically.
    const rex = await by("Rex");
    expect(moves.some((m) => m.contactId === rex.id)).toBe(false);
    // A second run the same day adds nothing new.
    expect((await runTeam(me, NOW)).added).toBe(0);

    // Approve the playbook: today's draft stays a draft (the loan officer can send it), new ones send.
    expect(await setPlaybook(me, "anniversary-email", true, NOW)).toEqual({ ok: true });
    const log: Sent[] = [];
    expect(await sendDraft(me, anniv.id, NOW, senders(log))).toEqual({ ok: true });
    expect(log[0]).toMatchObject({ channel: "email", subject: "Happy home anniversary, Ann" });
  });

  it("sends approved playbooks within the daily cap, waits for quiet hours, and turns refusals into tasks", async () => {
    await saveTeamSettings(me, { ...settingsOn, dailySends: 1 }, NOW);
    await setPlaybook(me, "anniversary-email", true, NOW);
    await setPlaybook(me, "check-in-email", true, NOW);
    await runTeam(me, NOW);
    const sends = (await open()).filter((m) => m.kind === "send");
    expect(sends.length).toBeGreaterThanOrEqual(2);
    const log: Sent[] = [];
    expect(await sendDueMoves(me, NOW, senders(log))).toMatchObject({ sent: 1, waiting: sends.length - 1 });
    // Tomorrow, quiet hours: it waits.
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect(await sendDueMoves(me, tomorrow, senders(log, () => ({ ok: false, error: "Quiet hours", retryAt: new Date(tomorrow.getTime() + 3_600_000).toISOString() })))).toMatchObject({ sent: 0, waiting: 1 });
    // A hard refusal becomes a task with the reason.
    expect(await sendDueMoves(me, tomorrow, senders(log, () => ({ ok: false, error: "No permission on file for marketing email." })))).toMatchObject({ refused: 1 });
    expect((await open()).some((m) => m.kind === "task" && /No permission/.test(m.note))).toBe(true);
  });

  it("takes an approval back: waiting sends go back to drafts", async () => {
    await saveTeamSettings(me, settingsOn, NOW);
    await setPlaybook(me, "anniversary-email", true, NOW);
    await runTeam(me, NOW);
    await setPlaybook(me, "anniversary-email", false, NOW);
    const log: Sent[] = [];
    await sendDueMoves(me, NOW, senders(log));
    expect(log).toHaveLength(0);
    expect((await open()).find((m) => m.playbookId === "anniversary-email")?.kind).toBe("draft");
  });

  it("works listing agents and new agents from the lists added, and welcomes them", async () => {
    await saveTeamSettings(me, settingsOn, NOW);
    const listings = "Status,Address,City,State,Zip,List Price,Listing Agent,Agent Email,Agent Phone,Office\nCanceled,44 Pine Rd,Bellevue,WA,98004,\"$850,000\",Lia Park,lia@realty.example,(206) 555-0101,Pine Realty\nExpired,9 Oak St,Kirkland,WA,98033,700000,,,,\n";
    expect(await importListings(me, listings, NOW)).toMatchObject({ ok: true, added: 1, agents: 1, skipped: 1 });
    const roster = "Name,Email,Phone,Brokerage\nNia Cho,nia@new.example,,Bright Homes\nAnn Lee,ann@example.com,,X\n";
    expect(await importNewAgents(me, roster, NOW)).toMatchObject({ ok: true, added: 1, skipped: 1 });
    await runTeam(me, NOW);
    const moves = await open();
    const lia = moves.find((m) => m.key.startsWith("listing-agent:"))!;
    expect(lia).toMatchObject({ agent: "partner", kind: "draft", playbookId: "listing-agent-intro" });
    expect(lia.title).toContain("44 Pine Rd");
    expect(lia.body).toContain("the Eastside");
    expect(moves.find((m) => m.key.startsWith("new-agent:"))).toMatchObject({ playbookId: "new-agent-welcome" });
  });

  it("suggests a closing gift, logs it with its value into expenses, and respects a yearly cap for agents", async () => {
    await saveTeamSettings(me, { ...settingsOn, giftCapDollars: 50 }, NOW);
    const ann = await by("Ann");
    await pipeline.put({ id: "ln1", ownerUserId: "lo1", externalId: "L-1", source: "test", contactId: ann.id, borrowerName: "Ann Lee", purpose: "purchase", loanType: "conv", amount: 400000, noteRate: null, milestone: "Closed", milestoneAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), history: [], keyDates: {}, agentName: null, closed: true, dead: false, updatedAt: NOW.toISOString() } as never);
    await runTeam(me, NOW);
    const gift = (await open()).find((m) => m.gift === "closing")!;
    expect(gift).toMatchObject({ agent: "pipeline", kind: "spend", contactId: ann.id });
    expect(await approveGift(me, gift.id, 0, "basket", NOW)).toMatchObject({ ok: false });
    expect(await approveGift(me, gift.id, 60, "Gift basket", NOW)).toMatchObject({ ok: true, expense: true });
    const e = await expenseStore().list("lo1", null);
    expect(e[0]).toMatchObject({ category: "gifts", amountCents: 6000, recipient: "Ann" });
  });

  it("works the income goal back to weekly numbers", () => {
    expect(goalPlan({ yearlyIncome: 240000, incomePerLoan: 5000, appToClose: 75, talkToApp: 10, partnerTouchesPerWeek: 5 })).toEqual({ loansPerYear: 48, loansPerWeek: 1, appsPerWeek: 1.3, talksPerWeek: 14, partnerTouchesPerWeek: 5 });
    expect(goalPlan({ yearlyIncome: 0, incomePerLoan: 5000, appToClose: 75, talkToApp: 10, partnerTouchesPerWeek: 5 })).toBeNull();
  });

  describe("part 2 (D54.1)", () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it("Marketing: the month's post ideas, the season's cards, a new-lead campaign, and neighborhood mail when it's on", async () => {
      await saveTeamSettings(me, { ...settingsOn, sources: [...settingsOn.sources, "mail"] }, NOW);
      await runTeam(me, NOW);
      const mk = (await open()).filter((m) => m.agent === "marketing");
      expect(mk.find((m) => m.key === "content:2026-12")).toMatchObject({ kind: "plan" });
      // Cards by mail aren't set up here, so the holiday drive says what's missing instead of offering a spend.
      expect(mk.find((m) => m.key === "season:holidays:2026")).toMatchObject({ kind: "plan", href: "/mlo/cards" });
      expect(mk.find((m) => m.key === "campaign:new_lead")).toMatchObject({ href: "/mlo/campaigns" });
      expect(mk.find((m) => m.key === "mail:2026-Q4")).toMatchObject({ kind: "spend", href: "/mlo/cards#neighborhood" });
    });

    it("Marketing: every post idea passes the wording rules", () => {
      for (const [m, ideas] of Object.entries(CONTENT)) for (const x of ideas) expect(checkTemplate(x).ok, `${m}: ${x}`).toBe(true);
    });

    it("Business Manager: profit, a set-aside, cost per loan, sources, and the estimated tax date", async () => {
      await saveEntry(me, null, { kind: "income", date: "2026-03-01", dollars: 10000, miles: 0, vendor: "Home Trust", category: "other", businessPct: 100, purpose: "Loan comp", recipient: "" }, NOW);
      await saveEntry(me, null, { kind: "expense", date: "2026-03-02", dollars: 2000, miles: 0, vendor: "Ads", category: "advertising", businessPct: 100, purpose: "Ads", recipient: "" }, NOW);
      const s = await snapshot(me, NOW);
      expect(s).toMatchObject({ incomeCents: 1_000_000, profitCents: 1_000_000 - s.expenseCents, setAsideCents: Math.round((1_000_000 - s.expenseCents) * 0.25) });
      expect(s.expenseCents).toBeGreaterThanOrEqual(200_000);
      await saveTeamSettings(me, settingsOn, NOW);
      const jan = new Date("2027-01-05T16:00:00Z");
      await runTeam(me, jan);
      expect((await open()).find((m) => m.key === "est-tax:2027-1")).toMatchObject({ agent: "business", title: "Estimated tax payment due January 15" });
    });

    it("Coach: practice calls run on the practice engine, with the goal when the AI is off", async () => {
      for (const sc of COACH_SCENARIOS) expect(checkTemplate(sc.practice.tryTo).ok, sc.id).toBe(true);
      const r = await practiceTurn("coach-rate-shopper", [{ who: "me", text: "Happy to help! Can I ask a few questions first?" }], { call: null });
      expect(r).toMatchObject({ ok: true, live: false });
      expect(r.ok && r.reply).toContain("Loan Estimate");
      expect(await practiceTurn("nope", [{ who: "me", text: "hi there" }], { call: null })).toMatchObject({ ok: false });
    });
  });
});
