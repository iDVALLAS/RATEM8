import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch } from "@/lib/contacts/service";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { resetMemoryCounters } from "@/lib/m8/kv";
import { myValues } from "@/lib/templates/service";
import { STARTERS } from "./library";
import { MemoryCampaignStore, setCampaignStoreForTests, type Campaign } from "./store";
import { aiCreateCampaign, checkCampaign, checkStep, createCampaign, enroll, nextSendTime, onContactReply, onNewLead, runDue, runEnrollment, saveCampaign, setCampaignStatus, type CampaignCall, type Senders } from "./service";

// Wednesday 2026-11-18, 11:00 in Seattle.
const NOW = new Date("2026-11-18T19:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Quinn", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
const rec = (first: string, phone: string) => ({ firstName: first, lastName: "Lee", email: `${(first || "x").toLowerCase()}@example.com`, phone, phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] });

let campaigns: MemoryCampaignStore;
let contacts: MemoryContactStore;
let concierge: MemoryConciergeStore;
let calls: { ch: string; to: string; body: string }[];
const ok: Senders = {
  text: async (_a, c, b) => (calls.push({ ch: "text", to: c, body: b }), { ok: true }),
  email: async (_a, c, s, b) => (calls.push({ ch: "email", to: c, body: `${s}|${b}` }), { ok: true }),
};
const saved = { ...process.env };

beforeEach(async () => {
  campaigns = new MemoryCampaignStore();
  contacts = new MemoryContactStore();
  concierge = new MemoryConciergeStore();
  setCampaignStoreForTests(campaigns);
  setContactStoreForTests(contacts);
  setConciergeStoreForTests(concierge);
  setTouchStoreForTests(new MemoryTouchStore());
  const accounts = new MemoryAccountStore();
  setAccountStoreForTests(accounts);
  await accounts.putUser(me);
  await accounts.putUser(other);
  resetMemoryCounters();
  calls = [];
  delete process.env.CC_CAMPAIGNS;
  await importBatch(me, "contacts", [rec("Ann", "+12065550101"), rec("Bo", "+12065550102"), rec("", "+12065550103")], "a.csv", "personal", NOW);
  await importBatch(other, "contacts", [rec("Zed", "+12065550199")], "b.csv", "personal", NOW);
});
afterEach(() => {
  process.env = { ...saved };
  for (const f of [setCampaignStoreForTests, setContactStoreForTests, setConciergeStoreForTests, setTouchStoreForTests, setAccountStoreForTests]) f(null);
});

const byName = async (first: string, owner = me.id) => (await contacts.list({ ownerUserId: owner })).contacts.find((c) => (c.firstName ?? "") === first)!;

async function made(over: Partial<Campaign> = {}) {
  const c = await createCampaign(me, {}, NOW);
  const full: Campaign = {
    ...c,
    name: "Test",
    days: [0, 1, 2, 3, 4, 5, 6],
    hours: { start: 8, end: 20 },
    steps: [
      { id: "st_a", channel: "text", waitDays: 0, subject: "", body: "Hi {first}, it's {myFirst} with {company}. Checking in." },
      { id: "st_b", channel: "email", waitDays: 0, subject: "Checking in", body: "Hi {first}, just checking in.\n\n{myName}" },
      { id: "st_c", channel: "task", waitDays: 2, subject: "", body: "Call {first}." },
    ],
    status: "active",
    ...over,
  };
  await campaigns.putCampaign(full);
  return full;
}

