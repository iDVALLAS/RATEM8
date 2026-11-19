import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dueFor, findPromises, recordPromises } from "./promises";
import { MemoryConciergeStore, setConciergeStoreForTests } from "./store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { MemoryContactStore, setContactStoreForTests, type Contact } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { todayFor } from "@/lib/today/facts";

const THU = new Date("2026-11-19T18:00:00Z"); // Thursday 10 AM Pacific
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const ann = { id: "c1", firstName: "Ann", lastName: "Lee", ownerUserId: "lo1", kind: "contact", locked: false, relationship: "past_client", tags: [], source: "t", createdAt: "", updatedAt: "", phone: null, email: null, loan: null, state: "WA" } as unknown as Contact;

describe("Promises ledger (D31)", () => {
  it("reads when the loan officer said they'd do something", () => {
    expect(dueFor("today", THU)).toBe("2026-11-19");
    expect(dueFor("tomorrow", THU)).toBe("2026-11-20");
    expect(dueFor("tuesday", THU)).toBe("2026-11-24");
    expect(dueFor("thursday", THU)).toBe("2026-11-26"); // a week out, not today
    expect(dueFor("next week", THU)).toBe("2026-11-23");
    expect(dueFor("by end of the week", THU)).toBe("2026-11-20");
    const p = findPromises("Thanks Ann! I'll send you numbers Tuesday. Talk soon.", THU);
    expect(p).toEqual([{ what: "send you numbers", when: "tuesday", due: "2026-11-24", sentence: "I'll send you numbers Tuesday." }]);
    expect(findPromises("Let me call you back tomorrow morning", THU)[0]).toMatchObject({ what: "call you back", due: "2026-11-20" });
    expect(findPromises("Rates moved today. Your appraisal came in.", THU)).toEqual([]);
  });

  describe("recording", () => {
    let concierge: MemoryConciergeStore;
    beforeEach(() => {
      concierge = new MemoryConciergeStore();
      setConciergeStoreForTests(concierge);
      setAutomationStoreForTests(new MemoryAutomationStore());
      setContactStoreForTests(new MemoryContactStore());
      setTouchStoreForTests(new MemoryTouchStore());
      setAccountStoreForTests(new MemoryAccountStore());
      setPipelineStoreForTests(new MemoryPipelineStore());
    });
    afterEach(() => {
      for (const f of [setConciergeStoreForTests, setAutomationStoreForTests, setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setPipelineStoreForTests]) f(null);
    });
    it("sets a reminder once, and puts it on Today when it's due", async () => {
      expect(await recordPromises(me, ann, "I'll send you numbers Tuesday.", "text:SM1", THU)).toBe(1);
      expect(await recordPromises(me, ann, "I'll send you numbers Tuesday.", "text:SM1", THU)).toBe(0);
      const [t] = await concierge.tasks("lo1");
      expect(t).toMatchObject({ lane: "promise", due: "2026-11-24", title: "Your promise to Ann: send you numbers (tuesday)" });
      expect((await todayFor(me, THU)).cards.some((c) => c.kind === "promise")).toBe(false);
      const tue = await todayFor(me, new Date("2026-11-24T18:00:00Z"));
      expect(tue.cards[0]).toMatchObject({ kind: "promise", contactId: "c1" });
      const wed = await todayFor(me, new Date("2026-11-25T18:00:00Z"));
      expect(wed.cards[0].title).toMatch(/was due 2026-11-24/);
    });
  });
});
