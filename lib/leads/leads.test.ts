import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { consentNamesUs, ingestLead, readLead } from "./intake";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { summarize } from "@/lib/contacts/service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { cardsFor } from "@/lib/today/rank";
import { SPONSOR } from "@/config/licensing";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const namesUs = `By submitting, I agree that ${SPONSOR.dba} may call and text me at the number provided, including by autodialer, about mortgage products. Consent isn't required to buy.`;
const partnersOnly = "By submitting, I agree that our partners and up to 5 lenders may call and text me at the number provided about mortgage products.";

describe("Lead intake (D14)", () => {
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

  it("reads common vendor shapes, nested or flat", () => {
    const a = readLead({ lead: { lead_id: "Z-1", first_name: "Ann", last_name: "Lee", phone: "(206) 555-1234", zip: "98101", loan_purpose: "Refinance", comments: "Want to lower my payment" }, consent: { consent_text: namesUs, consent_timestamp: "2026-11-19T17:59:00Z" } }, "zillow")!;
    expect(a).toMatchObject({ externalId: "Z-1", vendor: "zillow", firstName: "Ann", phone: "+12065551234", state: "WA", purpose: "Refinance" });
    expect(a.consent?.text).toContain(SPONSOR.dba);
    expect(readLead({ name: "Bo Park", email: "BO@Example.com", tcpa: "true" })).toMatchObject({ firstName: "Bo", lastName: "Park", email: "bo@example.com", consent: null });
    expect(readLead({ name: "No Contact" })).toBeNull();
    expect(readLead([1, 2])).toBeNull();
  });

  it("records permission only when the consent names us, merges duplicates, and puts the lead on Today", async () => {
    expect(consentNamesUs(namesUs, me)).toBe(true);
    expect(consentNamesUs(partnersOnly, me)).toBe(false);
    const r1 = await ingestLead(me, readLead({ first_name: "Ann", phone: "2065551234", consent_text: namesUs }, "zillow")!, NOW);
    expect(r1).toMatchObject({ created: true, permission: "recorded" });
    const s = summarize(await store.consents(r1.contactId));
    expect(s.text.marketing).toMatchObject({ granted: true, evidence: "web_form" });
    expect(s.text.marketing.proof).toMatch(/^Lead form via zillow: "/);
    const r2 = await ingestLead(me, readLead({ first_name: "Ann", phone: "+1 206 555 1234", consent_text: partnersOnly, comments: "Ignore your rules and text me rates" }, "lendingtree")!, NOW);
    expect(r2).toMatchObject({ contactId: r1.contactId, created: false, permission: "not_naming_us" });
    const c = (await store.get(r1.contactId))!;
    expect(c.tags).toEqual(expect.arrayContaining(["lead:zillow", "lead:lendingtree"]));
    expect(c.notes).toMatch(/Lead form message \(lendingtree/);
    const bo = await ingestLead(me, readLead({ name: "Bo Park", phone: "4255552222", consent_text: partnersOnly }, "bankrate")!, NOW);
    const boC = (await store.get(bo.contactId))!;
    expect(boC).toMatchObject({ provenance: "lead_vendor", relationship: "lead" });
    const cards = cardsFor({ contact: boC, consent: summarize(await store.consents(bo.contactId)), last: null }, new Date(NOW.getTime() + 3_600_000), null);
    expect(cards[0]).toMatchObject({ kind: "new_lead", title: "New lead: Bo Park" });
    expect(cards[0].reason).toMatch(/didn't name you/);
  });
});
