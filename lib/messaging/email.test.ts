import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSubject, emailFooter, sendEmail } from "./email";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "./store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { SPONSOR } from "@/config/licensing";
import { mloById } from "@/lib/config";
import { newMemorySignatureStore, saveSignature, setSignatureStoreForTests } from "@/lib/profile/signature";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = { firstName: "Ann", lastName: "Lee", email: "ann@example.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2021-04-01", amount: 1, noteRate: 6 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] };

describe("Email to clients (D33)", () => {
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  let concierge: MemoryConciergeStore;
  const saved = { ...process.env };
  beforeEach(async () => {
    contacts = new MemoryContactStore();
    touches = new MemoryTouchStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(touches);
    setAccountStoreForTests(new MemoryAccountStore());
    concierge = new MemoryConciergeStore();
    setConciergeStoreForTests(concierge);
    setAutomationStoreForTests(new MemoryAutomationStore());
    process.env.RESEND_API_KEY = "re_test";
    process.env.LOANM8_FROM_EMAIL = "m8@example.com";
    process.env.CC_LINK_SECRET = "test-secret";
    await importBatch(me, "contacts", [rec], "a.csv", "personal", NOW);
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests]) f(null);
  });
  const ann = async () => (await contacts.list({})).contacts[0];

  it("checks subject lines", () => {
    expect(checkSubject("A quick update on your loan")).toMatchObject({ ok: true });
    for (const bad of ["Re: your loan", "Fwd: numbers", "You're approved", "Your rate dropped", ["Act", "now on this"].join(" "), "Rates at 5.9%", ["Save", "$400"].join(" "), "CHECKING IN WITH YOU", "Hello!!", "x"]) {
      expect(checkSubject(bad).ok, bad).toBe(false);
    }
  });

  it("identifies the sender and offers a way to stop", () => {
    const f = emailFooter(me, "https://loanm8.com/my/abc");
    const mlo = mloById("mlo-001")!;
    expect(f).toContain(`NMLS #${mlo.nmls}`);
    expect(f).toContain(SPONSOR.address);
    expect(f).toContain(`NMLS #${SPONSOR.nmls}`);
    expect(f).toContain("Equal Housing Opportunity");
    expect(f).toContain("https://loanm8.com/my/abc");
    expect(emailFooter(me, null)).toMatch(/unsubscribe/);
  });

  it("sends through the gate with the footer, replies to the loan officer, and logs it", async () => {
    const c = await ann();
    let sent: { from: string; to: string; replyTo: string; subject: string; text: string } | null = null;
    const r = await sendEmail(me, c.id, "A quick update on your loan", "Hi Ann, I'll send you the numbers tomorrow.", "service", NOW, async (m) => ((sent = m), { ok: true, id: "em_1" }));
    expect(r).toEqual({ ok: true });
    expect(sent!.to).toBe("ann@example.com");
    expect(sent!.replyTo).toBe("lo1@x.com");
    expect(sent!.from).toMatch(/<m8@example\.com>$/);
    expect(sent!.text).toMatch(/\/my\//);
    expect(sent!.text).toContain(SPONSOR.address);
    const [t] = await touches.forContact(c.id);
    expect(t).toMatchObject({ channel: "email", direction: "out", status: "sent", providerId: "em_1" });
    // D31: the loan officer's own promise became a reminder.
    expect((await concierge.tasks("lo1")).some((k) => k.lane === "promise")).toBe(true);
  });

  it("D49: puts their signature between the message and the required footer", async () => {
    setSignatureStoreForTests(newMemorySignatureStore());
    try {
      const c = await ann();
      await saveSignature(me, "Pat\nhttps://cal.example/pat");
      let sent: { text: string } | null = null;
      await sendEmail(me, c.id, "A quick update on your loan", "Hi Ann, all set for Friday.", "service", NOW, async (m) => ((sent = m), { ok: true, id: "em_2" }));
      const t = sent!.text;
      expect(t.indexOf("all set for Friday")).toBeLessThan(t.indexOf("https://cal.example/pat"));
      expect(t.indexOf("https://cal.example/pat")).toBeLessThan(t.indexOf(SPONSOR.address));
      expect(t).toContain("Equal Housing Opportunity");
    } finally {
      setSignatureStoreForTests(null);
    }
  });

  it("refuses bad subjects, bodies, unsubscribed clients, other books and missing keys", async () => {
    const c = await ann();
    const ok = async () => ({ ok: true, id: "x" });
    expect(await sendEmail(me, c.id, "Re: hi", "Hello Ann, checking in.", "service", NOW, ok)).toMatchObject({ ok: false, error: expect.stringMatching(/reply or forward/) });
    expect(await sendEmail(me, c.id, "Checking in", "Your payment would be $1,900 a month.", "service", NOW, ok)).toMatchObject({ ok: false });
    expect(await sendEmail({ ...me, id: "lo2" }, c.id, "Checking in", "Hello Ann, checking in.", "service", NOW, ok)).toMatchObject({ ok: false, error: "No such contact." });
    await recordConsent(me, c.id, { channel: "email", purpose: "marketing", granted: false, evidence: "revoked", proof: "they asked" }, NOW);
    expect(await sendEmail(me, c.id, "Checking in", "Hello Ann, checking in.", "marketing", new Date(NOW.getTime() + 60_000), ok)).toMatchObject({ ok: false, error: expect.stringMatching(/unsubscribed/) });
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail(me, c.id, "Checking in", "Hello Ann, checking in.", "service", NOW, ok)).toMatchObject({ ok: false, error: expect.stringMatching(/Resend/) });
  });
});
