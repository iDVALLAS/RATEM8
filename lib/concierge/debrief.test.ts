import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanNote, debrief, type DebriefCall } from "./debrief";
import { MemoryConciergeStore, setConciergeStoreForTests } from "./store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = { firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2021-04-01", amount: 1, noteRate: 6 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] };
const NOTE = "Talked to Ann. They want to redo the kitchen next spring and might sell in two years. Her husband is retiring soon. I'll price a cash-out against a HELOC and call her back next week.";

describe("After a call (D16)", () => {
  let concierge: MemoryConciergeStore;
  let contacts: MemoryContactStore;
  const saved = { ...process.env };
  beforeEach(async () => {
    concierge = new MemoryConciergeStore();
    contacts = new MemoryContactStore();
    setConciergeStoreForTests(concierge);
    setContactStoreForTests(contacts);
    setTouchStoreForTests(new MemoryTouchStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CC_ANTHROPIC_API_KEY;
    await importBatch(me, "contacts", [rec], "a.csv", "personal", NOW);
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setConciergeStoreForTests, setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setPipelineStoreForTests]) f(null);
  });
  const ann = async () => (await contacts.list({})).contacts[0];

  it("saves the note without personal-topic sentences, even with no AI", async () => {
    expect(cleanNote(NOTE, { names: ["Ann"] })).toMatchObject({ leftOut: 1 });
    const c = await ann();
    const r = await debrief(me, c.id, NOTE, { now: NOW });
    expect(r).toMatchObject({ ok: true, saved: true, leftOut: 1, needs: 0 });
    const notes = (await contacts.get(c.id))!.notes!;
    expect(notes).toMatch(/^Call note \(2026-11-19\): Talked to Ann\. They want to redo the kitchen/);
    expect(notes).not.toMatch(/husband|retiring/);
    expect(await debrief(me, c.id, "short", { now: NOW })).toMatchObject({ ok: false });
    expect(await debrief({ ...me, id: "lo2" }, c.id, NOTE, { now: NOW })).toMatchObject({ ok: false });
  });

  it("turns the note into notes to keep, reminders and a follow-up draft, all checked", async () => {
    const c = await ann();
    await recordConsent(me, c.id, { channel: "text", purpose: "marketing", granted: true, evidence: "written", proof: "app" }, NOW);
    let brief = "";
    const call: DebriefCall = async (_s, b) => {
      brief = b;
      return {
        stop: "end_turn",
        json: JSON.stringify({
          summary: "Ann wants to redo the kitchen next spring and may sell in two years.",
          needs: [
            { kind: "plan", fact: "Kitchen remodel next spring", words: "redo the kitchen next spring", keepDays: 300 },
            { kind: "timing", fact: "Husband retiring", words: "Her husband is retiring soon", keepDays: 300 },
            { kind: "plan", fact: "Wants a HELOC", words: "wants a HELOC today", keepDays: 300 },
          ],
          reminders: [
            { action: "price_scenario", why: "Compare a cash-out with a HELOC for the kitchen", dueInDays: 7 },
            { action: "call", why: "Call 555-010-0100 to confirm", dueInDays: 1 },
          ],
          followUp: { purpose: "marketing", body: "Thanks for the chat, Ann. I'll put the kitchen options side by side and call you next week." },
        }),
      };
    };
    const r = await debrief(me, c.id, NOTE, { now: NOW, call });
    expect(r).toMatchObject({ ok: true, needs: 1, reminders: 1, draft: true });
    // The model never saw the personal sentence.
    expect(brief).not.toMatch(/husband|retiring/);
    const [m] = await concierge.pendingMemory("lo1", NOW.toISOString());
    expect(m).toMatchObject({ fact: "Kitchen remodel next spring", source: "your call note", status: "pending" });
    expect((await concierge.tasks("lo1"))[0].title).toBe("Price Ann's scenario, then call");
    const [p] = await concierge.proposals("lo1", "pending");
    expect(p).toMatchObject({ purpose: "marketing", why: "Follow-up from your call note" });
    expect(p.gate.reason ?? "").toMatch(/do-not-call/i); // no DNC check on file yet, so it waits
  });
});
