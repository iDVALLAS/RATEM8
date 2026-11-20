import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "./store";
import { gateFor } from "./service";
import { phoneSender, phoneStop, smsHref, textFromPhone } from "./phone";

const NOW = new Date("2026-11-17T18:00:00Z"); // Tuesday 10 AM Pacific
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Doe", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = (over: Record<string, unknown> = {}) => ({ firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2020-11-19", amount: 400000, noteRate: 7.25 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...over });

describe("Text from my phone (D67)", () => {
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  const saved = { ...process.env };
  beforeEach(() => {
    // No Twilio at all: texting from your own phone doesn't need it.
    for (const k of Object.keys(process.env)) if (k.startsWith("TWILIO_")) delete process.env[k];
    contacts = new MemoryContactStore();
    touches = new MemoryTouchStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(touches);
    setConciergeStoreForTests(new MemoryConciergeStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setAccountStoreForTests(new MemoryAccountStore());
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests, setAccountStoreForTests]) f(null);
  });

  async function book() {
    await importBatch(me, "contacts", [rec(), rec({ firstName: "Bo", lastName: "Ng", phone: "+12065552222", relationship: "lead" })], "a.csv", "personal");
    const all = (await contacts.list({})).contacts;
    for (const c of all) await contacts.put({ ...c, dnc: { onList: false, checkedAt: "2026-11-10T00:00:00Z", source: "test" } });
    const a = all.find((c) => c.firstName === "Ann")!;
    const b = all.find((c) => c.firstName === "Bo")!;
    await recordConsent(me, a.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "form" }, NOW);
    return { a, b };
  }

  it("opens Messages with the text only when the contact rules allow it, and logs it", async () => {
    const { a, b } = await book();
    expect(await textFromPhone(me, b.id, "Hi Bo", "marketing", NOW)).toMatchObject({ ok: false });
    expect(await textFromPhone({ ...me, id: "lo2" }, a.id, "Hi", "service", NOW)).toMatchObject({ ok: false, error: "No such contact." });
    const r = await textFromPhone(me, a.id, "Your appraisal came back. SSN 123-45-6789", "service", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.href.startsWith("sms:+12065551234?&body=")).toBe(true);
    expect(r.body).toMatch(/Reply STOP to opt out/); // the first text says who it's from
    expect(r.body).not.toMatch(/123-45-6789/);
    const t = (await touches.forContact(a.id))[0];
    expect(t).toMatchObject({ direction: "out", channel: "text", sender: phoneSender("lo1"), status: "opened on your phone" });
    // The second service text doesn't repeat the sign-off.
    const r2 = await textFromPhone(me, a.id, "Signing is Friday.", "service", NOW);
    expect(r2.ok && r2.body).toBe("Signing is Friday.");
  });

  it("records a STOP sent to the loan officer's own phone, which ends texts and calls everywhere", async () => {
    const { a } = await book();
    expect(await phoneStop({ ...me, id: "lo2" }, a.id, NOW)).toBe(false);
    expect(await phoneStop(me, a.id, NOW)).toBe(true);
    const c = (await contacts.get(a.id))!;
    expect((await gateFor(me, c, "text", "service", NOW)).allowed).toBe(false);
    expect((await gateFor(me, c, "call", "service", NOW)).allowed).toBe(false);
    expect(await textFromPhone(me, a.id, "Hi", "service", NOW)).toMatchObject({ ok: false });
  });

  it("builds a link that works on iPhone and Android", () => {
    expect(smsHref("(206) 555-1234", "Hi & bye?")).toBe("sms:2065551234?&body=Hi%20%26%20bye%3F");
  });
});
