import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { cleanState, isoDate, splitName, stateFromZip, toE164 } from "./normalize";
import { autoMap, buildRecords } from "./mapping";
import { MemoryContactStore, setContactStoreForTests } from "./store";
import { canSee, consentBadge, importBatch, recordConsent, summarize } from "./service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";

const user = (id: string, role: User["role"]): User => ({ id, email: `${id}@x.com`, name: id, role, mloId: null, status: "active", createdAt: "2026-11-18T00:00:00Z", createdBy: "t" });

describe("CSV reading (D2)", () => {
  it("handles quotes, commas and line breaks in quotes, CRLF, a BOM and semicolons", () => {
    const c = parseCsv('﻿Name,Notes\r\n"Smith, Ann","said ""call me""\nnext week"\r\nBo,\r\n\r\n');
    expect(c.headers).toEqual(["Name", "Notes"]);
    expect(c.rows).toEqual([["Smith, Ann", 'said "call me"\nnext week'], ["Bo", ""]]);
    expect(parseCsv("a;b\n1;2").rows).toEqual([["1", "2"]]);
  });
});

describe("cleaning fields (D2)", () => {
  it("normalizes phones, states, ZIPs, names and dates", () => {
    expect(toE164("(206) 555-1234")).toBe("+12065551234");
    expect(toE164("1-206-234-2734")).toBe("+12062342734");
    expect(toE164("555-1234")).toBeNull();
    expect(toE164("(206) 555-0123")).toBeNull();
    expect(cleanState("washington")).toBe("WA");
    expect(cleanState("Ore")).toBeNull();
    expect(stateFromZip("98072")).toBe("WA");
    expect(stateFromZip("97201")).toBe("OR");
    expect(stateFromZip("85001")).toBe("AZ");
    expect(stateFromZip("90210")).toBe("CA");
    expect(stateFromZip("75001")).toBe("TX");
    expect(splitName("Smith, John")).toEqual(["John", "Smith"]);
    expect(splitName("Mary Ann Lee")).toEqual(["Mary", "Ann Lee"]);
    expect(isoDate("3/7/2021")).toBe("2021-03-07");
  });
});

describe("matching columns (D2)", () => {
  it("maps a typical CRM export", () => {
    const h = ["First Name", "Last Name", "Mobile Phone", "Email Address", "Mailing City", "State", "Zip Code", "Contact Type", "Tags", "Loan Type", "Close Date", "Loan Amount", "Interest Rate", "SMS Opt In"];
    const m = autoMap(h, "contacts");
    expect(m.firstName).toBe(0);
    expect(m.lastName).toBe(1);
    expect(m.phone).toBe(2);
    expect(m.email).toBe(3);
    expect(m.state).toBe(5);
    expect(m.zip).toBe(6);
    expect(m.relationship).toBe(7);
    expect(m.closedOn).toBe(10);
    expect(m.loanAmount).toBe(11);
    expect(m.noteRate).toBe(12);
    expect(m.optInText).toBe(13);
  });
  it("maps an agent export", () => {
    const h = ["Agent Name", "Brokerage", "Phone", "Email", "State", "Total Units", "Total Volume", "Buyer Side Units", "Listing Side Units", "Average Price", "Top Lender"];
    const m = autoMap(h, "agents");
    expect(m).toMatchObject({ fullName: 0, brokerage: 1, phone: 2, email: 3, state: 4, units: 5, volume: 6, buyerUnits: 7, listingUnits: 8, avgPrice: 9, topLender: 10 });
  });
  it("builds records, skips rows nobody can be reached at, and reads opt-in columns as attestations", () => {
    const csv = parseCsv("Name,Phone,Email,Zip,Type,SMS Opt In,Close Date,Loan Amount,Rate\nAnn Lee,206-555-1234,,98072,Past client,yes,1/5/2022,\"$400,000\",3.25\nNo Way,,,,,,,,\n,,bo@x.com,,,,,,\n");
    const { records, problems } = buildRecords(csv, autoMap(csv.headers, "contacts"), "contacts");
    expect(records).toHaveLength(2);
    expect(problems).toEqual([{ row: 3, reason: "no valid phone or email" }]);
    expect(records[0]).toMatchObject({ firstName: "Ann", lastName: "Lee", phone: "+12065551234", state: "WA", relationship: "past_client", attestedOptIns: ["text"], loan: { closedOn: "2022-01-05", amount: 400000, noteRate: 3.25 } });
  });
});

