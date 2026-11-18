import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ingest, readPayload } from "./intake";
import { alertsFor, learnPace } from "./guardian";
import { MemoryPipelineStore, setPipelineStoreForTests, type Loan } from "./store";
import { createKey, ownerForKey } from "./keys";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryAccountStore, setAccountStoreForTests } from "@/lib/accounts/store";

const T = (d: string) => new Date(`${d}T18:00:00Z`);

describe("pipeline sync (D7)", () => {
  let contacts: MemoryContactStore;
  beforeEach(() => {
    contacts = new MemoryContactStore();
    setContactStoreForTests(contacts);
    setPipelineStoreForTests(new MemoryPipelineStore());
    setAccountStoreForTests(new MemoryAccountStore());
  });
  afterEach(() => {
    setContactStoreForTests(null);
    setPipelineStoreForTests(null);
    setAccountStoreForTests(null);
  });

  it("reads ARIVE-style and nested Zapier payloads, and refuses ones with no loan number or status", () => {
    const u = readPayload({ "Loan Number": "A-1001", Borrower_First_Name: "Ann", "Borrower Last Name": "Lee", "Borrower Mobile": "(206) 555-1234", "Loan Status": "Submitted to Underwriting", "Loan Amount": "$400,000", "Interest Rate": "6.5", "Lock Expiration Date": "12/01/2026", "Estimated Closing Date": "2026-12-10", "Buyer Agent Name": "Pat Jones" })!;
    expect(u).toMatchObject({ externalId: "A-1001", borrowerName: "Ann Lee", phone: "+12065551234", milestone: "Submitted to Underwriting", amount: 400000, noteRate: 6.5, agentName: "Pat Jones", keyDates: { lockExpires: "2026-12-01", closing: "2026-12-10" } });
    expect(readPayload({ data: { loan_number: "B-2", status: "Processing", borrower: { name: "Bo Park" } } })).toMatchObject({ externalId: "B-2", milestone: "Processing" });
    expect(readPayload({ status: "Processing" })).toBeNull();
    expect(readPayload("nope")).toBeNull();
  });

  it("upserts by loan number, keeps stage history, links the borrower, and makes them a past client at closing", async () => {
    const base = { externalId: "A-1", borrowerName: "Ann Lee", email: "ann@x.com", phone: "+12065551234", purpose: "Purchase", loanType: "Conventional", amount: 400000, noteRate: 6.5, agentName: null, keyDates: { application: null, lockExpires: null, appraisal: null, clearToClose: null, closing: "2026-12-10" } };
    const l1 = await ingest("lo1", { ...base, milestone: "Processing" }, "arive", T("2026-11-01"));
    const l2 = await ingest("lo1", { ...base, milestone: "Processing" }, "arive", T("2026-11-02"));
    expect(l2.id).toBe(l1.id);
    expect(l2.history).toHaveLength(1);
    const l3 = await ingest("lo1", { ...base, milestone: "Funded" }, "arive", T("2026-12-10"));
    expect(l3).toMatchObject({ closed: true, history: [{ milestone: "Processing" }, { milestone: "Funded" }] });
    const c = (await contacts.list({ ownerUserId: "lo1" })).contacts;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ provenance: "own_closings", relationship: "past_client", loan: { closedOn: "2026-12-10", amount: 400000, noteRate: 6.5 } });
  });

  it("learns the loan officer's pace and flags late stages, expiring locks and closings without clear-to-close", () => {
    const hist = (days: number) => [{ milestone: "Processing", at: "2026-01-01T00:00:00Z" }, { milestone: "Underwriting", at: new Date(Date.parse("2026-01-01T00:00:00Z") + days * 86400000).toISOString() }];
    const done = [2, 3, 4].map((d) => ({ history: hist(d), closed: true } as unknown as Loan));
    expect(learnPace(done)).toEqual({ processing: 3 });
    const loan = { id: "l", borrowerName: "Ann Lee", milestone: "Processing", milestoneAt: "2026-11-10T18:00:00Z", agentName: "Pat", keyDates: { application: null, lockExpires: "2026-11-20", appraisal: null, clearToClose: null, closing: "2026-11-20" }, closed: false, dead: false, history: [] } as unknown as Loan;
    const kinds = alertsFor(loan, { processing: 3 }, T("2026-11-18")).map((a) => a.kind);
    expect(kinds).toEqual(["late", "lock", "closing"]);
    expect(alertsFor({ ...loan, closed: true }, {}, T("2026-11-18"))).toEqual([]);
    expect(alertsFor({ ...loan, milestoneAt: "2026-11-17T18:00:00Z", keyDates: { ...loan.keyDates, lockExpires: null, closing: null } }, { processing: 3 }, T("2026-11-18"))).toEqual([]);
  });

  it("issues keys that only work as given", async () => {
    const k = await createKey("lo1", "ARIVE");
    expect(await ownerForKey(k)).toBe("lo1");
    expect(await ownerForKey(k.slice(0, -1) + (k.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await ownerForKey(null)).toBeNull();
  });
});
