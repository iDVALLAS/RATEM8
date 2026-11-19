import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientLink, maskPhone, readToken, tokenFor } from "./link";
import { clientForget, clientOptIn, clientStop, loadClient, rotateLink } from "./service";
import { draftClientLink } from "./draft";
import { checkDraft } from "@/lib/concierge/guard";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, summarize } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Doe", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = { firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] };

describe("A client's own page (D26)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  let concierge: MemoryConciergeStore;
  beforeEach(async () => {
    process.env.CC_LINK_SECRET = "test-secret";
    contacts = new MemoryContactStore();
    touches = new MemoryTouchStore();
    concierge = new MemoryConciergeStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(touches);
    setConciergeStoreForTests(concierge);
    setPipelineStoreForTests(new MemoryPipelineStore());
    const a = new MemoryAccountStore();
    setAccountStoreForTests(a);
    await a.putUser(me);
    await importBatch(me, "contacts", [rec], "a.csv", "personal", NOW);
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setAccountStoreForTests]) f(null);
  });
  const ann = async () => (await contacts.list({})).contacts[0];

  it("signs links, refuses tampered or replaced ones, and masks the phone", async () => {
    const c = await ann();
    const t = tokenFor(c.id)!;
    expect(readToken(t)).toEqual({ contactId: c.id, version: 0 });
    expect(readToken(`${t.slice(0, -2)}xx`)).toBeNull();
    expect(readToken(`${Buffer.from("c_other.0").toString("base64url")}.${t.split(".")[1]}`)).toBeNull();
    expect((await loadClient(t, NOW))?.contact.id).toBe(c.id);
    await rotateLink(c, NOW);
    expect(await loadClient(t, NOW)).toBeNull();
    expect(await loadClient(tokenFor(c.id, 1)!, NOW)).not.toBeNull();
    expect(maskPhone("+12065551234")).toBe("(•••) •••-1234");
    delete process.env.CC_LINK_SECRET;
    delete process.env.DATABASE_URL;
    expect(tokenFor(c.id)).toBeNull();
  });

  it("opting in records the exact wording as proof; stopping blocks the number for everyone and retires drafts", async () => {
    const c = await ann();
    const t = tokenFor(c.id)!;
    expect(await clientOptIn(t, ["marketing"], false, NOW)).toMatchObject({ ok: false });
    expect(await clientOptIn(t, ["service", "marketing"], true, NOW)).toMatchObject({ ok: true });
    let s = summarize(await contacts.consents(c.id));
    expect(s.text.marketing).toMatchObject({ granted: true, evidence: "web_form" });
    expect(s.text.marketing.proof).toMatch(/^Their own page, .*I agree that .* may text me at \(•••\) •••-1234/);
    await concierge.putProposal({ id: "p1", ownerUserId: "lo1", contactId: c.id, kind: "text", purpose: "marketing", body: "Hi", why: "x", source: "model", status: "pending", gate: { allowed: true, reason: null }, createdAt: NOW.toISOString(), decidedAt: null, decidedBy: null });
    expect(await clientStop(t, "phone", new Date(NOW.getTime() + 1000))).toMatchObject({ ok: true });
    s = summarize(await contacts.consents(c.id));
    expect(s.text.marketing.evidence).toBe("revoked");
    expect(s.call.service.evidence).toBe("revoked");
    expect(await touches.optedOut("+12065551234")).toBe(true);
    expect((await concierge.proposal("p1"))?.status).toBe("stale");
  });

  it("shows kept notes and lets them delete one; the loan officer's text with the link passes the checks", async () => {
    const c = await ann();
    const t = tokenFor(c.id)!;
    await concierge.addMemory({ id: "m1", ownerUserId: "lo1", contactId: c.id, kind: "plan", fact: "Kitchen remodel", quote: "redo the kitchen", source: "client text", expiresAt: null, createdAt: "", status: "kept" });
    await concierge.addMemory({ id: "m2", ownerUserId: "lo1", contactId: c.id, kind: "plan", fact: "Pending note", quote: "x", source: "client text", expiresAt: null, createdAt: "", status: "pending" });
    expect((await loadClient(t, NOW))!.notes.map((n) => n.id)).toEqual(["m1"]);
    expect(await clientForget(t, "m2", NOW)).toMatchObject({ ok: false });
    expect(await clientForget(t, "m1", NOW)).toMatchObject({ ok: true });
    expect((await loadClient(t, NOW))!.notes).toEqual([]);
    expect(checkDraft(`Hi Ann, here's your own page, where you can see and change how I contact you: ${clientLink(c.id)} -Pat`, { names: ["Ann", "Pat"] })).toMatchObject({ ok: true });
    expect(await draftClientLink(me, c.id, NOW)).toEqual({ ok: true });
    expect(await draftClientLink({ ...me, id: "lo2" }, c.id, NOW)).toMatchObject({ ok: false });
  });
});
