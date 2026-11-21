import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { buildRecords, type ImportRecord } from "./mapping";
import { smartMap } from "./smart";
import { MemoryContactStore, setContactStoreForTests } from "./store";
import { canSee, consentBadge, importBatch, ImportRefused, recordConsent, summarize } from "./service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { gateFor } from "@/lib/messaging/service";

const user = (id: string, role: User["role"], extra: Partial<User> = {}): User => ({ id, email: `${id}@x.com`, name: id, role, mloId: "mlo-001", status: "active", createdAt: "2026-11-18T00:00:00Z", createdBy: "t", ...extra });
const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");
const rec = (over: Partial<ImportRecord> = {}): ImportRecord => ({ firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [], ...over });
const OPT_OUT_HEADERS = ["SMS Opt Out", "Text Opt-Out", "Opted Out of SMS", "Email Opt-Out", "Call Opt Out", "Do Not Text", "Do Not Call", "DND", "Unsubscribed", "Opted Out"];

describe("importing opt-outs, assistants' imports, repeat imports (D69)", () => {
  let store: MemoryContactStore;
  beforeEach(() => {
    store = new MemoryContactStore();
    setContactStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
    setTouchStoreForTests(new MemoryTouchStore());
  });
  afterEach(() => {
    setContactStoreForTests(null);
    setAccountStoreForTests(null);
    setTouchStoreForTests(null);
  });

  it("a yes in any opt-out column is a revocation, and the gate then refuses a service text", async () => {
    const lo = user("lo1", "lo");
    // Permission to text first (the loan officer's word), so the refusal below is the opt-out's doing.
    await importBatch(lo, "contacts", [rec({ attestedOptIns: ["text"] })], "a.csv", "personal", TUE_10AM_PT);
    const ann = (await store.list({})).contacts[0];
    expect((await gateFor(lo, ann, "text", "service", TUE_10AM_PT)).allowed).toBe(true);
    for (const h of OPT_OUT_HEADERS) {
      const csv = parseCsv(`Name,Mobile,Email,Text Opt In,${h}\nAnn Lee,(206) 555-1234,ann@x.com,Y,Yes\n`);
      const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts", { fileName: "bonzo.csv" });
      // The opt-in next to it is dropped for the channel stopped (an email-only stop leaves texts alone).
      if (h === "Email Opt-Out") expect(records[0].optOuts).toEqual({ email: `bonzo.csv column ${h}` });
      else expect(records[0].attestedOptIns, h).not.toContain("text");
      const s2 = new MemoryContactStore();
      setContactStoreForTests(s2);
      const r = await importBatch(lo, "contacts", [rec({ attestedOptIns: ["text", "email"] })], "a.csv", "personal", TUE_10AM_PT);
      expect(r.optedOut).toBe(0);
      expect((await importBatch(lo, "contacts", records, "bonzo.csv", "personal", new Date(TUE_10AM_PT.getTime() + 60_000))).optedOut, h).toBe(1);
      const c = (await s2.list({})).contacts[0];
      const log = await s2.consents(c.id);
      expect(consentBadge(summarize(log)), h).toBe("revoked");
      const revoked = log.filter((e) => !e.granted);
      expect(revoked.length, h).toBeGreaterThan(0);
      expect(revoked.every((e) => e.evidence === "revoked" && e.proof === `import: bonzo.csv column ${h}`), h).toBe(true);
      const channel = h === "Email Opt-Out" ? "email" : "text";
      expect((await gateFor(lo, c, channel, "service", new Date(TUE_10AM_PT.getTime() + 120_000))).allowed, h).toBe(false);
    }
  });

  it("revokes every phone channel and purpose for a text stop, the way a stop on the contact page does", async () => {
    const lo = user("lo1", "lo");
    const csv = parseCsv(readFileSync(join(process.cwd(), "tests/fixtures/import/bonzo-optout.csv"), "utf8"));
    const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts", { fileName: "bonzo-optout.csv" });
    expect(await importBatch(lo, "contacts", records, "bonzo-optout.csv", "personal")).toMatchObject({ created: 2, optedOut: 1 });
    const all = (await store.list({})).contacts;
    const pat = all.find((c) => c.firstName === "Pat")!;
    const lou = all.find((c) => c.firstName === "Lou")!;
    const s = summarize(await store.consents(pat.id));
    for (const ch of ["call", "ai_call", "text"] as const) for (const p of ["service", "marketing"] as const) expect(s[ch][p].evidence).toBe("revoked");
    expect(s.email.service.evidence).toBeNull();
    expect(consentBadge(s)).toBe("revoked");
    expect(consentBadge(summarize(await store.consents(lou.id)))).toBe("relationship");
  });

  it("a re-import doesn't add the same answer twice, and an import's yes never undoes a stop or stronger proof", async () => {
    const lo = user("lo1", "lo");
    const stop = rec({ optOuts: { text: "a.csv column SMS Opt Out" } });
    await importBatch(lo, "contacts", [stop], "a.csv");
    const id = (await store.list({})).contacts[0].id;
    const n = (await store.consents(id)).length;
    expect(n).toBe(6); // 3 phone channels x 2 purposes
    await importBatch(lo, "contacts", [stop], "a.csv");
    expect((await store.consents(id)).length).toBe(n);
    // A later file says they opted in: the stop stands.
    await importBatch(lo, "contacts", [rec({ attestedOptIns: ["text"] })], "b.csv");
    expect(consentBadge(summarize(await store.consents(id)))).toBe("revoked");
    // Written permission isn't replaced by an import's "your word".
    await recordConsent(lo, id, { channel: "email", purpose: "marketing", granted: true, evidence: "written", proof: "signed form" });
    await importBatch(lo, "contacts", [rec({ attestedOptIns: ["email"] })], "c.csv");
    expect(summarize(await store.consents(id)).email.marketing.evidence).toBe("written");
  });

  it("an assistant's import lands in their loan officer's book", async () => {
    const lo = user("lo1", "lo");
    const asst = user("as1", "assistant", { assistsUserId: "lo1" });
    expect(await importBatch(asst, "contacts", [rec()], "a.csv")).toMatchObject({ created: 1 });
    const [c] = (await store.list({})).contacts;
    expect(c.ownerUserId).toBe("lo1");
    expect(canSee(lo, c)).toBe(true);
    expect(canSee(asst, c)).toBe(true);
    // The same person again is found in that book, not added twice.
    expect(await importBatch(asst, "contacts", [rec({ city: "Bothell" })], "b.csv")).toMatchObject({ created: 0, merged: 1 });
    expect(await importBatch(lo, "contacts", [rec()], "c.csv")).toMatchObject({ created: 0, merged: 1 });
  });

  it("an assistant with no loan officer is refused in plain words", async () => {
    const asst = user("as2", "assistant", { assistsUserId: null });
    await expect(importBatch(asst, "contacts", [rec()], "a.csv")).rejects.toBeInstanceOf(ImportRefused);
    expect((await store.list({})).total).toBe(0);
  });

  it("a 61-character tag is clamped and the batch goes through", async () => {
    const lo = user("lo1", "lo");
    const csv = parseCsv(readFileSync(join(process.cwd(), "tests/fixtures/import/longtag.csv"), "utf8"));
    const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts");
    expect(records[0].tags.every((t) => t.length <= 60)).toBe(true);
    expect(await importBatch(lo, "contacts", records, "longtag.csv")).toMatchObject({ created: 1 });
  });
});
