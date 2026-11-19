import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { previewBulk, recordBulkConsent, type BulkConsentInput } from "./bulk-consent";
import { MemoryContactStore, setContactStoreForTests } from "./store";
import { importBatch, recordConsent, summarize } from "./service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { decide } from "@/lib/send-gate/gate";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = (over: Record<string, unknown> = {}) => ({ firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2023-05-01", amount: 1, noteRate: 6 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...over });
const ok: BulkConsentInput = { channels: ["text"], purposes: ["service", "marketing"], evidence: "written", proof: "Consent in our loan application, e-signed; copies in ARIVE", confirms: { namesUs: true, canProduce: true, coversAiVoice: false } };

describe("Recording permission for past clients (D12.2)", () => {
  let store: MemoryContactStore;
  beforeEach(() => {
    store = new MemoryContactStore();
    setContactStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
  });
  afterEach(() => {
    setContactStoreForTests(null);
    setAccountStoreForTests(null);
  });

  it("covers your own past clients only, and never anyone who said stop or a previous employer's list", async () => {
    await importBatch(me, "contacts", [rec(), rec({ firstName: "Bo", phone: "+12065552222" }), rec({ firstName: "Cy", phone: "+12065553333", relationship: "lead", loan: null })], "a.csv", "personal", NOW);
    await importBatch(me, "contacts", [rec({ firstName: "Di", phone: "+12065554444" })], "old.csv", "prior_employer", NOW);
    await importBatch({ ...me, id: "lo2", email: "lo2@x.com" }, "contacts", [rec({ firstName: "Ed", phone: "+12065555555" })], "b.csv", "personal", NOW);
    const bo = (await store.list({ q: "Bo" })).contacts[0];
    await recordConsent(me, bo.id, { channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: "STOP" }, new Date(NOW.getTime() - 1000));
    const p = await previewBulk(me);
    expect(p.eligible.map((c) => c.firstName)).toEqual(["Ann"]);
    expect(p.skipped).toMatchObject({ stopped: 1, notPastClient: 1, held: 1 });
    expect(await recordBulkConsent(me, ok, NOW)).toEqual({ ok: true, people: 1, entries: 2 });
    const ann = p.eligible[0];
    const s = summarize(await store.consents(ann.id));
    expect(s.text.marketing).toMatchObject({ granted: true, evidence: "written" });
    expect(s.text.marketing.proof).toMatch(/copies in ARIVE \(recorded for past clients by lo1@x\.com/);
    // Bo's stop still wins.
    expect(summarize(await store.consents(bo.id)).text.marketing.evidence).toBe("revoked");
    // The gate now lets a marketing text through for Ann.
    const d = decide({ channel: "text", purpose: "marketing", manual: false, contact: { locked: false, state: "WA", hasPhone: true, hasEmail: false, relationship: "past_client", ebrClosedOn: null }, consent: s, licensedStates: ["WA"], dnc: { onList: false, checkedAt: "2026-11-15T00:00:00Z" }, sent: { callsLast24h: 0, textsLast24h: 0, textsLast7d: 0 }, now: NOW });
    expect(d.allowed).toBe(true);
  });

  it("needs proof, both confirmations, and a separate yes for AI voice", async () => {
    await importBatch(me, "contacts", [rec()], "a.csv", "personal", NOW);
    expect(await recordBulkConsent(me, { ...ok, proof: "yes" }, NOW)).toMatchObject({ ok: false });
    expect(await recordBulkConsent(me, { ...ok, confirms: { ...ok.confirms, namesUs: false } }, NOW)).toMatchObject({ ok: false });
    expect(await recordBulkConsent(me, { ...ok, channels: ["ai_call"] }, NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/AI voice/) });
    expect(await recordBulkConsent(me, { ...ok, channels: ["ai_call"], confirms: { ...ok.confirms, coversAiVoice: true } }, NOW)).toMatchObject({ ok: true, people: 1 });
    expect(await recordBulkConsent({ ...me, role: "assistant" }, ok, NOW)).toMatchObject({ ok: false });
  });
});
