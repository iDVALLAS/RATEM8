import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECIPES, stageOf } from "./recipes";
import { runDaily, saveAutomations, setPartnerUpdates } from "./engine";
import { MemoryAutomationStore, setAutomationStoreForTests } from "./store";
import { checkDraft } from "@/lib/concierge/guard";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";

const NOW = new Date("2026-11-17T18:00:00Z");
const lo = (id: string): User => ({ id, email: `${id}@x.com`, name: "Pat Doe", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" });
const rec = (over: Record<string, unknown> = {}) => ({ firstName: "Ann", lastName: "Lee", email: "ann@example.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "lead", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...over });
const update = (milestone: string) => readPayload({ loanNumber: "L-1", borrowerName: "Ann Lee", borrowerEmail: "ann@example.com", borrowerPhone: "(206) 555-1234", loanStatus: milestone, buyerAgentName: "Al Agent" })!;

describe("Recipes (D10)", () => {
  it("maps loan-system stage names to ours", () => {
    expect(stageOf("Application Taken")).toBe("application");
    expect(stageOf("Initial Disclosures Sent")).toBe("disclosures");
    expect(stageOf("Appraisal Ordered")).toBe("appraisal");
    expect(stageOf("Submitted to Underwriting")).toBe("underwriting");
    expect(stageOf("Approved with Conditions")).toBe("conditions");
    expect(stageOf("Clear to Close")).toBe("clear_to_close");
    expect(stageOf("Funded")).toBe("closed");
    expect(stageOf("Processing")).toBeNull();
  });
  it("every draft passes the same checks as the Concierge's (no dates, approvals, rates or promises)", () => {
    for (const r of RECIPES.filter((x) => x.body)) {
      const text = r.body!({ first: "Ann", me: "Pat", client: "Bo" });
      expect(checkDraft(text, { names: ["Ann", "Pat", "Bo"] }), r.id).toMatchObject({ ok: true });
    }
  });
});

describe("Running recipes (D10)", () => {
  let contacts: MemoryContactStore;
  let concierge: MemoryConciergeStore;
  let auto: MemoryAutomationStore;
  const me = lo("lo1");
  beforeEach(async () => {
    contacts = new MemoryContactStore();
    concierge = new MemoryConciergeStore();
    auto = new MemoryAutomationStore();
    setContactStoreForTests(contacts);
    setConciergeStoreForTests(concierge);
    setAutomationStoreForTests(auto);
    setTouchStoreForTests(new MemoryTouchStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    const accounts = new MemoryAccountStore();
    setAccountStoreForTests(accounts);
    await accounts.putUser(me);
  });
  afterEach(() => {
    for (const f of [setContactStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests, setTouchStoreForTests, setPipelineStoreForTests, setAccountStoreForTests]) f(null);
  });

  it("drafts a borrower update once per stage, only when turned on, and retires the stale one", async () => {
    await ingest("lo1", update("Application Taken"), "arive", NOW);
    expect(await concierge.proposals("lo1", "pending")).toHaveLength(0);
    await saveAutomations(me, ["borrower_application", "borrower_clear_to_close", "made_up"], NOW);
    expect((await auto.settings("lo1")).enabled).toEqual(["borrower_application", "borrower_clear_to_close"]);
    await ingest("lo1", update("Processing"), "arive", NOW);
    await ingest("lo1", update("Application Taken"), "arive", NOW);
    let pending = await concierge.proposals("lo1", "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ source: "automation", purpose: "service" });
    expect(pending[0].body).toMatch(/^Hi Ann, quick update on your loan: I've got your application/);
    // The same stage again doesn't fire twice.
    await ingest("lo1", update("Processing"), "arive", NOW);
    await ingest("lo1", update("Application Taken"), "arive", NOW);
    expect(await concierge.proposals("lo1", "pending")).toHaveLength(1);
    await ingest("lo1", update("Clear to Close"), "arive", NOW);
    pending = await concierge.proposals("lo1", "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].body).toMatch(/clear to close/);
    expect((await concierge.proposals("lo1", "stale")).length).toBe(1);
  });

  it("updates the agent only with the client's say-so, and never someone who said stop", async () => {
    await saveAutomations(me, ["agent_appraisal", "borrower_appraisal"], NOW);
    await importBatch(me, "agents", [rec({ firstName: "Al", lastName: "Agent", phone: "+12065559999", email: "al@example.com", relationship: "agent" })], "agents.csv", "agent_partner");
    const agent = (await contacts.list({ kind: "agent" })).contacts[0];
    await ingest("lo1", update("Application Taken"), "arive", NOW);
    const borrower = (await contacts.list({ kind: "contact" })).contacts[0];
    await ingest("lo1", update("Appraisal Ordered"), "arive", NOW);
    expect((await concierge.proposals("lo1", "pending")).map((p) => p.contactId)).toEqual([borrower.id]);

    expect(await setPartnerUpdates(me, borrower.id, { allowed: true, agentContactId: agent.id, proof: "" }, NOW)).toMatchObject({ ok: false });
    expect(await setPartnerUpdates(lo("lo2"), borrower.id, { allowed: true, agentContactId: agent.id, proof: "said yes by text" }, NOW)).toMatchObject({ ok: false });
    expect(await setPartnerUpdates(me, borrower.id, { allowed: true, agentContactId: agent.id, proof: "said yes by text" }, NOW)).toEqual({ ok: true });
    await recordConsent(me, borrower.id, { channel: "text", purpose: "service", granted: false, evidence: "revoked", proof: "STOP" }, NOW);
    await ingest("lo1", update("Processing"), "arive", NOW);
    // A new loan for the same client reaches appraisal: the agent gets a draft, the borrower (who said stop) doesn't.
    await ingest("lo1", { ...update("Appraisal Ordered"), externalId: "L-2" }, "arive", NOW);
    const drafts = (await concierge.proposals("lo1", "pending")).filter((p) => p.createdAt === NOW.toISOString());
    expect(drafts.map((p) => p.contactId)).toContain(agent.id);
    const toAgent = drafts.find((p) => p.contactId === agent.id)!;
    expect(toAgent.body).toMatch(/^Hi Al, an update on Ann's loan: the appraisal has been ordered/);
  });

  it("the morning run: a 30-day check-in once, and a permission reminder for new contacts", async () => {
    await saveAutomations(me, ["post_close_30", "new_contact_permission"], NOW);
    await importBatch(me, "contacts", [rec({ relationship: "past_client", loan: { closedOn: "2026-10-15", amount: 1, noteRate: 6 } }), rec({ firstName: "Bo", phone: "+12065552222", email: "bo@example.com" })], "a.csv", "personal", NOW);
    const [ann] = (await contacts.list({ q: "Ann" })).contacts;
    await recordConsent(me, ann.id, { channel: "text", purpose: "marketing", granted: true, evidence: "web_form", proof: "form" }, NOW);
    const r = await runDaily(me, NOW);
    expect(r).toMatchObject({ drafted: 1, reminders: 1 });
    expect((await concierge.tasks("lo1"))[0].title).toBe("Ask Bo how they'd like to hear from you");
    expect(await runDaily(me, NOW)).toMatchObject({ drafted: 0, reminders: 0 });
  });
});
