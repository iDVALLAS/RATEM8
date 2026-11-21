import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryCampaignStore, setCampaignStoreForTests } from "@/lib/campaigns/store";
import { MemoryTouchStore, setTouchStoreForTests, touchStore } from "@/lib/messaging/store";
import { gateFor } from "@/lib/messaging/service";
import { parseCsv } from "./csv";
import { checkExisting, finishImport, importPeople, listImports, MemoryImportStore, setImportStoreForTests, startImport, undoImport } from "./imports";
import { buildRecords, type ImportRecord } from "./mapping";
import { applyImport, classify, sameFirstName, undoSnapshot } from "./reimport";
import { consentBadge, importBatch, recordConsent, summarize, unlockAllHeld } from "./service";
import { mergeRecords, smartMap } from "./smart";
import { MemoryContactStore, NeonContactStore, setContactStoreForTests, type Contact } from "./store";
import { mergedTag, POSSIBLE_DUPLICATE_TAG } from "./tags";

const user = (id: string, role: User["role"], extra: Partial<User> = {}): User => ({ id, email: `${id}@x.com`, name: id, role, mloId: "mlo-001", status: "active", createdAt: "2026-11-18T00:00:00Z", createdBy: "t", ...extra });
const rec = (over: Partial<ImportRecord> = {}): ImportRecord => ({ firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [], ...over });
const contact = (over: Partial<Contact> = {}): Contact => ({
  ...rec(),
  id: "c_existing01",
  ownerUserId: "lo1",
  kind: "contact",
  provenance: "personal",
  locked: false,
  source: "import: old.csv",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");
const later = (min: number) => new Date(TUE_10AM_PT.getTime() + min * 60_000);

describe("people you already have: fill blanks or the newer information (D75)", () => {
  const old = contact({ firstName: "Ann", lastName: "Lee", street: "1 Old Rd", city: null, state: "WA", zip: "98101", notes: "Met at church.", loan: { closedOn: "2020-01-02", amount: 300000, noteRate: null }, dnc: { onList: false, checkedAt: "2026-11-01T00:00:00Z", source: "Registry" }, line: { type: "mobile", carrier: null, checkedAt: "2026-11-01T00:00:00Z" }, rnd: null, provenance: "prior_employer", locked: true, tags: ["vip"] });
  const row = rec({ firstName: "Annie", lastName: "Lee-Park", street: "9 New Ave", city: "Bothell", state: "OR", zip: "97201", notes: "Refi interest.", leadSource: "Zillow", loan: { closedOn: "2024-05-06", amount: 450000, noteRate: 6.5 }, tags: ["Imported Nov 21, 2026"] });

  it("only fills blanks by default, field by field", () => {
    const { next, changed } = applyImport(old, row, "fill", { at: "2026-11-21T00:00:00.000Z" });
    expect(next).toMatchObject({ firstName: "Ann", lastName: "Lee", street: "1 Old Rd", city: "Bothell", state: "WA", zip: "98101", notes: "Met at church.", leadSource: "Zillow" });
    expect(next.loan).toEqual({ closedOn: "2020-01-02", amount: 300000, noteRate: 6.5 });
    expect(changed.sort()).toEqual(["city", "leadSource", "loan"]);
    expect(next.tags).toEqual(["vip", "Imported Nov 21, 2026"]);
  });

  it("“newer” overwrites name, address and loan fields and adds the notes", () => {
    const { next, changed } = applyImport(old, row, "newer", { at: "2026-11-21T00:00:00.000Z" });
    expect(next).toMatchObject({ firstName: "Annie", lastName: "Lee-Park", street: "9 New Ave", city: "Bothell", state: "OR", zip: "97201", notes: "Met at church.\nRefi interest." });
    expect(next.loan).toEqual({ closedOn: "2024-05-06", amount: 450000, noteRate: 6.5 });
    expect(changed).toEqual(expect.arrayContaining(["firstName", "lastName", "street", "city", "state", "zip", "notes", "loan", "leadSource"]));
    // The same notes again aren't added twice.
    expect(applyImport(next, row, "newer", { at: "2026-11-22T00:00:00.000Z" }).next.notes).toBe("Met at church.\nRefi interest.");
    // A blank in the file never wipes a value.
    expect(applyImport(old, rec({ firstName: "", lastName: "", street: null }), "newer", { at: "2026-11-21T00:00:00.000Z" }).next).toMatchObject({ firstName: "Ann", lastName: "Lee", street: "1 Old Rd" });
  });

  it("never touches phone checks, the hold, provenance, phone or email, in either mode", () => {
    for (const mode of ["fill", "newer"] as const) {
      const { next } = applyImport(old, rec({ ...row, phone: "+12065550000", email: "other@x.com" }), mode, { at: "2026-11-21T00:00:00.000Z" });
      expect(next.dnc).toEqual(old.dnc);
      expect(next.line).toEqual(old.line);
      expect(next.rnd).toBeNull();
      expect(next).toMatchObject({ provenance: "prior_employer", locked: true, phone: "+12065551234", email: "ann@x.com", phone2: "+12065550000" });
    }
  });

  it("consent is never overwritten: a stop stays a stop and a “yes” from a file never replaces stronger proof", async () => {
    const store = new MemoryContactStore();
    setContactStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setImportStoreForTests(new MemoryImportStore());
    try {
      const lo = user("lo1", "lo");
      await importBatch(lo, "contacts", [rec()], "a.csv", "personal", TUE_10AM_PT);
      const ann = (await store.list({})).contacts[0];
      await recordConsent(lo, ann.id, { channel: "text", purpose: "service", granted: false, evidence: "revoked", proof: "said stop" }, later(1));
      await recordConsent(lo, ann.id, { channel: "email", purpose: "marketing", granted: true, evidence: "written", proof: "signed form" }, later(1));
      const before = await store.consents(ann.id);
      for (const mode of ["fill", "newer"] as const) {
        const run = await startImport(lo, { kind: "contacts", files: ["b.csv"], provenance: "personal", mode, tags: [] }, later(2));
        await importBatch(lo, "contacts", [rec({ attestedOptIns: ["text", "email"], firstName: "Annie" })], "b.csv", "personal", later(2), { importId: run.id, mode });
      }
      const s = summarize(await store.consents(ann.id));
      expect(s.text.service).toMatchObject({ granted: false, evidence: "revoked" });
      expect(s.email.marketing).toMatchObject({ granted: true, evidence: "written", proof: "signed form" });
      expect((await store.consents(ann.id)).slice(0, before.length)).toEqual(before);
      expect((await gateFor(lo, (await store.get(ann.id))!, "text", "service", later(3))).allowed).toBe(false);
    } finally {
      setContactStoreForTests(null);
      setAccountStoreForTests(null);
      setTouchStoreForTests(null);
      setImportStoreForTests(null);
    }
  });
});

describe("matching: who a row is (D75)", () => {
  it("first names: equal, blank, or the start of the other", () => {
    expect(sameFirstName("Ann", "ann")).toBe(true);
    expect(sameFirstName("", "Bob")).toBe(true);
    expect(sameFirstName("Rob", "Robert")).toBe(true);
    expect(sameFirstName("Ann", "Bob")).toBe(false);
  });

  it("spouses sharing a phone are kept separate in the files by default, and can be merged", () => {
    const csv = parseCsv("Name,Mobile,Email\nAnn Lee,(206) 555-1234,ann@x.com\nBob Lee,(206) 555-1234,bob@x.com\nAnn Lee,(206) 555-1234,\n");
    const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts", { fileName: "family.csv" });
    const tag = mergedTag(new Date("2026-11-21T20:00:00Z"));
    const m = mergeRecords([records], { refs: ["f1"], mergedTag: tag });
    expect(m.records.map((r) => r.firstName).sort()).toEqual(["Ann", "Bob"]);
    expect(m.merged).toBe(1);
    const spouses = m.pairs.find((p) => p.b.name === "Bob Lee")!;
    expect(spouses).toMatchObject({ possible: true, merged: false, shared: "phone", a: { file: "family.csv", row: 2 }, b: { row: 3 } });
    const twice = m.pairs.find((p) => p.b.name === "Ann Lee")!;
    expect(twice).toMatchObject({ possible: false, merged: true });
    expect(m.records.find((r) => r.firstName === "Ann")!.tags).toContain(tag);
    expect(m.records.find((r) => r.firstName === "Bob")!.tags).not.toContain(tag);
    // "Keep separate" and "Merge them" both stick.
    expect(mergeRecords([records], { refs: ["f1"], decide: { [twice.key]: false } }).records).toHaveLength(3);
    expect(mergeRecords([records], { refs: ["f1"], decide: { [spouses.key]: true } }).records).toHaveLength(1);
  });

  it("a book's person sharing only a phone with a different first name is someone else; two matches are a possible duplicate", () => {
    const ann = contact({ id: "c_ann0000001", firstName: "Ann", email: "ann@x.com" });
    const bob = contact({ id: "c_bob0000001", firstName: "Bob", email: "bob@x.com", phone: "+12065559999" });
    expect(classify(rec({ firstName: "Bob", email: null }), [ann]).kind).toBe("shares");
    expect(classify(rec({ firstName: "Annie", email: null }), [ann]).kind).toBe("existing");
    const two = classify(rec({ firstName: "Ann", email: "bob@x.com" }), [ann, bob]);
    expect(two).toMatchObject({ kind: "possible", contact: { id: "c_bob0000001" }, by: "email" });
    expect(classify(rec({ firstName: "Bob", email: null, matchTo: "c_ann0000001" }), [ann]).kind).toBe("existing");
    expect(classify(rec({ matchTo: "new" }), [ann]).kind).toBe("new");
  });

  it("the spouses case end to end: both imported as their own people, and a re-import merges each into the right one", async () => {
    const store = new MemoryContactStore();
    setContactStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
    setImportStoreForTests(new MemoryImportStore());
    try {
      const lo = user("lo1", "lo");
      const csv = parseCsv("Name,Mobile\nAnn Lee,(206) 555-1234\nBob Lee,(206) 555-1234\n");
      const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts", { fileName: "family.csv" });
      const m = mergeRecords([records], { refs: ["f1"] });
      const run = await startImport(lo, { kind: "contacts", files: ["family.csv"], provenance: "personal", mode: "fill", tags: [] }, TUE_10AM_PT);
      expect(await importBatch(lo, "contacts", m.records, "family.csv", "personal", TUE_10AM_PT, { importId: run.id })).toMatchObject({ created: 2, merged: 0 });
      const checks = await checkExisting(lo, m.records);
      expect(checks.map((c) => c.kind)).toEqual(["existing", "existing"]);
      expect(checks.map((c) => c.matches[0].name).sort()).toEqual(["Ann Lee", "Bob Lee"]);
      expect(await importBatch(lo, "contacts", m.records, "family.csv", "personal", later(1))).toMatchObject({ created: 0, merged: 2 });
      expect((await store.list({})).total).toBe(2);
    } finally {
      setContactStoreForTests(null);
      setAccountStoreForTests(null);
      setImportStoreForTests(null);
    }
  });
});

describe("imports: counts, file names, history and undo (D75)", () => {
  let store: MemoryContactStore;
  let campaigns: MemoryCampaignStore;
  beforeEach(() => {
    store = new MemoryContactStore();
    campaigns = new MemoryCampaignStore();
    setContactStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setImportStoreForTests(new MemoryImportStore());
    setCampaignStoreForTests(campaigns);
  });
  afterEach(() => {
    setContactStoreForTests(null);
    setAccountStoreForTests(null);
    setTouchStoreForTests(null);
    setImportStoreForTests(null);
    setCampaignStoreForTests(null);
  });

  it("the preview's counts are honest: new, already yours, and what each choice would change", async () => {
    const lo = user("lo1", "lo");
    await importBatch(lo, "contacts", [rec(), rec({ firstName: "Bo", lastName: "Park", email: "bo@x.com", phone: "+14255552222", city: "Seattle" })], "a.csv", "personal", TUE_10AM_PT);
    const c = await checkExisting(lo, [rec({ city: "Bothell" }), rec({ firstName: "Bo", lastName: "Park", email: "bo@x.com", phone: "+14255552222", city: "Tacoma" }), rec({ firstName: "Cy", email: "cy@x.com", phone: "+12535557777" })]);
    expect(c.map((x) => x.kind)).toEqual(["existing", "existing", "new"]);
    expect(c[0]).toMatchObject({ fill: ["Address"], newer: ["Address"] });
    expect(c[1]).toMatchObject({ fill: [], newer: ["Address"] });
    // Another loan officer's book is never matched.
    expect((await checkExisting(user("lo2", "lo"), [rec()]))[0].kind).toBe("new");
  });

  it("a contact's source and its opt-in proof name the real file, not “2 files”", async () => {
    const lo = user("lo1", "lo");
    await importBatch(lo, "contacts", [rec({ sourceFile: "Past clients.xlsx", attestedOptIns: ["text"] })], "2 files", "personal", TUE_10AM_PT);
    const c = (await store.list({})).contacts[0];
    expect(c.source).toBe("import: Past clients.xlsx");
    expect((await store.consents(c.id)).every((e) => e.proof === "opt-in column in Past clients.xlsx")).toBe(true);
    expect(c).not.toHaveProperty("sourceRow");
    expect(c).not.toHaveProperty("matchTo");
  });

  it("a row matching two different people fills blanks in one and tags it “Possible duplicate”", async () => {
    const lo = user("lo1", "lo");
    await importBatch(lo, "contacts", [rec({ email: "ann@x.com", phone: "+12065551234" }), rec({ firstName: "Ann", lastName: "Lee", email: "ann.lee@work.com", phone: "+12065550000" })], "a.csv", "personal", TUE_10AM_PT);
    const r = await importBatch(lo, "contacts", [rec({ email: "ann.lee@work.com", phone: "+12065551234", city: "Kent" })], "b.csv", "personal", later(1), { mode: "newer" });
    expect(r).toMatchObject({ created: 0, merged: 1, possible: 1 });
    expect((await store.list({ tag: POSSIBLE_DUPLICATE_TAG })).total).toBe(1);
  });

  it("undo deletes only the untouched people it created, restores the snapshots, and never undoes a stop", async () => {
    const lo = user("lo1", "lo");
    // Already in the book before the import.
    await importBatch(lo, "contacts", [rec({ firstName: "Dee", lastName: "Old", email: "dee@x.com", phone: "+12065550001", city: "Seattle", tags: ["vip"] })], "old.csv", "personal", TUE_10AM_PT);
    const dee0 = (await store.list({ q: "dee" })).contacts[0];
    const run = await startImport(lo, { kind: "contacts", files: ["new.csv"], provenance: "personal", mode: "newer", tags: ["Imported Nov 17, 2026"] }, later(1));
    const rows = [
      rec({ firstName: "Ann", email: "ann@x.com", phone: "+12065550002", attestedOptIns: ["text"], tags: ["Imported Nov 17, 2026"], sourceFile: "new.csv" }),
      rec({ firstName: "Bo", email: "bo@x.com", phone: "+12065550003", tags: ["Imported Nov 17, 2026"], sourceFile: "new.csv" }),
      rec({ firstName: "Cy", email: "cy@x.com", phone: "+12065550004", optOuts: { text: "new.csv column SMS Opt Out" }, tags: ["Imported Nov 17, 2026"], sourceFile: "new.csv" }),
      rec({ firstName: "Eve", email: "eve@x.com", phone: "+12065550005", tags: ["Imported Nov 17, 2026"], sourceFile: "new.csv" }),
      rec({ firstName: "Dee", lastName: "New", email: "dee@x.com", phone: "+12065550001", city: "Tacoma", attestedOptIns: ["email"], tags: ["Imported Nov 17, 2026"], sourceFile: "new.csv" }),
    ];
    const res = await importBatch(lo, "contacts", rows, "new.csv", "personal", later(1), { importId: run.id, mode: "newer" });
    expect(res).toMatchObject({ created: 4, merged: 1, updated: 1, optedOut: 1 });
    const fin = await finishImport(lo, run.id, { inFile: 0, skipped: 2, skippedCsv: "File,Row,Reason\nnew.csv,7,no phone or email\n" }, later(2));
    expect(fin).toMatchObject({ people: 5, withPhone: 5 });
    expect((await store.list({ importId: run.id })).total).toBe(5);
    const byName = async (n: string) => (await store.list({ q: n.toLowerCase() })).contacts[0];
    // Since the import: Bo was texted, Eve said stop, Dee's notes were edited by hand (state stays the import's).
    const bo = await byName("bo@x.com");
    await touchStore().add({ id: "t1", contactId: bo.id, ownerUserId: "lo1", channel: "text", purpose: "service", direction: "out", body: "Hi", status: "sent", providerId: null, note: null, at: later(3).toISOString(), actor: "lo1@x.com" });
    const eve = await byName("eve@x.com");
    await recordConsent(lo, eve.id, { channel: "text", purpose: "service", granted: false, evidence: "revoked", proof: "said stop" }, later(3));
    const dee1 = await byName("dee@x.com");
    expect(dee1).toMatchObject({ firstName: "Dee", lastName: "New", city: "Tacoma" });
    await store.put({ ...dee1, lastName: "Hand-edited" });
    const ann = await byName("ann@x.com");
    const annLog = await store.consents(ann.id);
    await campaigns.putEnrollment({ id: "en_1", campaignId: "cp_1", ownerUserId: "lo1", contactId: ann.id, status: "active", stepIndex: 0, nextAt: later(60).toISOString(), startedAt: later(3).toISOString(), endedAt: null, reason: "", log: [] });
    const cyLog = (await store.consents((await byName("cy@x.com")).id)).length;
    const deeLog = (await store.consents(dee0.id)).length;

    const out = await undoImport(lo, run.id, later(10));
    expect(out).toEqual({ ok: true, done: true, result: { deleted: 1, restored: 1, kept: 3, keptStops: 2, keptTouched: 1 } });
    // Ann (untouched) is gone; her consent log stays exactly as it was (append-only), and her campaign stopped.
    expect(await store.get(ann.id)).toBeNull();
    expect(await store.consents(ann.id)).toEqual(annLog);
    expect((await campaigns.getEnrollment("en_1"))?.status).toBe("stopped");
    // Bo (messaged), Cy (the file's stop) and Eve (a stop since) stay; the stops stay stops.
    for (const n of ["bo@x.com", "cy@x.com", "eve@x.com"]) expect(await byName(n), n).toBeTruthy();
    const cy = await byName("cy@x.com");
    expect(consentBadge(summarize(await store.consents(cy.id)))).toBe("revoked");
    expect((await store.consents(cy.id)).length).toBe(cyLog);
    expect(consentBadge(summarize(await store.consents(eve.id)))).toBe("revoked");
    expect((await gateFor(lo, cy, "text", "service", later(11))).allowed).toBe(false);
    // Dee is put back (city, tags), except the last name edited by hand since.
    const dee2 = await store.get(dee0.id);
    expect(dee2).toMatchObject({ firstName: "Dee", lastName: "Hand-edited", city: "Seattle" });
    expect(dee2!.tags).toEqual(["vip"]);
    expect(dee2!.imports ?? []).toEqual([]);
    // The import's own email "yes" on Dee is taken back with a new entry; nothing is removed.
    const deeAfter = await store.consents(dee0.id);
    expect(deeAfter.length).toBeGreaterThan(deeLog);
    expect(summarize(deeAfter).email.service).toMatchObject({ granted: false, evidence: "attested" });
    // Once only; the history says what happened.
    expect(await undoImport(lo, run.id, later(11))).toEqual({ ok: false, error: "undone" });
    const [h] = await listImports(lo);
    expect(h).toMatchObject({ id: run.id, files: ["new.csv"], counts: { created: 0, skipped: 2 }, undone: { deleted: 1, restored: 1, kept: 3 } });
    expect(h.skippedCsv).toMatch(/^File,Row,Reason/);
  });

  it("an undone import's “yes” doesn't block the right file later", async () => {
    const lo = user("lo1", "lo");
    await importBatch(lo, "contacts", [rec()], "a.csv", "personal", TUE_10AM_PT);
    const run = await startImport(lo, { kind: "contacts", files: ["b.csv"], provenance: "personal", mode: "fill", tags: [] }, later(1));
    await importBatch(lo, "contacts", [rec({ attestedOptIns: ["text"] })], "b.csv", "personal", later(1), { importId: run.id });
    await undoImport(lo, run.id, later(2));
    const ann = (await store.list({})).contacts[0];
    expect(summarize(await store.consents(ann.id)).text.service.granted).toBe(false);
    await importBatch(lo, "contacts", [rec({ attestedOptIns: ["text"] })], "c.csv", "personal", later(3));
    expect(summarize(await store.consents(ann.id)).text.service).toMatchObject({ granted: true, evidence: "attested" });
  });

  it("undo is for 30 days, in the import's own book; an assistant works in the officer's book", async () => {
    const lo = user("lo1", "lo");
    const asst = user("as1", "assistant", { assistsUserId: "lo1" });
    const run = await startImport(asst, { kind: "contacts", files: ["a.csv"], provenance: "personal", mode: "fill", tags: [] }, TUE_10AM_PT);
    expect(run.owner).toBe("lo1");
    await importBatch(asst, "contacts", [rec()], "a.csv", "personal", TUE_10AM_PT, { importId: run.id });
    expect(await importPeople(lo, run.id)).toHaveLength(1);
    expect(await importPeople(user("lo2", "lo"), run.id)).toHaveLength(0);
    expect(await undoImport(user("lo2", "lo"), run.id, later(1))).toEqual({ ok: false, error: "gone" });
    expect(await undoImport(asst, run.id, new Date(TUE_10AM_PT.getTime() + 31 * 86_400_000))).toEqual({ ok: false, error: "expired" });
    expect(await undoImport(asst, run.id, later(5))).toMatchObject({ ok: true, result: { deleted: 1 } });
    expect((await store.list({})).total).toBe(0);
  });

  it("undoSnapshot leaves a field the loan officer changed since", () => {
    const { next } = applyImport(contact({ city: "Seattle", tags: ["vip"] }), rec({ city: "Tacoma", tags: ["x"] }), "newer", { importId: "imp_abcdefgh", at: "2026-11-21T00:00:00.000Z" });
    expect(undoSnapshot({ ...next, city: "Kent" }, "imp_abcdefgh", "2026-11-22T00:00:00.000Z")).toMatchObject({ next: { city: "Kent", tags: ["vip"] }, restored: [] });
    expect(undoSnapshot(next, "imp_other000", "2026-11-22T00:00:00.000Z")).toBeNull();
  });

  it("the messy fixture re-imported: nobody doubled, every merge reported", async () => {
    const lo = user("lo1", "lo");
    const csv = parseCsv(readFileSync(join(process.cwd(), "tests/fixtures/import/past-clients-messy.csv"), "utf8"));
    const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts", { fileName: "past-clients-messy.csv" });
    const m = mergeRecords([records], { refs: ["f1"] });
    expect(m.pairs.filter((p) => p.merged)).toHaveLength(m.merged);
    const first = await importBatch(lo, "contacts", m.records, "past-clients-messy.csv", "personal", TUE_10AM_PT);
    const checks = await checkExisting(lo, m.records);
    expect(checks.filter((c) => c.kind === "existing")).toHaveLength(first.created);
    expect(await importBatch(lo, "contacts", m.records, "past-clients-messy.csv", "personal", later(1))).toMatchObject({ created: 0, merged: first.created });
  });
});

describe("releasing held lists (D75)", () => {
  afterEach(() => {
    setContactStoreForTests(null);
    setAccountStoreForTests(null);
  });

  it("unlockAll releases more than 500 people at once, in the loan officer's own book only", async () => {
    const store = new MemoryContactStore();
    setContactStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
    for (let i = 0; i < 620; i++) await store.put(contact({ id: `c_held${String(i).padStart(6, "0")}`, phone: `+1206555${String(i).padStart(4, "0")}`, email: null, locked: true }));
    await store.put(contact({ id: "c_otherbook01", ownerUserId: "lo2", locked: true }));
    expect(await store.countLocked("lo1")).toBe(620);
    expect(await unlockAllHeld(user("lo1", "lo"), "attested")).toBe(620);
    expect(await store.countLocked("lo1")).toBe(0);
    expect(await store.countLocked("lo2")).toBe(1);
  });

  it("in Neon it's one UPDATE for the whole book, and imports are found by id", async () => {
    const seen: { text: string; params: unknown[] }[] = [];
    const neon = new NeonContactStore(async (text, params = []) => {
      seen.push({ text, params });
      return /count\(\*\)/.test(text) ? [{ n: 742 }] : [];
    });
    expect(await neon.unlockAll("lo1", "2026-11-21T00:00:00.000Z")).toBe(742);
    const upd = seen.find((q) => /UPDATE cc_contacts/.test(q.text))!;
    expect(upd.text).toMatch(/WHERE owner_user_id = \$1 AND body->>'locked' = 'true'/);
    expect(upd.text).not.toMatch(/LIMIT/);
    expect(upd.params).toEqual(["lo1", "2026-11-21T00:00:00.000Z"]);
    await neon.byImport("lo1", "imp_abcdefgh");
    expect(seen.at(-1)!.text).toMatch(/body->>'importId' = \$2 OR body->'imports' @> \$3::jsonb/);
    expect(seen.at(-1)!.params).toEqual(["lo1", "imp_abcdefgh", JSON.stringify([{ id: "imp_abcdefgh" }])]);
    await neon.remove("c_x", { keepConsents: true });
    expect(seen.some((q) => /DELETE FROM cc_consents/.test(q.text))).toBe(false);
  });
});
