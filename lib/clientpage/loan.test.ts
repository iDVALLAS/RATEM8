import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loansForClient } from "./loan";
import { MemoryJourneyStore, setJourneyStoreForTests } from "@/lib/journey/store";
import { addDocs } from "@/lib/journey/docs";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";
import { mloById } from "@/lib/config";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };

describe("Where's my loan? (D30)", () => {
  beforeEach(async () => {
    setJourneyStoreForTests(new MemoryJourneyStore());
    setContactStoreForTests(new MemoryContactStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    const a = new MemoryAccountStore();
    setAccountStoreForTests(a);
    await a.putUser(me);
  });
  afterEach(() => {
    for (const f of [setJourneyStoreForTests, setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setAutomationStoreForTests, setAccountStoreForTests]) f(null);
  });
  const sync = (status: string, purpose = "Purchase") => ingest("lo1", readPayload({ loanNumber: "L-1", borrowerName: "Ann Lee", borrowerPhone: "(206) 555-1234", loanStatus: status, loanPurpose: purpose, interestRate: "6.5", loanAmount: "400000" })!, "arive", NOW);

  it("shows the phases, what's happening, and what's waiting on them, without dates, amounts or rates", async () => {
    const loan = await sync("Application Taken");
    await addDocs(me, loan.id, [{ name: "Pay stubs covering the most recent 30 days", why: "DU", phase: "initial" }], NOW);
    const [l] = await loansForClient(loan.contactId!, "lo1", mloById("mlo-001") ?? null, NOW);
    expect(l.phases.map((p) => [p.phase, p.state])).toEqual([["start", "now"], ["home", "next"], ["price", "next"], ["process", "next"], ["approval", "next"], ["close", "next"]]);
    expect(l.now).toBe("Your application and documents are being reviewed.");
    expect(l.waiting[0]).toBe("Upload the documents in your secure portal.");
    expect(JSON.stringify(l)).not.toMatch(/6\.5|400,?000/);
  });

  it("a refinance skips 'find the home', and a closed loan says so", async () => {
    const loan = await sync("Funded", "Refinance");
    const [l] = await loansForClient(loan.contactId!, "lo1", null, NOW);
    expect(l.phases.some((p) => p.phase === "home")).toBe(false);
    expect(l.phases.every((p) => p.state === "done")).toBe(true);
    expect(l.now).toMatch(/closed/);
    expect(await loansForClient(loan.contactId!, "lo2", null, NOW)).toEqual([]);
  });
});