describe("Campaign checks (D51)", () => {
  it("every starter passes the wording checks", () => {
    for (const s of STARTERS) {
      const steps = s.steps.map((x, i) => ({ id: `st_${i}`, channel: x.channel, waitDays: x.waitDays, subject: x.subject ?? "", body: x.body }));
      expect(checkCampaign({ name: s.name, steps, days: [1, 2, 3, 4, 5], hours: { start: 9, end: 18 } }), s.id).toBeNull();
    }
  });

  it("refuses unknown fields, rates, long texts and emails without a subject", () => {
    const base = { id: "st_x", waitDays: 0, subject: "" };
    expect(checkStep({ ...base, channel: "text", body: "Hi {first}, your {address} is ready" })).toMatch(/isn't a field/);
    expect(checkStep({ ...base, channel: "text", body: "Rates are 5.5% today" })).toBeTruthy();
    expect(checkStep({ ...base, channel: "text", body: "x".repeat(481) })).toMatch(/480/);
    expect(checkStep({ ...base, channel: "email", body: "Hello" })).toMatch(/subject/);
    expect(checkStep({ ...base, channel: "task", body: "Call {first}." })).toBeNull();
  });
});

describe("Running campaigns (D51)", () => {
  it("adds only people from your own book, once each", async () => {
    const c = await made();
    const ann = await byName("Ann"), zed = await byName("Zed", other.id);
    expect(await enroll(me, c.id, [ann.id, ann.id, zed.id], NOW)).toMatchObject({ added: 1, skipped: 1 });
    expect(await enroll(me, c.id, [ann.id], NOW)).toMatchObject({ added: 0, skipped: 1 });
    expect(await enroll(other, c.id, [zed.id], NOW)).toBeNull();
  });

  it("sends the day-0 text and email together, adds the task later, then finishes", async () => {
    const c = await made();
    const ann = await byName("Ann");
    await enroll(me, c.id, [ann.id], NOW);
    expect(await runDue(NOW, { senders: ok })).toMatchObject({ sent: 2 });
    expect(calls.map((x) => x.ch)).toEqual(["text", "email"]);
    const v = myValues(me);
    expect(calls[0].body).toBe(`Hi Ann, it's ${v.myFirst} with ${v.company}. Checking in.`);
    let [e] = await campaigns.enrollments(c.id);
    expect(e).toMatchObject({ stepIndex: 2, status: "active" });
    expect(Date.parse(e.nextAt) - NOW.getTime()).toBe(2 * 86_400_000);
    await runDue(new Date(Date.parse(e.nextAt)), { senders: ok });
    [e] = await campaigns.enrollments(c.id);
    expect(e.status).toBe("done");
    expect((await concierge.tasks(me.id)).some((t) => t.title === "Call Ann.")).toBe(true);
  });

  it("waits for the campaign's sending hours in their time zone", async () => {
    const c = await made({ hours: { start: 9, end: 18 }, days: [1, 2, 3, 4, 5] });
    const ann = await byName("Ann");
    const night = new Date("2026-11-18T11:00:00Z"); // 3 AM in Seattle
    await enroll(me, c.id, [ann.id], night);
    expect(await runDue(night, { senders: ok })).toMatchObject({ sent: 0, waiting: 1 });
    const [e] = await campaigns.enrollments(c.id);
    expect(e.stepIndex).toBe(0);
    expect(new Date(e.nextAt).getTime()).toBe(nextSendTime(c, "America/Los_Angeles", night).getTime());
    expect(new Date(e.nextAt).toISOString()).toBe("2026-11-18T17:01:00.000Z"); // 9:01 AM Pacific
  });

  it("tries the same step again when the contact rules say later, and skips with the reason otherwise", async () => {
    const c = await made();
    const ann = await byName("Ann");
    await enroll(me, c.id, [ann.id], NOW);
    const later: Senders = { text: async () => ({ ok: false, error: "Outside quiet hours", retryAt: "2026-11-18T22:00:00.000Z" }), email: ok.email };
    await runDue(NOW, { senders: later });
    let [e] = await campaigns.enrollments(c.id);
    expect(e).toMatchObject({ stepIndex: 0, nextAt: "2026-11-18T22:00:00.000Z" });
    const blocked: Senders = { text: async () => ({ ok: false, error: "No permission", reasons: ["They haven't given permission to text."] }), email: ok.email };
    await runDue(new Date("2026-11-18T22:00:00Z"), { senders: blocked });
    [e] = await campaigns.enrollments(c.id);
    expect(e.log[0]).toMatchObject({ outcome: "skipped", note: "Skipped: They haven't given permission to text." });
    expect(e.log[1]).toMatchObject({ outcome: "sent" });
  });

  it("skips a step it can't fill in rather than sending a blank", async () => {
    const c = await made();
    const nameless = await byName("");
    await enroll(me, c.id, [nameless.id], NOW);
    await runDue(NOW, { senders: ok });
    const [e] = await campaigns.enrollments(c.id);
    expect(e.log[0].note).toMatch(/no first name/);
    expect(calls).toHaveLength(0);
  });

  it("a reply ends a follow-up campaign but not a keep-in-touch one; STOP ends both", async () => {
    const f = await made({ kind: "followup" });
    const n = await made({ kind: "nurture", steps: [{ id: "st_z", channel: "task", waitDays: 30, subject: "", body: "Call {first}." }] });
    const ann = await byName("Ann");
    await enroll(me, f.id, [ann.id], NOW);
    await enroll(me, n.id, [ann.id], NOW);
    expect(await onContactReply(ann.id, false, NOW)).toBe(1);
    expect((await campaigns.activeForContact(ann.id)).map((e) => e.campaignId)).toEqual([n.id]);
    expect(await onContactReply(ann.id, true, NOW)).toBe(1);
    expect(await campaigns.activeForContact(ann.id)).toEqual([]);
  });

  it("does nothing when campaigns are switched off, and holds paused campaigns", async () => {
    const c = await made();
    const ann = await byName("Ann");
    await enroll(me, c.id, [ann.id], NOW);
    process.env.CC_CAMPAIGNS = "false";
    expect(await runDue(NOW, { senders: ok })).toMatchObject({ ran: 0 });
    delete process.env.CC_CAMPAIGNS;
    await campaigns.putCampaign({ ...c, status: "paused" });
    await runDue(NOW, { senders: ok });
    expect(calls).toHaveLength(0);
    const [e] = await campaigns.enrollments(c.id);
    expect(Date.parse(e.nextAt)).toBe(NOW.getTime() + 86_400_000);
  });

  it("new leads go straight into 'new lead' campaigns and get the first steps right away", async () => {
    await made({ trigger: "new_lead" });
    await made({ trigger: "manual" });
    const bo = await byName("Bo");
    expect(await onNewLead(me, bo.id, NOW, ok)).toBe(1);
    expect(calls.map((x) => x.ch)).toEqual(["text", "email"]);
  });
});

describe("Editing and the AI writer (D51)", () => {
  it("won't let an edit break a running campaign, and turning on needs a clean campaign", async () => {
    const c = await made();
    const r = await saveCampaign(me, c.id, { ...c, steps: [{ channel: "text", waitDays: 0, subject: "", body: "Rates are 5% now" }] }, NOW);
    expect(r.ok).toBe(false);
    expect((await campaigns.getCampaign(c.id))!.steps).toHaveLength(3);
    const d = await createCampaign(me, {}, NOW);
    await saveCampaign(me, d.id, { ...d, name: "x".repeat(2), steps: [] }, NOW);
    expect((await setCampaignStatus(me, d.id, "active", NOW)).ok).toBe(false);
  });

  it("drafts a campaign from a goal, leaves out steps that fail the checks, and falls back to a starter", async () => {
    const call: CampaignCall = async () => ({
      json: JSON.stringify({ name: "Open house follow-up", kind: "followup", purpose: "marketing", steps: [
        { channel: "text", waitDays: 0, subject: "", body: "Hi {first}, it's {myFirst} with {company}. Thanks for stopping by the open house." },
        { channel: "email", waitDays: 2, subject: "Thanks for stopping by", body: "Hi {first},\n\nIf you have financing questions, reply here.\n\n{myName}" },
        { channel: "text", waitDays: 3, subject: "", body: "Rates just dropped to 5.1%!" },
      ] }),
      stop: "end_turn",
    });
    const r = await aiCreateCampaign(me, "Follow up with open house sign-ins", NOW, { call });
    expect(r.ok && r.by).toBe("ai");
    expect(r.ok && r.campaign.steps).toHaveLength(2);
    expect(r.ok && r.campaign.status).toBe("draft");
    const f = await aiCreateCampaign(me, "Stay in touch with past clients all year", NOW, { call: null });
    expect(f.ok && f.by).toBe("starter");
    expect(f.ok && f.campaign.origin).toBe("starter:past-client");
  });
});
