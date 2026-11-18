import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callQueue, logCall } from "./session";
import { digestFor, sendDigest } from "@/lib/digest";
import { saveSettings } from "@/lib/concierge/desk";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent, summarize } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { handleInbound, sendText } from "@/lib/messaging/service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryScriptStore, setScriptStoreForTests } from "@/lib/scripts/store";

const NOW = new Date("2026-11-17T18:00:00Z"); // Tuesday 10 AM Pacific
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Doe", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = (over: Record<string, unknown> = {}) => ({ firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2020-11-19", amount: 400000, noteRate: 7.25 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...over });

describe("Morning digest and call session (D11)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  beforeEach(() => {
    contacts = new MemoryContactStore();
    touches = new MemoryTouchStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(touches);
    setConciergeStoreForTests(new MemoryConciergeStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setScriptStoreForTests(new MemoryScriptStore());
    process.env.TWILIO_ACCOUNT_SID = "AC1";
    process.env.TWILIO_AUTH_TOKEN = "t";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG123";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sid: `SM${"b".repeat(32)}`, status: "queued" }), { status: 201 })));
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests, setAccountStoreForTests, setPipelineStoreForTests, setScriptStoreForTests]) f(null);
    vi.unstubAllGlobals();
  });

  async function book() {
    await importBatch(me, "contacts", [rec(), rec({ firstName: "Bo", phone: "+12065552222", relationship: "lead", loan: { closedOn: "2021-11-20", amount: 1, noteRate: 3 } })], "a.csv", "personal");
    const all = (await contacts.list({})).contacts;
    const a = all.find((c) => c.firstName === "Ann")!;
    const b = all.find((c) => c.firstName === "Bo")!;
    for (const c of [a, b]) await contacts.put({ ...c, dnc: { onList: false, checkedAt: "2026-11-10T00:00:00Z", source: "test" } });
    // Ann gave written permission for calls; Bo is a lead with none (past clients can be hand-dialed, leads can't).
    await recordConsent(me, a.id, { channel: "call", purpose: "marketing", granted: true, evidence: "written", proof: "form" }, NOW);
    await recordConsent(me, a.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "form" }, NOW);
    return { a: (await contacts.get(a.id))!, b: (await contacts.get(b.id))! };
  }

  it("the digest is off by default, carries names and counts only, and sends once a day", async () => {
    const { a } = await book();
    await sendText(me, a.id, "Hi Ann", "service", null, new Date(NOW.getTime() - 3_600_000));
    await handleInbound("+12065551234", "MG123", "My rate is 7.25% and my number is 206-555-1234, call me", NOW);
    const send = vi.fn(async () => true);
    expect(await sendDigest(me, NOW, send)).toBe("skipped");
    await saveSettings(me, { digest: true }, NOW);
    const d = await digestFor(me, NOW);
    expect(d.text).toMatch(/Ann: They texted and are waiting for a reply/);
    expect(d.text).not.toMatch(/7\.25|%|555|call me|Lee/);
    expect(await sendDigest(me, NOW, send)).toBe("sent");
    expect(await sendDigest(me, NOW, send)).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("queues only people the gate allows, says why for the rest, and moves on once a call is logged", async () => {
    const { a, b } = await book();
    let q = await callQueue(me, NOW);
    expect(q.ready.map((x) => x.contact.id)).toEqual([a.id]);
    expect(q.blocked.map((x) => x.contact.id)).toEqual([b.id]);
    expect(q.blocked[0].reason).toBeTruthy();
    expect(await logCall(me, a.id, "made_up", "", "marketing", NOW)).toMatchObject({ ok: false });
    expect(await logCall({ ...me, id: "lo2" }, a.id, "reached", "", "marketing", NOW)).toMatchObject({ ok: false });
    expect(await logCall(me, a.id, "voicemail", "left a message, SSN 123-45-6789", "marketing", NOW)).toEqual({ ok: true });
    expect((await touches.forContact(a.id))[0].body).not.toContain("123-45-6789");
    q = await callQueue(me, NOW);
    expect(q.ready).toHaveLength(0);
    expect(q.done).toBe(1);
  });

  it("a wrong number records a stop for calls and texts", async () => {
    const { a } = await book();
    await logCall(me, a.id, "wrong_number", "", "marketing", NOW);
    const s = summarize(await contacts.consents(a.id));
    expect(s.call.marketing.evidence).toBe("revoked");
    expect(s.text.service.evidence).toBe("revoked");
  });
});