describe("importing and consent (D2)", () => {
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
  const rec = (over: Record<string, unknown> = {}) => ({ firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: ["2022"], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...over });

  it("merges duplicates by phone or email without overwriting, per loan officer", async () => {
    const lo = user("lo1", "lo");
    expect(await importBatch(lo, "contacts", [rec()], "a.csv")).toEqual({ created: 1, merged: 0, skipped: 0 });
    expect(await importBatch(lo, "contacts", [rec({ phone: null, city: "Bothell", firstName: "Annie", tags: ["vip"] })], "b.csv")).toEqual({ created: 0, merged: 1, skipped: 0 });
    const { contacts } = await store.list({ ownerUserId: "lo1" });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ firstName: "Ann", city: "Bothell", tags: ["2022", "vip"] });
    // Another loan officer's import of the same person is their own record.
    expect(await importBatch(user("lo2", "lo"), "contacts", [rec()], "c.csv")).toMatchObject({ created: 1 });
  });

  it("starts everyone as relationship only, records opt-in columns as attested, and a stop revokes every phone channel", async () => {
    const lo = user("lo1", "lo");
    await importBatch(lo, "contacts", [rec(), rec({ email: "bo@x.com", phone: "+12065559999", attestedOptIns: ["text"] })], "a.csv");
    const [ann, bo] = (await store.list({ ownerUserId: "lo1" })).contacts.sort((a, b) => (a.email! < b.email! ? -1 : 1));
    expect(consentBadge(summarize(await store.consents(ann.id)))).toBe("relationship");
    expect(consentBadge(summarize(await store.consents(bo.id)))).toBe("attested");
    expect((await recordConsent(lo, ann.id, { channel: "text", purpose: "marketing", granted: true, evidence: "written", proof: "" })).ok).toBe(false);
    expect((await recordConsent(lo, ann.id, { channel: "text", purpose: "marketing", granted: true, evidence: "written", proof: "signed form 11/18" })).ok).toBe(true);
    expect(consentBadge(summarize(await store.consents(ann.id)))).toBe("proof");
    await recordConsent(lo, ann.id, { channel: "call", purpose: "service", granted: false, evidence: "revoked", proof: "asked to stop" });
    const s = summarize(await store.consents(ann.id));
    for (const ch of ["call", "ai_call", "text"] as const) for (const p of ["service", "marketing"] as const) expect(s[ch][p].granted).toBe(false);
    expect(consentBadge(s)).toBe("revoked");
  });

  it("holds prior-employer lists until the loan officer releases them", async () => {
    const lo = user("lo1", "lo");
    await importBatch(lo, "contacts", [rec()], "old-crm.csv", "prior_employer");
    const c = (await store.list({})).contacts[0];
    expect(c).toMatchObject({ provenance: "prior_employer", locked: true });
    // Re-importing from a personal list never releases the hold.
    await importBatch(lo, "contacts", [rec()], "phone.csv", "personal");
    expect((await store.get(c.id))?.locked).toBe(true);
    const { unlockContacts } = await import("./service");
    expect(await unlockContacts(user("lo2", "lo"), [c.id], "x")).toBe(0);
    expect(await unlockContacts(lo, [c.id], "x")).toBe(1);
    expect((await store.get(c.id))?.locked).toBe(false);
  });

  it("loan officers see only their own contacts; leads see the team's", async () => {
    await importBatch(user("lo1", "lo"), "contacts", [rec()], "a.csv");
    const c = (await store.list({})).contacts[0];
    expect(canSee(user("lo1", "lo"), c)).toBe(true);
    expect(canSee(user("lo2", "lo"), c)).toBe(false);
    expect(canSee(user("lead", "team_lead"), c)).toBe(true);
    expect((await recordConsent(user("lo2", "lo"), c.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "x" })).ok).toBe(false);
  });
});
