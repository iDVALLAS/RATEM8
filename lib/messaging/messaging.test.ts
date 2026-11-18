import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOptOut, twilioSignature, validTwilioRequest } from "./twilio";
import { MemoryTouchStore, setTouchStoreForTests } from "./store";
import { handleInbound, sendText } from "./service";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent, summarize } from "@/lib/contacts/service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";

const lo = (id: string): User => ({ id, email: `${id}@x.com`, name: id, role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" });
const rec = { firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] };
const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");

describe("texting (D4)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  let sent: URLSearchParams[];
  beforeEach(() => {
    contacts = new MemoryContactStore();
    touches = new MemoryTouchStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(touches);
    setAccountStoreForTests(new MemoryAccountStore());
    sent = [];
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG123";
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: URLSearchParams }) => {
      sent.push(new URLSearchParams(init.body));
      return new Response(JSON.stringify({ sid: `SM${"a".repeat(32)}`, status: "queued" }), { status: 201 });
    }));
  });
  afterEach(() => {
    process.env = { ...saved };
    setContactStoreForTests(null);
    setTouchStoreForTests(null);
    setAccountStoreForTests(null);
    vi.unstubAllGlobals();
  });

  it("recognizes STOP words and plain-English opt-outs, not ordinary replies", () => {
    for (const t of ["STOP", "stop.", "Unsubscribe", "opt out", "Please stop texting me", "remove me from your list", "wrong number"]) expect(isOptOut(t)).toBe(true);
    for (const t of ["Can you stop by Tuesday?", "yes", "What's my rate?"]) expect(isOptOut(t)).toBe(false);
  });

  it("verifies Twilio's signature over the URL and sorted parameters", () => {
    const params = { From: "+12065551234", Body: "hi", To: "+12065550000" };
    const sig = twilioSignature("secret", "https://loanm8.com/api/twilio/inbound", params);
    expect(validTwilioRequest("https://loanm8.com/api/twilio/inbound", params, sig)).toBe(true);
    expect(validTwilioRequest("https://loanm8.com/api/twilio/inbound", { ...params, Body: "STOP" }, sig)).toBe(false);
    expect(validTwilioRequest("https://evil.example/api/twilio/inbound", params, sig)).toBe(false);
  });

  it("sends only through the gate, signs the first text, and counts toward the caps", async () => {
    const me = lo("lo1");
    await importBatch(me, "contacts", [rec], "a.csv", "personal");
    const c = (await contacts.list({})).contacts[0];
    expect((await sendText(me, c.id, "Your appraisal came in.", "service", null, TUE_10AM_PT)).ok).toBe(false); // no permission yet
    await recordConsent(me, c.id, { channel: "text", purpose: "service", granted: true, evidence: "text_reply", proof: "texted yes" });
    expect(await sendText(me, c.id, "Your appraisal came in.", "service", null, TUE_10AM_PT)).toEqual({ ok: true });
    expect(sent[0].get("Body")).toMatch(/Your appraisal came in\.\n\n.+ at LoanM8, NMLS #\d+\. Reply STOP to opt out\./);
    expect(sent[0].get("MessagingServiceSid")).toBe("MG123");
    expect(await sendText(me, c.id, "Lunch moved to noon.", "service", null, TUE_10AM_PT)).toEqual({ ok: true });
    expect(sent[1].get("Body")).toBe("Lunch moved to noon.");
    const early = await sendText(me, c.id, "Morning!", "service", null, new Date("2026-11-17T16:00:00Z"));
    expect(early).toMatchObject({ ok: false, retryAt: "2026-11-17T17:00:00.000Z" });
  });

  it("stores a reply only with loan officers who texted that phone from that sender, never across companies", async () => {
    const a = lo("lo1");
    const b = lo("lo2");
    await importBatch(a, "contacts", [rec], "a.csv", "personal");
    await importBatch(b, "contacts", [rec], "b.csv", "personal");
    const ca = (await contacts.list({ ownerUserId: "lo1" })).contacts[0];
    const cb = (await contacts.list({ ownerUserId: "lo2" })).contacts[0];
    await recordConsent(a, ca.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "form" });
    await sendText(a, ca.id, "Hi Ann", "service", null, TUE_10AM_PT);
    const res = await handleInbound("+12065551234", "MG123", "Thanks! Talk soon", TUE_10AM_PT);
    expect(res).toEqual({ contacts: 1, optedOut: false });
    expect((await touches.forContact(ca.id)).map((t) => t.direction)).toEqual(["out", "in"]);
    expect(await touches.forContact(cb.id)).toEqual([]);
  });

  it("a STOP blocks that phone everywhere; a START to another sender can't cancel it", async () => {
    const a = lo("lo1");
    await importBatch(a, "contacts", [rec], "a.csv", "personal");
    const ca = (await contacts.list({ ownerUserId: "lo1" })).contacts[0];
    await recordConsent(a, ca.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "form" });
    await sendText(a, ca.id, "Hi Ann", "service", null, TUE_10AM_PT);
    expect(await handleInbound("+12065551234", "MG123", "Please stop texting me", TUE_10AM_PT)).toEqual({ contacts: 1, optedOut: true });
    const s = summarize(await contacts.consents(ca.id));
    for (const ch of ["call", "ai_call", "text"] as const) expect(s[ch].marketing.evidence).toBe("revoked");
    await handleInbound("+12065551234", "MG999", "START", TUE_10AM_PT); // another company's sender
    expect(await touches.optedOut("+12065551234")).toBe(true);
    // A different loan officer who imports the number later is still blocked.
    const c = lo("lo3");
    await importBatch(c, "contacts", [rec], "c.csv", "personal");
    const c3 = (await contacts.list({ ownerUserId: "lo3" })).contacts[0];
    await recordConsent(c, c3.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "form" });
    expect((await sendText(c, c3.id, "Hi", "service", null, TUE_10AM_PT)).ok).toBe(false);
    // START to the same sender clears only that sender's entry.
    await handleInbound("+12065551234", "MG123", "START", TUE_10AM_PT);
    expect(await touches.optedOut("+12065551234")).toBe(false);
  });
});
