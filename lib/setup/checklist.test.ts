import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checklist, setSetupStoreForTests, setupStore } from "./checklist";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { saveSettings } from "@/lib/concierge/desk";

const NOW = new Date("2026-11-19T18:00:00Z");
const lo: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = { firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] };

describe("Setup guide (D24)", () => {
  beforeEach(() => {
    setContactStoreForTests(new MemoryContactStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setAccountStoreForTests(new MemoryAccountStore());
    const marks = new Map<string, Set<string>>();
    setSetupStoreForTests({ marks: async (u) => [...(marks.get(u) ?? [])], setMark: async (u, id, d) => void (d ? marks.set(u, new Set([...(marks.get(u) ?? []), id])) : marks.get(u)?.delete(id)) });
  });
  afterEach(() => {
    for (const f of [setContactStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests, setPipelineStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setSetupStoreForTests]) f(null);
  });
  const done = async (u: User) => Object.fromEntries((await checklist(u, NOW)).map((i) => [i.id, i.done]));

  it("reads the real state, and owners get the platform items", async () => {
    let d = await done(lo);
    expect(d).toMatchObject({ record: true, contacts: false, permission: false, concierge: false, optout_wording: false });
    expect("cron" in d).toBe(false);
    await importBatch(lo, "contacts", [rec], "a.csv", "personal", NOW);
    await saveSettings(lo, { enabled: true, voice: "friendly, short", digest: true }, NOW);
    await setupStore().setMark("lo1", "optout_wording", true);
    d = await done(lo);
    expect(d).toMatchObject({ contacts: true, concierge: true, digest: true, optout_wording: true, dnc: false });
    expect("cron" in (await done({ ...lo, role: "owner" }))).toBe(true);
  });

  it("counts permission and do-not-call checks", async () => {
    const store = new MemoryContactStore();
    setContactStoreForTests(store);
    await importBatch(lo, "contacts", [rec], "a.csv", "personal", NOW);
    const [c] = (await store.list({})).contacts;
    await recordConsent(lo, c.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "app" }, NOW);
    await store.put({ ...c, dnc: { onList: false, checkedAt: "2026-11-18T00:00:00Z", source: "t" } });
    const items = await checklist(lo, NOW);
    expect(items.find((i) => i.id === "permission")).toMatchObject({ done: true, detail: "1 of 1" });
    expect(items.find((i) => i.id === "dnc")).toMatchObject({ done: true, detail: "1 of 1 checked" });
  });
});
